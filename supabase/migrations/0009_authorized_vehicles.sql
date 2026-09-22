-- =============================================================================
-- PARKING ADMIN - Migración 0009
-- VEHÍCULO AUTORIZADO / DUEÑO: ocupa espacio, tiene cronómetro, registra
-- ingreso/salida e historial — pero NUNCA genera cobro ni movimiento de caja.
--
-- Ejecutar DESPUÉS de 0008_authorized_vehicle_enum.sql (en una ejecución
-- separada). Requiere que 'AUTORIZADO' ya exista como valor de tariff_type.
--
-- Decisiones de diseño:
--   1. Modalidad independiente de ABONADO (tariff_type = 'AUTORIZADO', no
--      'ABONADO'), tabla propia authorized_vehicles, nunca se mezclan.
--   2. Prioridad de identificación al ingreso: 1) vehículo autorizado,
--      2) abonado activo, 3) cliente normal. Si una placa está autorizada
--      Y además tiene abono activo, gana la autorización (no se cobra, no
--      se consume el abono) — el admin ve una advertencia al registrar la
--      autorización si ya existe un abono activo para esa placa.
--   3. Un vehículo autorizado INACTIVO no debe bloquear la detección de un
--      abono activo para la misma placa: la búsqueda de "autorizado"
--      solo considera filas con estado = 'ACTIVO', igual que un abonado
--      vencido no debe bloquear la detección de cliente normal.
--   4. No se borra físicamente ninguna autorización: se desactiva
--      (estado = 'INACTIVO'), igual que el resto del sistema.
--   5. La regla "no genera movimiento de caja" se cumple de forma natural:
--      register_vehicle_exit() ya solo inserta en cash_movements cuando
--      v_amount > 0, y AUTORIZADO siempre tiene amount = 0 — no hace falta
--      lógica especial para "no tocar caja".
-- =============================================================================

-- =============================================================================
-- TABLA: VEHÍCULOS AUTORIZADOS
-- =============================================================================

create table public.authorized_vehicles (
  id uuid primary key default gen_random_uuid(),
  plate text not null,
  propietario text not null,
  vehicle_type public.vehicle_type not null default 'AUTO',
  telefono text,
  estado text not null default 'ACTIVO' check (estado in ('ACTIVO', 'INACTIVO')),
  observaciones text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id)
);
comment on table public.authorized_vehicles is
  'Placas autorizadas a ingresar sin cobro (dueño / vehículos de la empresa). No es un abonado.';
create unique index ux_authorized_vehicles_plate on public.authorized_vehicles(upper(plate));
create index ix_authorized_vehicles_estado on public.authorized_vehicles(estado);

create trigger trg_authorized_vehicles_updated_at before update on public.authorized_vehicles
  for each row execute function public.fn_set_updated_at();
create trigger trg_audit_authorized_vehicles after insert or update on public.authorized_vehicles
  for each row execute function public.fn_audit_row_change();

-- =============================================================================
-- EXTENSIÓN DE vehicle_entries: enlace a autorización (si aplica)
-- =============================================================================

alter table public.vehicle_entries
  add column authorized_vehicle_id uuid references public.authorized_vehicles(id),
  add column is_authorized boolean not null default false;

create index ix_vehicle_entries_authorized_active
  on public.vehicle_entries(is_authorized)
  where status = 'ACTIVO' and is_authorized = true;

-- =============================================================================
-- payment_method / tariff_type: AUTORIZADO también cobra S/0 sin método de
-- pago, igual que ABONADO (misma naturaleza: "sin cobro").
-- =============================================================================

alter table public.vehicle_exits drop constraint chk_vehicle_exits_payment_method;

alter table public.vehicle_exits add constraint chk_vehicle_exits_payment_method check (
  (tariff_type in ('ABONADO', 'AUTORIZADO') and payment_method is null)
  or (tariff_type not in ('ABONADO', 'AUTORIZADO') and payment_method is not null)
);

-- =============================================================================
-- RLS
-- =============================================================================

alter table public.authorized_vehicles enable row level security;

-- Todo el staff activo puede consultar (lo necesita el trabajador al
-- ingreso). Solo ADMIN puede crear/editar/eliminar.
create policy p_authorized_vehicles_select on public.authorized_vehicles
  for select using (public.is_active_staff());
create policy p_authorized_vehicles_insert on public.authorized_vehicles
  for insert with check (public.is_admin());
create policy p_authorized_vehicles_update on public.authorized_vehicles
  for update using (public.is_admin()) with check (public.is_admin());
create policy p_authorized_vehicles_delete on public.authorized_vehicles
  for delete using (public.is_admin());

grant select on public.authorized_vehicles to authenticated;
grant insert, update, delete on public.authorized_vehicles to authenticated;

-- =============================================================================
-- RPC: lookup unificado para la pantalla de ingreso — prioridad
-- AUTORIZADO > ABONADO > (ninguno = cliente normal). Devuelve un conjunto
-- (0 o 1 filas): con RETURNS TABLE nunca hay ambigüedad de serialización
-- (ver 0006 — la causa del bug de "toda placa es abonado").
-- =============================================================================

