-- =============================================================================
-- FIX: un abonado ACTIVO estaba recibiendo ticket de ingreso si entraba
-- después de su hora_limite.
--
-- CAUSA RAÍZ (localizada, no parcheada a ciegas):
--
-- El sistema tiene DOS lugares que deciden "¿esta placa es abonado
-- activo?", y hasta ahora usaban reglas DISTINTAS:
--
--   1. lookup_plate_status() — el preview en vivo que ve el colaborador
--      mientras escribe la placa en /ingreso (vía usePlateStatusLookup).
--      Su CASE solo mira estado y fecha_vencimiento: NUNCA miró
--      hora_limite. Por eso el colaborador veía "🟢 ABONADO ACTIVO" sin
--      importar la hora.
--
--   2. find_active_subscriber() — la que de verdad usa
--      register_vehicle_entry() para decidir si la visita es gratis.
--      Esta SÍ exige `hora_actual <= hora_limite` (regla explícita del
--      proyecto: un abonado puede tener un plan "diurno" que solo cubre
--      entradas hasta cierta hora). Si el abonado entraba después de su
--      hora_limite, esta función devolvía NULL — v_subscriber quedaba
--      vacío — y register_vehicle_entry() lo trataba como cliente normal
--      para TODO efecto: cobro Y ticket.
--
-- Entonces no era un bug aislado del modal de impresión: el colaborador
-- veía "ABONADO ACTIVO" en el preview, registraba el ingreso confiando en
-- eso, y el backend — con una regla distinta — igual generaba ticket
-- (consistente con que también lo iba a cobrar como cliente normal en la
-- salida). El preview y el backend estaban desalineados.
--
-- DECISIÓN DE ALCANCE (pedido explícito del usuario, solo sobre el
-- ticket): "ABONADO ACTIVO = SIN TICKET" sin importar la hora. Esto NO
-- toca el cobro: find_active_subscriber() y la lógica de
-- covered_by_subscription en register_vehicle_exit() siguen exactamente
-- igual, con hora_limite intacta — un abonado que entra después de su
-- hora_limite sigue sin cubrirse la visita (se le sigue cobrando tarifa
-- por hora si así está definido el plan), solo que ya NO se le imprime un
-- ticket físico por ello. Si en algún momento también se quiere que ese
-- caso sea 100% gratis (no solo sin ticket), eso es un cambio aparte al
-- cobro que no se hizo acá porque no fue lo pedido.
--
-- Fix: nueva función has_active_subscription() — misma condición de
-- "abonado activo" que ya usa el preview (estado + rango de fechas), SIN
-- hora_limite — y register_vehicle_entry() la usa para decidir si emite
-- ticket, en vez de basarse en si find_active_subscriber() encontró match.
-- =============================================================================

create or replace function public.has_active_subscription(p_plate text, p_at timestamptz)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.subscribers
    where plate_normalizada = public.normalize_plate(p_plate)
      and estado = 'ACTIVO'
      and fecha_inicio <= (p_at at time zone 'America/Lima')::date
      and fecha_vencimiento >= (p_at at time zone 'America/Lima')::date
  );
$$;

comment on function public.has_active_subscription(text, timestamptz) is
  'Misma definición de "abonado activo" que ve el colaborador en el preview de /ingreso (estado + vigencia de fechas, SIN hora_limite). Se usa únicamente para decidir si se emite ticket — el cobro real lo sigue decidiendo find_active_subscriber(), que sí respeta hora_limite.';

revoke execute on function public.has_active_subscription(text, timestamptz) from public;

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
  v_has_active_subscription boolean;
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
  -- activo (find_active_subscriber respeta hora_limite: gobierna el
  -- COBRO). Un vehículo autorizado nunca consulta ni consume el abono.
  select * into v_authorized from public.authorized_vehicles
    where plate_normalizada = v_plate_norm and estado = 'ACTIVO';

  if v_authorized.id is null then
    v_subscriber := public.find_active_subscriber(v_plate_norm, v_entry_at);
  end if;

  -- Elegibilidad de TICKET: abonado activo sin importar hora_limite (ver
  -- cabecera del archivo). No sustituye a v_subscriber para el cobro.
  v_has_active_subscription := public.has_active_subscription(v_plate_norm, v_entry_at);

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

  -- Ticket de ingreso: NUNCA para autorizado ni para abonado activo (sin
  -- importar hora_limite — ver cabecera). Cubre HORA y PLANA, las dos
  -- únicas modalidades que pueden llegar hasta acá.
  if v_authorized.id is null and not v_has_active_subscription then
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

-- Firma sin cambios: no hace falta reemplazar grants de register_vehicle_entry.

-- Fuerza a PostgREST a refrescar su caché de esquema inmediatamente.
notify pgrst, 'reload schema';
