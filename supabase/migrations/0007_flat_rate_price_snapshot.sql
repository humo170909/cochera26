-- =============================================================================
-- PARKING ADMIN - Migración 0007
-- CORRECCIÓN: una visita reservada con TARIFA PLANA terminaba cobrándose
-- por hora (ej. S/3.50 en vez de S/15.00).
--
-- Causa raíz (dos problemas, uno técnico y uno de diseño):
--   1. register_vehicle_exit() releía flat_rate_settings.precio (el precio
--      ACTUAL) en el momento de la salida, en vez de usar el precio vigente
--      al momento del ingreso. Viola la regla de histórico: si el admin
--      cambia la tarifa plana mientras el vehículo está adentro, no debe
--      afectar a esa visita.
--   2. register_vehicle_exit() re-evaluaba si la tarifa plana "seguía
--      aplicando" (hora límite/día) al momento de salir, y si no, caía a
--      tarifa por hora. Esto es exactamente lo que NO se quiere: una vez
--      reservada al ingreso, la modalidad de tarifa queda fija para toda
--      la visita, sin importar cuánto tiempo pase o qué hora sea al salir.
--
-- Fix: el PRECIO de tarifa plana ahora también se fotografía al ingreso
-- (igual que ya se hacía con tariff_applied en tarifa por hora), y la
-- salida deja de recalcular NADA cuando flat_rate_reserved = true: usa
-- directamente esa fotografía.
-- =============================================================================

alter table public.vehicle_entries
  add column flat_rate_price_snapshot numeric(10,2);

comment on column public.vehicle_entries.flat_rate_price_snapshot is
  'Precio de tarifa plana vigente AL MOMENTO DEL INGRESO (si flat_rate_reserved). '
  'La salida SIEMPRE usa este valor, nunca vuelve a leer flat_rate_settings.precio.';

-- Backfill defensivo: si ya existen ingresos activos reservados con tarifa
-- plana de antes de esta migración (sin fotografía todavía), se les asigna
-- el precio actual como mejor aproximación disponible. Nuevos ingresos ya
-- quedan con la fotografía correcta desde el momento en que se registran.
update public.vehicle_entries
set flat_rate_price_snapshot = (select precio from public.flat_rate_settings where id = true)
where flat_rate_reserved = true and flat_rate_price_snapshot is null;

-- =============================================================================
-- RPC: INGRESO DE VEHÍCULO — ahora también fotografía el precio y valida
-- horario/día ANTES de reservar el cupo (antes solo validaba que la
-- modalidad estuviera activa, no que el horario fuera válido).
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
set search_path = public
as $$
declare
  v_plate text := upper(trim(p_plate));
  v_spot public.parking_spots;
  v_entry public.vehicle_entries;
  v_entry_at timestamptz := now();
  v_subscriber public.subscribers;
  v_flat public.flat_rate_settings;
  v_active_flat_count integer;
  v_flat_reserved boolean := false;
  v_flat_price numeric(10,2);
begin
  if not public.is_active_staff() then
    raise exception 'No tienes permisos para realizar esta acción.';
  end if;

  if v_plate is null or length(v_plate) < 5 then
    raise exception 'La placa ingresada no es válida.';
  end if;

  if exists (
    select 1 from public.vehicle_entries
    where plate = v_plate and status = 'ACTIVO'
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

  v_subscriber := public.find_active_subscriber(v_plate, v_entry_at);

  if p_use_flat_rate and v_subscriber.id is null then
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
    subscriber_id, covered_by_subscription, flat_rate_reserved, flat_rate_price_snapshot
  ) values (
    v_plate, p_vehicle_type, p_spot_id, auth.uid(), v_entry_at, 'ACTIVO',
    v_subscriber.id, v_subscriber.id is not null, v_flat_reserved, v_flat_price
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
      'abonado', v_subscriber.id is not null,
      'tarifa_plana_reservada', v_flat_reserved, 'tarifa_plana_precio', v_flat_price
    )
  );

  return v_entry;
end;
$$;

-- =============================================================================
-- RPC: SALIDA DE VEHÍCULO + COBRO — la tarifa reservada al ingreso queda
-- FIJA para toda la visita. Cero recálculo, cero re-evaluación de
-- elegibilidad, cero dependencia de la configuración actual.
-- =============================================================================

create or replace function public.register_vehicle_exit(
  p_entry_id uuid,
  p_payment_method public.payment_method,
  p_tariff_type public.tariff_type default 'HORA'
)
returns public.vehicle_exits
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry public.vehicle_entries;
  v_spot public.parking_spots;
  v_tariff public.tariffs;
  v_settings public.tariff_settings;
  v_exit_at timestamptz := now();
  v_fee record;
  v_effective_type public.tariff_type;
  v_tariff_base numeric(10,2);
  v_tolerance integer;
  v_minutes integer;
  v_amount numeric(10,2);
  v_exit public.vehicle_exits;
  v_register public.cash_registers;
  v_concept text;