create or replace function public.lookup_plate_status(p_plate text)
returns table (
  kind text,
  id uuid,
  nombre text,
  fecha_vencimiento date,
  display_status text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_plate text := upper(trim(p_plate));
begin
  if not public.is_active_staff() then
    raise exception 'No tienes permisos para realizar esta acción.';
  end if;

  return query
  select 'AUTORIZADO'::text, av.id, av.propietario, null::date, av.estado
  from public.authorized_vehicles av
  where upper(av.plate) = v_plate and av.estado = 'ACTIVO'
  limit 1;

  if found then
    return;
  end if;

  return query
  select
    'ABONADO'::text,
    s.id,
    s.nombre_completo,
    s.fecha_vencimiento,
    case
      when s.estado in ('SUSPENDIDO', 'CANCELADO') then s.estado::text
      when s.fecha_vencimiento < public.today_lima() then 'VENCIDO'
      else 'ACTIVO'
    end
  from public.subscribers s
  where upper(s.plate) = v_plate
  order by s.fecha_vencimiento desc
  limit 1;
end;
$$;

revoke execute on function public.lookup_plate_status(text) from public;
grant execute on function public.lookup_plate_status(text) to authenticated;

-- =============================================================================
-- RPC: INGRESO DE VEHÍCULO — detecta autorización ANTES que abono (prioridad
-- explícita). Un vehículo autorizado nunca reserva cupo de tarifa plana
-- (ya no se cobra por ningún medio).
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
  v_authorized public.authorized_vehicles;
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

  -- Prioridad 1: vehículo autorizado (estado ACTIVO). Prioridad 2: abonado
  -- activo. Un vehículo autorizado nunca consulta ni consume el abono.
  select * into v_authorized from public.authorized_vehicles
    where upper(plate) = v_plate and estado = 'ACTIVO';

  if v_authorized.id is null then
    v_subscriber := public.find_active_subscriber(v_plate, v_entry_at);
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

  return v_entry;
end;
$$;

-- =============================================================================
-- RPC: SALIDA DE VEHÍCULO + COBRO — AUTORIZADO cobra S/0, no pide método
-- de pago, y por construcción (v_amount = 0) no genera cash_movement.
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

  if v_entry.is_authorized then
    if p_payment_method is not null then
      raise exception 'Este vehículo está autorizado y no requiere método de pago.';
    end if;
    v_effective_type := 'AUTORIZADO';
    v_tariff_base := 0;
    v_tolerance := null;
    v_amount := 0;

  elsif v_entry.covered_by_subscription then
    if p_payment_method is not null then
      raise exception 'Este vehículo está cubierto por un abono activo y no requiere método de pago.';
    end if;
    v_effective_type := 'ABONADO';
    v_tariff_base := 0;
    v_tolerance := null;
    v_amount := 0;

  elsif v_entry.flat_rate_reserved then
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

  update public.vehicle_entries set status = 'FINALIZADO' where id = p_entry_id;
  update public.parking_spots set status = 'LIBRE', current_entry_id = null where id = v_entry.parking_spot_id;

  -- AUTORIZADO y ABONADO tienen v_amount = 0: nunca generan cash_movement.
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

-- =============================================================================
-- DASHBOARD: cuántos de los espacios ocupados AHORA son vehículos autorizados
-- =============================================================================

create or replace function public.get_dashboard_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_register public.cash_registers;
begin
  if not public.is_active_staff() then
    raise exception 'No tienes permisos para realizar esta acción.';
  end if;

  select * into v_register from public.cash_registers
    where business_date = public.today_lima() and status = 'ABIERTA';

  select jsonb_build_object(
    'total_espacios', (select count(*) from public.parking_spots),
    'disponibles', (select count(*) from public.parking_spots where status = 'LIBRE'),
    'ocupados', (select count(*) from public.parking_spots where status = 'OCUPADO'),
    'autorizados_ocupados', (
      select count(*) from public.vehicle_entries where is_authorized = true and status = 'ACTIVO'
    ),
    'vehiculos_dia', (
      select count(*) from public.vehicle_entries
      where public.lima_date(entry_at) = public.today_lima()
    ),
    'banos_dia', (
      select count(*) from public.restroom_uses
      where public.lima_date(used_at) = public.today_lima()
    ),
    'ingresos_dia', (
      coalesce((select sum(amount) from public.vehicle_exits where public.lima_date(exit_at) = public.today_lima()), 0)
      + coalesce((select sum(amount) from public.restroom_uses where public.lima_date(used_at) = public.today_lima()), 0)
    ),
    'egresos_dia', (
      select coalesce(sum(amount), 0) from public.cash_movements
      where type = 'EGRESO' and public.lima_date(occurred_at) = public.today_lima()
    ),
    'caja_abierta', v_register.id is not null,
    'caja_actual', case when v_register.id is not null then (
      v_register.opening_amount
      + coalesce((select sum(amount) from public.cash_movements where cash_register_id = v_register.id and type = 'INGRESO'), 0)
      - coalesce((select sum(amount) from public.cash_movements where cash_register_id = v_register.id and type = 'EGRESO'), 0)
    ) else 0 end
  ) into v_result;

  return v_result;
end;
$$;

revoke execute on function public.get_dashboard_snapshot() from public;
grant execute on function public.get_dashboard_snapshot() to authenticated;

notify pgrst, 'reload schema';
