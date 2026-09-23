-- =============================================================================
-- FIX CRÍTICO: un abonado ACTIVO estaba pagando S/3.50 en la salida.
--
-- CAUSA RAÍZ (localizada, no parcheada a ciegas):
--
-- El cobro en la salida NO se calcula en tiempo real a partir del abono —
-- se lee de una fotografía tomada al INGRESO: vehicle_entries.
-- covered_by_subscription. register_vehicle_exit() nunca recalcula esto
-- (por diseño: "cambiar una tarifa nunca recalcula cobros pasados"), solo
-- hace `elsif v_entry.covered_by_subscription then ... monto = 0 ... else
-- calcular tarifa por hora`.
--
-- Esa fotografía la toma register_vehicle_entry(), y hasta esta migración
-- salía de find_active_subscriber(p_plate, p_at) — que exige
-- `hora_actual <= hora_limite` del plan del abonado. Si el abonado
-- entraba después de su hora_limite, find_active_subscriber() devolvía
-- vacío, covered_by_subscription quedaba en FALSE, y esa entrada quedaba
-- marcada como cliente normal para SIEMPRE (el snapshot no se corrige
-- después) — de ahí el S/3.50 en la salida, sin importar que el abonado
-- siguiera vigente.
--
-- Es la MISMA causa raíz que ya se corrigió en 0015 para el ticket
-- (find_active_subscriber vs. el preview de /ingreso, que nunca miró
-- hora_limite) — ahí se optó por no tocar el cobro porque no se había
-- pedido. Ahora sí se pide explícitamente: "la condición de abonado NO
-- depende de la hora del día", tanto para el ticket como para el cobro.
--
-- FIX: quitar la condición de hora_limite de find_active_subscriber(), la
-- única función que decide subscriber_id/covered_by_subscription al
-- ingreso. Con esto:
--   - register_vehicle_entry() vuelve a poder usar v_subscriber.id
--     directamente para decidir el ticket (igual que hacía antes de 0015,
--     ahora correcto sin hora_limite) — así que se retira
--     has_active_subscription() de 0015, que ya queda redundante: no hay
--     que mantener dos funciones que responden lo mismo.
--   - register_vehicle_exit() no se toca: ya confiaba en
--     covered_by_subscription para no cobrar, eso siempre estuvo bien.
--
-- IMPORTANTE — esto NO es retroactivo: una entrada que ya está ACTIVA
-- ahora mismo (registrada antes de correr esta migración) conserva la
-- fotografía que se tomó en su momento. Si hay un abonado actualmente
-- adentro que entró fuera de su hora_limite bajo la regla vieja, esa
-- visita específica va a seguir cobrando al salir — el fix aplica a
-- ingresos nuevos desde que se corre esta migración en adelante.
--
-- hora_limite NO se elimina de la base de datos ni del formulario de
-- abonados (columna, admin, tabla): sigue existiendo como dato
-- informativo/configurable, solo dejó de condicionar el cobro y el
-- ticket. No se pidió quitarla del todo.
-- =============================================================================

create or replace function public.find_active_subscriber(p_plate text, p_at timestamptz)
returns public.subscribers
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result public.subscribers;
begin
  if not public.is_active_staff() then
    raise exception 'No tienes permisos para realizar esta acción.';
  end if;

  select *
    into v_result
  from public.subscribers
  where plate_normalizada = public.normalize_plate(p_plate)
    and estado = 'ACTIVO'
    and fecha_inicio <= (p_at at time zone 'America/Lima')::date
    and fecha_vencimiento >= (p_at at time zone 'America/Lima')::date
  order by fecha_vencimiento desc
  limit 1;

  return v_result;
end;
$$;

-- register_vehicle_entry: vuelve a decidir el ticket con v_subscriber.id
-- (ya no hace falta has_active_subscription, que quedó redundante).
create or replace function public.register_vehicle_entry(
  p_plate text,
  p_vehicle_type public.vehicle_type,
  p_spot_id uuid,
  p_use_flat_rate boolean default false
)
returns public.vehicle_entries
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_plate text := upper(trim(p_plate));
  v_plate_norm text := public.normalize_plate(p_plate);
  v_spot public.parking_spots;
  v_entry public.vehicle_entries;
  v_entry_at timestamptz := now();
  v_authorized public.authorized_vehicles;
  v_subscriber public.subscribers;
  v_flat public.flat_rate_settings;
  v_active_flat_count integer;
  v_flat_reserved boolean := false;
  v_flat_price numeric(10,2);
  v_hourly_tariff public.tariffs;
  v_ticket_tariff_type public.tariff_type;
  v_ticket_amount numeric(10,2);
  v_ticket_token text;
  v_ticket_code text;
  v_ticket_val_code text;
