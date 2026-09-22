-- =============================================================================
-- PARKING ADMIN - Migración 0003
-- Amplía el motor de tarifas: tolerancias configurables para tarifa por hora,
-- ABONADOS (mensualidad con hora límite de ingreso) y TARIFA PLANA (monto
-- fijo hasta una hora límite, seleccionable por el trabajador en el cobro).
--
-- NO destructivo: solo ALTER TABLE ADD COLUMN / CREATE TABLE / CREATE OR
-- REPLACE FUNCTION. Ejecutar completo en el SQL Editor de Supabase sobre un
-- proyecto que ya corrió 0001_init.sql y 0002_fix_audit_function.sql.
--
-- Decisiones de diseño explícitas (evitar fórmulas silenciosas, ver charla):
--   1. Piso mínimo de 1 hora facturada SIEMPRE para tarifa por hora, incluso
--      si la estadía cae dentro de la tolerancia corta. Evita cobros S/0.
--   2. TARIFA PLANA nunca se aplica automáticamente: el trabajador la elige
--      explícitamente en la pantalla de cobro, y el servidor solo la permite
--      si la hora de salida es <= hora_limite configurada (y el día aplica).
--      Aplicarla siempre que fuera elegible sobrecobraría visitas cortas.
--   3. ABONADO sí es 100% automático: se detecta en el INGRESO (placa con
--      abono ACTIVO, dentro de vigencia, y hora de ingreso <= hora_limite
--      del abonado). Si se detecta, la salida de ESE ingreso es siempre
--      gratuita (tariff_type='ABONADO'), sin importar qué pida el cliente.
--   4. "Hora límite" del abonado se guarda POR REGISTRO (fotografía al
--      momento del alta, precargada desde subscriber_plan_settings como
--      default editable), igual que el precio: si el admin cambia el
--      default mañana, los abonados ya existentes no cambian solos.
-- =============================================================================

-- =============================================================================
-- ENUMS
-- =============================================================================

create type public.tariff_type as enum ('HORA', 'ABONADO', 'PLANA');
create type public.subscriber_status as enum ('ACTIVO', 'VENCIDO', 'SUSPENDIDO', 'CANCELADO');

-- =============================================================================
-- CONFIGURACIÓN: TOLERANCIA DE TARIFA POR HORA (tabla singleton)
-- =============================================================================

