-- =============================================================================
-- INGRESO SIMPLIFICADO: asignación automática de espacio (KRD PARK)
--
-- Auditoría previa (antes de escribir nada):
--   - Los 31 espacios (E01..E31) ya existen como filas fijas en
--     parking_spots desde 0001 — esta migración NO crea, elimina ni
--     renombra ningún espacio, solo cambia CÓMO se elige uno libre.
--   - register_vehicle_entry() ya recibía p_spot_id y ya tenía la lógica de
--     "el espacio del abonado manda siempre" (0017). Se extiende la MISMA
--     función (no una paralela) para que p_spot_id sea opcional: si se
--     omite (null), el propio backend elige el primer espacio LIBRE por
--     código — el frontend deja de tener que seleccionar nada, pero un
--     espacio explícito sigue funcionando si algún caller lo necesita.
--   - Concurrencia seguro: la elección automática usa
--     `FOR UPDATE SKIP LOCKED` sobre parking_spots — si dos ingresos llegan
--     casi al mismo tiempo, el segundo directamente SALTA la fila que el
--     primero ya bloqueó y toma la siguiente libre, en vez de esperar y
--     luego fallar o (peor) recibir el mismo espacio. Ningún control se
--     confía al frontend.
--   - Se excluyen del sorteo automático los espacios reservados a un
--     abonado activo DISTINTO de la placa que ingresa — reutiliza
--     exactamente la misma condición que ya usaba el chequeo posterior de
--     "espacio reservado", solo aplicada como filtro de candidatos.
--   - De paso (mismo archivo, mismo motivo raíz "no perder información al
--     usuario"): el mensaje de "placa ya tiene ingreso activo" ahora indica
--     el espacio donde está, tal como se pidió.
-- =============================================================================

create or replace function public.register_vehicle_entry(
  p_plate text,
  p_vehicle_type public.vehicle_type,
  p_spot_id uuid default null,
  p_use_flat_rate boolean default false,
  p_flat_rate_period public.tariff_type default null
)
returns public.vehicle_entries
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_plate text := upper(trim(p_plate));
  v_plate_norm text := public.normalize_plate(p_plate);
  v_active_spot_code text;
  v_spot public.parking_spots;
  v_effective_spot_id uuid;
  v_reserved_plate text;
  v_entry public.vehicle_entries;
  v_entry_at timestamptz := now();
  v_authorized public.authorized_vehicles;
  v_subscriber public.subscribers;
  v_flat public.flat_rate_settings;
  v_active_flat_count integer;
  v_flat_reserved boolean := false;
  v_flat_period public.tariff_type;
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

  select ps.code into v_active_spot_code
  from public.vehicle_entries ve
  join public.parking_spots ps on ps.id = ve.parking_spot_id
  where ve.plate_normalizada = v_plate_norm and ve.status = 'ACTIVO';

  if v_active_spot_code is not null then
    raise exception 'Este vehículo ya tiene un ingreso activo. Espacio asignado: %.', v_active_spot_code;
  end if;

  insert into public.vehicles (plate, vehicle_type)
  values (v_plate, p_vehicle_type)
  on conflict (plate) do update set vehicle_type = excluded.vehicle_type;

  -- Prioridad 1: vehículo autorizado (estado ACTIVO). Prioridad 2: abonado
  -- activo (sin depender de hora_limite, ver 0016). Un vehículo autorizado
  -- nunca consulta ni consume el abono.
  select * into v_authorized from public.authorized_vehicles
    where plate_normalizada = v_plate_norm and estado = 'ACTIVO';

  if v_authorized.id is null then
    v_subscriber := public.find_active_subscriber(v_plate_norm, v_entry_at);
  end if;

  if v_subscriber.id is not null and v_subscriber.assigned_spot_id is not null then
    -- Abonado con espacio fijo: ese manda siempre, sin importar p_spot_id
    -- ni la asignación automática.
    select * into v_spot from public.parking_spots where id = v_subscriber.assigned_spot_id for update;
    if not found then
      raise exception 'El espacio asignado al abonado no existe.';
    end if;
    if v_spot.status = 'OCUPADO' then
      raise exception 'El estacionamiento % ya está ocupado.', v_spot.code;
    end if;
    v_effective_spot_id := v_spot.id;

  elsif p_spot_id is not null then
    -- Espacio explícito (uso administrativo/compatibilidad): se respeta
    -- igual que antes.
    select * into v_spot from public.parking_spots where id = p_spot_id for update;
    if not found then
      raise exception 'El estacionamiento seleccionado no existe.';
    end if;
    if v_spot.status = 'OCUPADO' then
      raise exception 'El estacionamiento % ya está ocupado.', v_spot.code;
    end if;
    v_effective_spot_id := v_spot.id;

  else
    -- Asignación automática: primer espacio LIBRE por código (E01..E31),
    -- excluyendo los reservados a un abonado activo distinto de esta
    -- placa. SKIP LOCKED evita que dos ingresos concurrentes reciban el
    -- mismo espacio (el segundo salta la fila que el primero ya tomó).
    select ps.* into v_spot
    from public.parking_spots ps
    where ps.status = 'LIBRE'
      and not exists (
        select 1 from public.subscribers s
        where s.assigned_spot_id = ps.id
          and s.estado = 'ACTIVO'
          and s.fecha_vencimiento >= (v_entry_at at time zone 'America/Lima')::date
          and s.plate_normalizada <> v_plate_norm
      )
    order by ps.code
    for update skip locked
    limit 1;

    if not found then
      raise exception 'Estacionamiento completo: no hay espacios disponibles.';
    end if;
    v_effective_spot_id := v_spot.id;
  end if;

  -- Defensa adicional (ya cubierta arriba para la ruta automática, se
  -- conserva para la ruta de espacio explícito): un espacio reservado
  -- para un abonado activo no admite otra placa, aunque esté físicamente
  -- libre en este momento.
  select s.plate into v_reserved_plate
  from public.subscribers s
  where s.assigned_spot_id = v_effective_spot_id
    and s.estado = 'ACTIVO'
    and s.fecha_vencimiento >= (v_entry_at at time zone 'America/Lima')::date
    and s.plate_normalizada <> v_plate_norm
  limit 1;

  if found then
    raise exception 'El espacio % está reservado para el abonado con placa %.', v_spot.code, v_reserved_plate;
  end if;

  if p_use_flat_rate and v_authorized.id is null and v_subscriber.id is null then
    if p_flat_rate_period is null or p_flat_rate_period not in ('PLANA_DIA', 'PLANA_NOCHE') then
      raise exception 'Debes indicar si la tarifa plana es DÍA o NOCHE.';
    end if;

    perform pg_advisory_xact_lock(hashtext('flat_rate_reservation'));

    select * into v_flat from public.flat_rate_settings where id = true;
    if v_flat is null or not v_flat.activo then
      raise exception 'La tarifa plana no está disponible actualmente.';
    end if;

    if p_flat_rate_period = 'PLANA_DIA' then
      if not (extract(dow from (v_entry_at at time zone 'America/Lima'))::integer = any (v_flat.dias_aplicacion))
         or (v_entry_at at time zone 'America/Lima')::time > v_flat.hora_limite
      then
        raise exception 'La tarifa plana día no está disponible en este horario.';
      end if;
    end if;

    select count(*) into v_active_flat_count
    from public.vehicle_entries
    where flat_rate_reserved = true and status = 'ACTIVO';

    if v_active_flat_count >= v_flat.cupo_maximo then
      raise exception 'Tarifa plana completa: % / % vehículos. No hay cupos disponibles.',
        v_active_flat_count, v_flat.cupo_maximo;
    end if;

    v_flat_reserved := true;
    v_flat_period := p_flat_rate_period;
    v_flat_price := case when p_flat_rate_period = 'PLANA_NOCHE' then v_flat.precio_noche else v_flat.precio end;
  end if;

  insert into public.vehicle_entries (
    plate, vehicle_type, parking_spot_id, registered_by, entry_at, status,
    subscriber_id, covered_by_subscription, flat_rate_reserved, flat_rate_period, flat_rate_price_snapshot,
    authorized_vehicle_id, is_authorized
  ) values (
    v_plate, p_vehicle_type, v_effective_spot_id, auth.uid(), v_entry_at, 'ACTIVO',
    v_subscriber.id, v_subscriber.id is not null, v_flat_reserved, v_flat_period, v_flat_price,
    v_authorized.id, v_authorized.id is not null
  )
  returning * into v_entry;

  update public.parking_spots
  set status = 'OCUPADO', current_entry_id = v_entry.id
  where id = v_effective_spot_id;

  insert into public.audit_log (user_id, action, entity_type, entity_id, details)
  values (
    auth.uid(), 'INGRESO_VEHICULO', 'vehicle_entries', v_entry.id::text,
    jsonb_build_object(
      'placa', v_plate, 'tipo', p_vehicle_type, 'estacionamiento', v_spot.code,
      'autorizado', v_authorized.id is not null,
      'abonado', v_subscriber.id is not null, 'tarifa_plana_reservada', v_flat_reserved,
      'tarifa_plana_modalidad', v_flat_period
    )
  );

  -- Ticket de ingreso: NUNCA para autorizado ni para abonado activo. Cubre
  -- HORA y las dos modalidades de PLANA, las únicas que pueden llegar acá.
  if v_authorized.id is null and v_subscriber.id is null then
    if v_flat_reserved then
      v_ticket_tariff_type := v_flat_period;
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
      v_plate, v_effective_spot_id, p_vehicle_type, v_ticket_tariff_type, v_ticket_amount,
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

-- Firma sin cambios de tipos/orden respecto a 0023 (solo p_spot_id gana un
-- DEFAULT null): no hace falta DROP ni reemplazar grants.

notify pgrst, 'reload schema';