begin
  if not public.is_active_staff() then
    raise exception 'No tienes permisos para realizar esta acción.';
  end if;

  if v_plate is null or length(v_plate) < 5 then
    raise exception 'La placa ingresada no es válida.';
  end if;

  if exists (
    select 1 from public.vehicle_entries
    where plate_normalizada = v_plate_norm and status = 'ACTIVO'
  ) then
    raise exception 'Este vehículo ya se encuentra dentro de la cochera.';
  end if;

  select * into v_spot from public.parking_spots where id = p_spot_id for update;
  if not found then
    raise exception 'El estacionamiento seleccionado no existe.';
  end if;
  if v_spot.status = 'OCUPADO' then
    raise exception 'El estacionamiento % ya está ocupado.', v_spot.code;
  end if;

  insert into public.vehicles (plate, vehicle_type)
  values (v_plate, p_vehicle_type)
  on conflict (plate) do update set vehicle_type = excluded.vehicle_type;

  -- Prioridad 1: vehículo autorizado (estado ACTIVO). Prioridad 2: abonado
  -- activo — find_active_subscriber ya NO depende de hora_limite (ver
  -- cabecera): un abonado vigente cubre la visita a cualquier hora. Un
  -- vehículo autorizado nunca consulta ni consume el abono.
  select * into v_authorized from public.authorized_vehicles
    where plate_normalizada = v_plate_norm and estado = 'ACTIVO';

  if v_authorized.id is null then
    v_subscriber := public.find_active_subscriber(v_plate_norm, v_entry_at);
  end if;

  if p_use_flat_rate and v_authorized.id is null and v_subscriber.id is null then
    perform pg_advisory_xact_lock(hashtext('flat_rate_reservation'));

    select * into v_flat from public.flat_rate_settings where id = true;
    if v_flat is null or not v_flat.activo then
      raise exception 'La tarifa plana no está disponible actualmente.';
    end if;

    if not (extract(dow from (v_entry_at at time zone 'America/Lima'))::integer = any (v_flat.dias_aplicacion))
       or (v_entry_at at time zone 'America/Lima')::time > v_flat.hora_limite
    then
      raise exception 'La tarifa plana no está disponible en este horario.';
    end if;

    select count(*) into v_active_flat_count
    from public.vehicle_entries
    where flat_rate_reserved = true and status = 'ACTIVO';

    if v_active_flat_count >= v_flat.cupo_maximo then
      raise exception 'Tarifa plana completa: % / % vehículos. No hay cupos disponibles.',
        v_active_flat_count, v_flat.cupo_maximo;
    end if;

    v_flat_reserved := true;
    v_flat_price := v_flat.precio;
  end if;

  insert into public.vehicle_entries (
    plate, vehicle_type, parking_spot_id, registered_by, entry_at, status,
    subscriber_id, covered_by_subscription, flat_rate_reserved, flat_rate_price_snapshot,
    authorized_vehicle_id, is_authorized
  ) values (
    v_plate, p_vehicle_type, p_spot_id, auth.uid(), v_entry_at, 'ACTIVO',
    v_subscriber.id, v_subscriber.id is not null, v_flat_reserved, v_flat_price,
    v_authorized.id, v_authorized.id is not null
  )
  returning * into v_entry;

  update public.parking_spots
  set status = 'OCUPADO', current_entry_id = v_entry.id
  where id = p_spot_id;

  insert into public.audit_log (user_id, action, entity_type, entity_id, details)
  values (
    auth.uid(), 'INGRESO_VEHICULO', 'vehicle_entries', v_entry.id::text,
    jsonb_build_object(
      'placa', v_plate, 'tipo', p_vehicle_type, 'estacionamiento', v_spot.code,
      'autorizado', v_authorized.id is not null,
      'abonado', v_subscriber.id is not null, 'tarifa_plana_reservada', v_flat_reserved
    )
  );

  -- Ticket de ingreso: NUNCA para autorizado ni para abonado activo. Cubre
  -- HORA y PLANA, las dos únicas modalidades que pueden llegar hasta acá.
  if v_authorized.id is null and v_subscriber.id is null then
    if v_flat_reserved then
      v_ticket_tariff_type := 'PLANA';
      v_ticket_amount := v_flat_price;
    else
      select * into v_hourly_tariff from public.tariffs
        where vehicle_type = p_vehicle_type and active = true;
      v_ticket_tariff_type := 'HORA';
      v_ticket_amount := coalesce(v_hourly_tariff.price_per_hour, 0);
    end if;

    v_ticket_token := encode(gen_random_bytes(20), 'hex');
    v_ticket_val_code := 'KRD-' || upper(substr(v_ticket_token, 1, 4)) || '-' || upper(substr(v_ticket_token, 5, 4));
    v_ticket_code := 'KRD-' || to_char(v_entry_at at time zone 'America/Lima', 'YYYYMMDD') || '-'
      || lpad(nextval('public.entry_tickets_seq')::text, 5, '0');

    insert into public.entry_tickets (
      entry_id, ticket_code, validation_code, validation_token,
      plate, parking_spot_id, vehicle_type, tariff_type, tariff_amount,
      status, issued_at, issued_by
    ) values (
      v_entry.id, v_ticket_code, v_ticket_val_code, v_ticket_token,
      v_plate, p_spot_id, p_vehicle_type, v_ticket_tariff_type, v_ticket_amount,
      'ACTIVE', v_entry_at, auth.uid()
    );

    insert into public.audit_log (user_id, action, entity_type, entity_id, details)
    values (
      auth.uid(), 'TICKET_CREATED', 'entry_tickets', v_entry.id::text,
      jsonb_build_object('placa', v_plate, 'ticket_code', v_ticket_code, 'tipo_tarifa', v_ticket_tariff_type)
    );
  end if;

  return v_entry;
end;
$$;

-- has_active_subscription() (0015) queda redundante: find_active_subscriber
-- ahora responde exactamente lo mismo. Nada más la usaba.
drop function if exists public.has_active_subscription(text, timestamptz);

-- Firmas sin cambios: no hace falta reemplazar grants.

-- Fuerza a PostgREST a refrescar su caché de esquema inmediatamente.
notify pgrst, 'reload schema';