create table public.tariff_settings (
  id boolean primary key default true check (id = true),
  tolerancia_corta_minutos integer not null default 5 check (tolerancia_corta_minutos >= 0),
  tolerancia_larga_minutos integer not null default 15 check (tolerancia_larga_minutos >= 0),
  umbral_larga_horas integer not null default 3 check (umbral_larga_horas >= 1),
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
comment on table public.tariff_settings is 'Fila única. Tolerancias globales aplicadas por calculate_hourly_fee().';
insert into public.tariff_settings (id) values (true);

-- =============================================================================
-- CONFIGURACIÓN: ABONADOS (defaults para nuevos registros, tabla singleton)
-- =============================================================================

create table public.subscriber_plan_settings (
  id boolean primary key default true check (id = true),
  precio_mensual numeric(10,2) not null default 180.00 check (precio_mensual > 0),
  hora_limite time not null default '08:00',
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
comment on table public.subscriber_plan_settings is 'Valores por defecto al crear un nuevo abonado. No afecta abonados existentes.';
insert into public.subscriber_plan_settings (id) values (true);

-- =============================================================================
-- CONFIGURACIÓN: TARIFA PLANA (tabla singleton)
-- =============================================================================

create table public.flat_rate_settings (
  id boolean primary key default true check (id = true),
  precio numeric(10,2) not null default 15.00 check (precio > 0),
  hora_limite time not null default '19:00',
  dias_aplicacion integer[] not null default '{0,1,2,3,4,5,6}', -- 0=domingo .. 6=sábado (extract(dow))
  activo boolean not null default true,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
comment on table public.flat_rate_settings is 'Tarifa plana: monto fijo si la SALIDA ocurre antes de hora_limite en un día habilitado.';
insert into public.flat_rate_settings (id) values (true);

-- =============================================================================
-- ABONADOS (subscribers)
-- =============================================================================

create table public.subscribers (
  id uuid primary key default gen_random_uuid(),
  nombre_completo text not null,
  documento text,
  telefono text,
  plate text not null,
  vehicle_type public.vehicle_type not null default 'AUTO',
  fecha_inicio date not null,
  fecha_vencimiento date not null,
  hora_limite time not null,
  monto numeric(10,2) not null check (monto > 0),
  estado public.subscriber_status not null default 'ACTIVO',
  observaciones text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_subscribers_dates check (fecha_vencimiento >= fecha_inicio)
);
comment on table public.subscribers is 'Clientes con abono mensual. hora_limite y monto son una fotografía por registro (no cambian si cambian los defaults).';
create index ix_subscribers_plate on public.subscribers(upper(plate));

create trigger trg_subscribers_updated_at before update on public.subscribers
  for each row execute function public.fn_set_updated_at();

-- =============================================================================
-- EXTENSIÓN DE vehicle_entries: enlace a abono (si aplica)
-- =============================================================================

alter table public.vehicle_entries
  add column subscriber_id uuid references public.subscribers(id),
  add column covered_by_subscription boolean not null default false;

-- =============================================================================
-- EXTENSIÓN DE vehicle_exits: fotografía completa de la tarifa aplicada
-- =============================================================================

alter table public.vehicle_exits
  add column tariff_type public.tariff_type not null default 'HORA',
  add column tolerance_minutes_applied integer;

-- payment_method pasa a ser opcional SOLO para salidas cubiertas por abono
-- (no hay cobro, no aplica método de pago).
alter table public.vehicle_exits alter column payment_method drop not null;

alter table public.vehicle_exits add constraint chk_vehicle_exits_payment_method check (
  (tariff_type = 'ABONADO' and payment_method is null)
  or (tariff_type <> 'ABONADO' and payment_method is not null)
);

-- =============================================================================
-- MOTOR DE TARIFAS: cálculo de tarifa por hora con tolerancia (única fuente
-- de verdad; register_vehicle_exit() es su único llamador transaccional).
-- =============================================================================

create or replace function public.calculate_hourly_fee(
  p_price_per_hour numeric,
  p_entry_at timestamptz,
  p_exit_at timestamptz,
  p_tolerance_short_minutes integer,
  p_tolerance_long_minutes integer,
  p_long_threshold_hours integer,
  out minutes integer,
  out hours_completed integer,
  out tolerance_applied integer,
  out billed_hours integer,
  out amount numeric
)
language plpgsql
immutable
as $$
declare
  v_remainder integer;
begin
  minutes := greatest(0, ceil(extract(epoch from (p_exit_at - p_entry_at)) / 60.0))::integer;
  hours_completed := floor(minutes / 60.0)::integer;
  v_remainder := minutes - hours_completed * 60;

  tolerance_applied := case
    when hours_completed >= p_long_threshold_hours then p_tolerance_long_minutes
    else p_tolerance_short_minutes
  end;

  billed_hours := case
    when v_remainder <= tolerance_applied then hours_completed
    else hours_completed + 1
  end;
  -- Piso mínimo de 1 hora: ninguna salida por tarifa-hora cobra S/0.
  billed_hours := greatest(billed_hours, 1);

  amount := round((p_price_per_hour * billed_hours)::numeric, 2);
end;
$$;

-- =============================================================================
-- Detección de abono activo aplicable a una placa en un instante dado.
-- =============================================================================

create or replace function public.find_active_subscriber(p_plate text, p_at timestamptz)
returns public.subscribers
language sql
stable
security definer
set search_path = public
as $$
  select *
  from public.subscribers
  where upper(plate) = upper(trim(p_plate))
    and estado = 'ACTIVO'
    and fecha_inicio <= (p_at at time zone 'America/Lima')::date
    and fecha_vencimiento >= (p_at at time zone 'America/Lima')::date
    and (p_at at time zone 'America/Lima')::time <= hora_limite
  order by fecha_vencimiento desc
  limit 1;
$$;

-- =============================================================================
-- RPC: INGRESO DE VEHÍCULO (reemplaza la versión anterior — misma firma,
-- ahora detecta automáticamente si la placa tiene un abono activo).
-- =============================================================================

create or replace function public.register_vehicle_entry(
  p_plate text,
  p_vehicle_type public.vehicle_type,
  p_spot_id uuid
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

  insert into public.vehicle_entries (
    plate, vehicle_type, parking_spot_id, registered_by, entry_at, status,
    subscriber_id, covered_by_subscription
  ) values (
    v_plate, p_vehicle_type, p_spot_id, auth.uid(), v_entry_at, 'ACTIVO',
    v_subscriber.id, v_subscriber.id is not null
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
      'abonado', v_subscriber.id is not null
    )
  );

  return v_entry;
end;
$$;

-- =============================================================================
-- RPC: SALIDA DE VEHÍCULO + COBRO (reemplaza la versión anterior).
-- Se agrega p_tariff_type con DEFAULT ('HORA') al final: CREATE OR REPLACE
-- permite esto sin romper la firma existente (mismo OID, mismos permisos).
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
  v_flat public.flat_rate_settings;
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
    -- El servidor decide, no el cliente: si el ingreso quedó cubierto por
    -- un abono activo, la salida es SIEMPRE gratuita sin importar qué tipo
    -- de tarifa se haya solicitado.
    if p_payment_method is not null then
      raise exception 'Este vehículo está cubierto por un abono activo y no requiere método de pago.';
    end if;
    v_effective_type := 'ABONADO';
    v_tariff_base := 0;
    v_tolerance := null;
    v_amount := 0;

  elsif p_tariff_type = 'PLANA' then
    select * into v_flat from public.flat_rate_settings where id = true;
    if v_flat is null or not v_flat.activo then
      raise exception 'La tarifa plana no está disponible actualmente.';
    end if;
    if not (extract(dow from (v_exit_at at time zone 'America/Lima'))::integer = any (v_flat.dias_aplicacion)) then
      raise exception 'La tarifa plana no aplica hoy según los días configurados.';
    end if;
    if (v_exit_at at time zone 'America/Lima')::time > v_flat.hora_limite then
      raise exception 'La tarifa plana solo aplica saliendo antes de las %.', to_char(v_flat.hora_limite, 'HH24:MI');
    end if;
    if p_payment_method is null then
      raise exception 'Debe seleccionar un método de pago.';
    end if;
    v_effective_type := 'PLANA';
    v_tariff_base := v_flat.precio;
    v_tolerance := null;
    v_amount := v_flat.precio;

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

-- =============================================================================
-- RLS
-- =============================================================================

alter table public.tariff_settings enable row level security;
alter table public.subscriber_plan_settings enable row level security;
alter table public.flat_rate_settings enable row level security;
alter table public.subscribers enable row level security;

create policy p_tariff_settings_select on public.tariff_settings
  for select using (public.is_active_staff());
create policy p_tariff_settings_update on public.tariff_settings
  for update using (public.is_admin()) with check (public.is_admin());

create policy p_subscriber_plan_settings_select on public.subscriber_plan_settings
  for select using (public.is_active_staff());
create policy p_subscriber_plan_settings_update on public.subscriber_plan_settings
  for update using (public.is_admin()) with check (public.is_admin());

create policy p_flat_rate_settings_select on public.flat_rate_settings
  for select using (public.is_active_staff());
create policy p_flat_rate_settings_update on public.flat_rate_settings
  for update using (public.is_admin()) with check (public.is_admin());

-- Abonados: todo el staff activo puede CONSULTAR (lo necesita el trabajador
-- para ver "ABONADO ACTIVO" en el detalle del espacio). Solo ADMIN puede
-- crear/editar/eliminar.
create policy p_subscribers_select on public.subscribers
  for select using (public.is_active_staff());
create policy p_subscribers_insert on public.subscribers
  for insert with check (public.is_admin());
create policy p_subscribers_update on public.subscribers
  for update using (public.is_admin()) with check (public.is_admin());
create policy p_subscribers_delete on public.subscribers
  for delete using (public.is_admin());

-- =============================================================================
-- AUDITORÍA AUTOMÁTICA de cambios en configuración tarifaria y abonados
-- (fn_audit_row_change ya es genérica desde la migración 0002).
-- =============================================================================

create trigger trg_audit_tariff_settings after update on public.tariff_settings
  for each row execute function public.fn_audit_row_change();
create trigger trg_audit_subscriber_plan_settings after update on public.subscriber_plan_settings
  for each row execute function public.fn_audit_row_change();
create trigger trg_audit_flat_rate_settings after update on public.flat_rate_settings
  for each row execute function public.fn_audit_row_change();
create trigger trg_audit_subscribers after insert or update on public.subscribers
  for each row execute function public.fn_audit_row_change();

-- =============================================================================
-- GRANTS
-- =============================================================================

grant select on public.tariff_settings to authenticated;
grant update on public.tariff_settings to authenticated;

grant select on public.subscriber_plan_settings to authenticated;
grant update on public.subscriber_plan_settings to authenticated;

grant select on public.flat_rate_settings to authenticated;
grant update on public.flat_rate_settings to authenticated;

grant select, insert, update, delete on public.subscribers to authenticated;

grant execute on function public.calculate_hourly_fee(numeric, timestamptz, timestamptz, integer, integer, integer) to authenticated;
grant execute on function public.find_active_subscriber(text, timestamptz) to authenticated;
grant execute on function public.register_vehicle_entry(text, public.vehicle_type, uuid) to authenticated;
grant execute on function public.register_vehicle_exit(uuid, public.payment_method, public.tariff_type) to authenticated;

-- =============================================================================
-- VISTA DE HISTORIAL: agrega la fotografía de tarifa aplicada
-- (CREATE OR REPLACE VIEW conserva permisos/RLS ya configurados).
-- =============================================================================

-- IMPORTANTE: CREATE OR REPLACE VIEW solo permite AGREGAR columnas al final
-- de la lista (las columnas de una vista son posicionales). Por eso
-- tariff_type / tolerance_minutes_applied van después de worker_name y no
-- intercaladas donde "lógicamente" irían junto a tariff_applied/amount.
create or replace view public.v_vehicle_history as
select
  ve.id as exit_id,
  vent.id as entry_id,
  vent.plate,
  ps.code as spot_code,
  vent.vehicle_type,
  vent.entry_at,
  ve.exit_at,
  ve.duration_minutes,
  ve.tariff_applied,
  ve.amount,
  ve.payment_method,
  ve.registered_by as worker_id,
  trim(p.nombre || ' ' || p.apellido) as worker_name,
  ve.tariff_type,
  ve.tolerance_minutes_applied
from public.vehicle_exits ve
join public.vehicle_entries vent on vent.id = ve.entry_id
join public.parking_spots ps on ps.id = vent.parking_spot_id
join public.profiles p on p.id = ve.registered_by;

alter view public.v_vehicle_history set (security_invoker = true);
grant select on public.v_vehicle_history to authenticated;

-- =============================================================================
-- REALTIME
-- =============================================================================

do $$
begin
  alter publication supabase_realtime add table public.subscribers;
exception when duplicate_object then
  null;
end $$;
