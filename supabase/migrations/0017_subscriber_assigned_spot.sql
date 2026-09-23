-- =============================================================================
-- ESPACIO FIJO ASIGNADO A ABONADOS (KRD PARK)
--
-- Revisé el esquema existente antes de crear nada: no había ninguna columna
-- equivalente a "espacio"/"parking_space"/"assigned_space" en subscribers,
-- ni relación alguna entre subscribers y parking_spots. Se agrega una sola
-- columna nueva, nullable (los abonados existentes quedan "sin espacio
-- asignado" — nada se inventa automáticamente).
--
-- Dos conceptos separados, tal como se pidió:
--   - ASIGNADO: subscribers.assigned_spot_id (persiste mientras el abonado
--     siga activo, sin importar si el vehículo está physically adentro).
--   - OCUPADO: parking_spots.status (ya existente, se sigue liberando en
--     cada salida exactamente igual que hoy — register_vehicle_exit() no
--     se toca).
-- =============================================================================

alter table public.subscribers
  add column assigned_spot_id uuid references public.parking_spots(id);

create index ix_subscribers_assigned_spot on public.subscribers(assigned_spot_id)
  where assigned_spot_id is not null;

-- -----------------------------------------------------------------------------
-- Exclusividad: dos abonados EFECTIVAMENTE activos (estado ACTIVO y no
-- vencido por fecha) no pueden compartir el mismo espacio asignado. No se
-- puede resolver con un índice único estático porque "vencido" depende de
-- la fecha de hoy (cambia todos los días sin que nadie edite la fila) — el
-- mismo motivo por el que "POR_VENCER"/"VENCIDO" en este proyecto siempre
-- se calculan, nunca se guardan. Por eso es un trigger, no un índice: así
-- la regla se aplica tanto si el ADMIN edita desde /abonados (INSERT/UPDATE
-- directo, RLS-gated) como desde cualquier otro camino futuro — nunca se
-- confía solamente en la interfaz.
-- -----------------------------------------------------------------------------

create or replace function public.fn_check_subscriber_spot_exclusive()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conflict record;
  v_spot_code text;
begin
  if new.assigned_spot_id is null then
    return new;
  end if;

  -- Una fila que en sí misma no está efectivamente activa no reclama
  -- exclusividad sobre su espacio (permite, por ejemplo, guardar un
  -- CANCELADO histórico con su antiguo assigned_spot_id sin bloquear a
  -- nadie).
  if new.estado <> 'ACTIVO' or new.fecha_vencimiento < public.today_lima() then
    return new;
  end if;

  select s.id, s.plate into v_conflict
  from public.subscribers s
  where s.assigned_spot_id = new.assigned_spot_id
    and s.id is distinct from new.id
    and s.estado = 'ACTIVO'
    and s.fecha_vencimiento >= public.today_lima()
  limit 1;

  if found then
    select code into v_spot_code from public.parking_spots where id = new.assigned_spot_id;
    raise exception 'El espacio % ya está asignado a un abonado activo.', v_spot_code;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_subscribers_spot_exclusive on public.subscribers;
create trigger trg_subscribers_spot_exclusive
  before insert or update of assigned_spot_id, estado, fecha_vencimiento
  on public.subscribers
  for each row execute function public.fn_check_subscriber_spot_exclusive();

-- =============================================================================
-- register_vehicle_entry(): si la placa es de un abonado activo CON espacio
-- asignado, el espacio a ocupar es SIEMPRE el suyo — sin importar qué
-- espacio haya tocado el colaborador en la grilla (nunca se confía en el
-- p_spot_id que manda el cliente para este caso). Además, ningún vehículo
-- con OTRA placa puede entrar al espacio reservado de un abonado activo,
-- ni siquiera si está físicamente libre.
-- =============================================================================

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
  v_effective_spot_id uuid;
  v_reserved_plate text;
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

  -- El espacio efectivo: si es abonado con espacio propio, ese espacio
  -- manda siempre, sin importar qué haya tocado el colaborador.
  if v_subscriber.id is not null and v_subscriber.assigned_spot_id is not null then
    v_effective_spot_id := v_subscriber.assigned_spot_id;
  else
    v_effective_spot_id := p_spot_id;
  end if;

  select * into v_spot from public.parking_spots where id = v_effective_spot_id for update;
  if not found then
    raise exception 'El estacionamiento seleccionado no existe.';
  end if;
  if v_spot.status = 'OCUPADO' then
    raise exception 'El estacionamiento % ya está ocupado.', v_spot.code;
  end if;

  -- Un espacio reservado para un abonado activo no admite otra placa,
  -- aunque esté físicamente libre en este momento.
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
    v_plate, p_vehicle_type, v_effective_spot_id, auth.uid(), v_entry_at, 'ACTIVO',
    v_subscriber.id, v_subscriber.id is not null, v_flat_reserved, v_flat_price,
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

-- Firma sin cambios: no hace falta reemplazar grants.

-- Fuerza a PostgREST a refrescar su caché de esquema inmediatamente.
notify pgrst, 'reload schema';