begin
  if not public.is_active_staff() then
    raise exception 'No tienes permisos para realizar esta acción.';
  end if;

  select * into v_entry from public.vehicle_entries
    where id = p_entry_id and status = 'ACTIVO' for update;
  if not found then
    raise exception 'No existe un ingreso activo para este vehículo.';
  end if;

  select * into v_spot from public.parking_spots where id = v_entry.parking_spot_id for update;

  v_minutes := greatest(0, ceil(extract(epoch from (v_exit_at - v_entry.entry_at)) / 60.0))::integer;

  if v_entry.covered_by_subscription then
    if p_payment_method is not null then
      raise exception 'Este vehículo está cubierto por un abono activo y no requiere método de pago.';
    end if;
    v_effective_type := 'ABONADO';
    v_tariff_base := 0;
    v_tolerance := null;
    v_amount := 0;

  elsif v_entry.flat_rate_reserved then
    -- Fotografía tomada al ingreso: se respeta tal cual, sin excepciones.
    if v_entry.flat_rate_price_snapshot is null then
      raise exception 'Este ingreso quedó marcado con tarifa plana pero no tiene un precio registrado. Contacta al administrador antes de cobrar.';
    end if;
    if p_payment_method is null then
      raise exception 'Debe seleccionar un método de pago.';
    end if;

    v_effective_type := 'PLANA';
    v_tariff_base := v_entry.flat_rate_price_snapshot;
    v_tolerance := null;
    v_amount := v_entry.flat_rate_price_snapshot;

  else
    select * into v_tariff from public.tariffs
      where vehicle_type = v_entry.vehicle_type and active = true;
    if not found then
      raise exception 'No hay una tarifa configurada para este tipo de vehículo.';
    end if;
    if p_payment_method is null then
      raise exception 'Debe seleccionar un método de pago.';
    end if;

    select * into v_settings from public.tariff_settings where id = true;

    select * into v_fee from public.calculate_hourly_fee(
      v_tariff.price_per_hour, v_entry.entry_at, v_exit_at,
      v_settings.tolerancia_corta_minutos, v_settings.tolerancia_larga_minutos,
      v_settings.umbral_larga_horas
    );

    v_effective_type := 'HORA';
    v_tariff_base := v_tariff.price_per_hour;
    v_tolerance := v_fee.tolerance_applied;
    v_amount := v_fee.amount;
  end if;

  select * into v_register from public.cash_registers
    where business_date = public.today_lima() and status = 'ABIERTA';
  if not found then
    raise exception 'No hay una caja abierta. Debe aperturar caja antes de cobrar.';
  end if;

  insert into public.vehicle_exits (
    entry_id, exit_at, duration_minutes, tariff_applied, amount, payment_method,
    registered_by, tariff_type, tolerance_minutes_applied
  ) values (
    p_entry_id, v_exit_at, v_minutes, v_tariff_base, v_amount, p_payment_method,
    auth.uid(), v_effective_type, v_tolerance
  ) returning * into v_exit;

  -- Orden explícito (igual que antes, sin cambios): cobrar -> registrar
  -- salida -> liberar estacionamiento -> liberar cupo de tarifa plana
  -- (flat_rate_reserved solo importaba mientras status='ACTIVO'; al pasar
  -- a FINALIZADO dejar de contar para get_flat_rate_capacity() de forma
  -- automática, sin tocar la columna).
  update public.vehicle_entries set status = 'FINALIZADO' where id = p_entry_id;
  update public.parking_spots set status = 'LIBRE', current_entry_id = null where id = v_entry.parking_spot_id;

  if v_amount > 0 then
    v_concept := (case v_effective_type when 'PLANA' then 'Cobro tarifa plana ' else 'Cobro estacionamiento ' end)
      || v_spot.code || ' - placa ' || v_entry.plate;

    insert into public.cash_movements (
      cash_register_id, type, source, concept, amount, payment_method, reference_id, registered_by
    ) values (
      v_register.id, 'INGRESO', 'VEHICULO', v_concept, v_amount, p_payment_method, v_exit.id, auth.uid()
    );
  end if;

  insert into public.audit_log (user_id, action, entity_type, entity_id, details)
  values (
    auth.uid(), 'SALIDA_VEHICULO_COBRO', 'vehicle_exits', v_exit.id::text,
    jsonb_build_object(
      'placa', v_entry.plate, 'estacionamiento', v_spot.code, 'minutos', v_minutes,
      'tipo_tarifa', v_effective_type, 'tolerancia_aplicada', v_tolerance,
      'monto', v_amount, 'metodo_pago', p_payment_method
    )
  );

  return v_exit;
end;
$$;

revoke execute on function public.register_vehicle_entry(text, public.vehicle_type, uuid, boolean) from public;
grant execute on function public.register_vehicle_entry(text, public.vehicle_type, uuid, boolean) to authenticated;

revoke execute on function public.register_vehicle_exit(uuid, public.payment_method, public.tariff_type) from public;
grant execute on function public.register_vehicle_exit(uuid, public.payment_method, public.tariff_type) to authenticated;

-- Fuerza a PostgREST a refrescar su caché de esquema inmediatamente, en vez
-- de esperar a que lo detecte por su cuenta. Inofensivo, recomendado por
-- Supabase después de cambios DDL vía SQL Editor.
notify pgrst, 'reload schema';
