-- =============================================================================
-- PARKING ADMIN - Migración inicial
-- Sistema de administración de cochera (31 espacios)
-- =============================================================================
-- Decisiones de diseño (documentadas porque el requerimiento no las fijó):
--   1. Login con email + password (Supabase Auth nativo). Más seguro y
--      mantenible que mapear "usuario" -> email con una tabla intermedia.
--   2. Tarifas configurables como PRECIO POR HORA (fracción hacia arriba,
--      mínimo 1 hora). El cronómetro/tiempo transcurrido solo tiene sentido
--      de negocio si el cobro depende del tiempo. Editable en Administración.
--   3. Toda hora se guarda como timestamptz (instante absoluto en UTC).
--      La "hora de Perú" es un problema de presentación/cálculo de fecha de
--      negocio, no de almacenamiento: se deriva con `at time zone 'America/Lima'`.
--   4. Las operaciones críticas (ingreso, salida+cobro, baño, apertura/cierre
--      de caja) se ejecutan como funciones SECURITY DEFINER (RPC) para
--      garantizar atomicidad real (todo o nada) y evitar estados parciales.
--      Las tablas de negocio NO reciben INSERT/UPDATE directo del cliente.
--   5. Nada se borra físicamente: todo usa estados (activo/inactivo,
--      ACTIVO/FINALIZADO, ABIERTA/CERRADA) + auditoría.
-- =============================================================================

create extension if not exists pgcrypto;

-- =============================================================================
-- ENUMS
-- =============================================================================

create type public.user_role as enum ('ADMIN', 'TRABAJADOR');

create type public.vehicle_type as enum (
  'AUTO', 'CAMIONETA', 'VAN', 'MOTO', 'FURGONETA', 'CAMIONCITO', 'OTRO'
);

create type public.spot_status as enum ('LIBRE', 'OCUPADO');

create type public.entry_status as enum ('ACTIVO', 'FINALIZADO');

create type public.payment_method as enum (
  'EFECTIVO', 'YAPE', 'PLIN', 'TRANSFERENCIA'
);

create type public.movement_type as enum ('INGRESO', 'EGRESO');

create type public.movement_source as enum ('VEHICULO', 'BANO', 'OTRO');

create type public.register_status as enum ('ABIERTA', 'CERRADA');

-- =============================================================================
-- FUNCIONES DE UTILIDAD DE FECHA/HORA (America/Lima)
-- =============================================================================

create or replace function public.lima_date(p_ts timestamptz)
returns date
language sql
stable
as $$
  select (p_ts at time zone 'America/Lima')::date;
$$;

create or replace function public.today_lima()
returns date
language sql
stable
as $$
  select (now() at time zone 'America/Lima')::date;
$$;

-- =============================================================================
-- TABLAS
-- =============================================================================

-- Perfiles de usuario (extiende auth.users)
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null default '',
  apellido text not null default '',
  email text not null,
  rol public.user_role not null default 'TRABAJADOR',
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.profiles is 'Perfil de cada usuario del sistema (ADMIN / TRABAJADOR).';

-- Estacionamientos (31 espacios fijos E01..E31)
create table public.parking_spots (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  status public.spot_status not null default 'LIBRE',
  spot_type text not null default 'ESTANDAR',
  current_entry_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.parking_spots is 'Los 31 espacios físicos de la cochera.';

-- Vehículos conocidos (por placa) - preparado para clientes frecuentes/mensualidades futuras
create table public.vehicles (
  plate text primary key,
  vehicle_type public.vehicle_type not null default 'AUTO',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Ingresos de vehículos
create table public.vehicle_entries (
  id uuid primary key default gen_random_uuid(),
  plate text not null references public.vehicles(plate),
  vehicle_type public.vehicle_type not null,
  parking_spot_id uuid not null references public.parking_spots(id),
  entry_at timestamptz not null default now(),
  registered_by uuid not null references public.profiles(id),
  status public.entry_status not null default 'ACTIVO',
  created_at timestamptz not null default now()
);
create unique index ux_vehicle_entries_active_plate
  on public.vehicle_entries(plate) where status = 'ACTIVO';
create unique index ux_vehicle_entries_active_spot
  on public.vehicle_entries(parking_spot_id) where status = 'ACTIVO';
create index ix_vehicle_entries_entry_at on public.vehicle_entries(entry_at);

alter table public.parking_spots
  add constraint fk_parking_spots_current_entry
  foreign key (current_entry_id) references public.vehicle_entries(id);

-- Salidas de vehículos (cobro)
create table public.vehicle_exits (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null unique references public.vehicle_entries(id),
  exit_at timestamptz not null default now(),
  duration_minutes integer not null check (duration_minutes >= 0),
  tariff_applied numeric(10,2) not null check (tariff_applied >= 0),
  amount numeric(10,2) not null check (amount >= 0),
  payment_method public.payment_method not null,
  registered_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create index ix_vehicle_exits_exit_at on public.vehicle_exits(exit_at);

-- Uso de baños
create table public.restroom_uses (
  id uuid primary key default gen_random_uuid(),
  used_at timestamptz not null default now(),
  amount numeric(10,2) not null check (amount >= 0),
  payment_method public.payment_method not null,
  observation text,
  registered_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create index ix_restroom_uses_used_at on public.restroom_uses(used_at);

-- Tarifas configurables por tipo de vehículo (S/ por hora, fracción hacia arriba)
create table public.tariffs (
  id uuid primary key default gen_random_uuid(),
  vehicle_type public.vehicle_type not null unique,
  price_per_hour numeric(10,2) not null check (price_per_hour > 0),
  active boolean not null default true,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Configuración general del sistema (precio de baño, nombre de empresa, etc.)
create table public.system_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

-- Caja diaria
create table public.cash_registers (
  id uuid primary key default gen_random_uuid(),
  business_date date not null unique,
  opened_at timestamptz not null default now(),
  opened_by uuid not null references public.profiles(id),
  opening_amount numeric(10,2) not null check (opening_amount >= 0),
  status public.register_status not null default 'ABIERTA',
  closed_at timestamptz,
  closed_by uuid references public.profiles(id),
  expected_amount numeric(10,2),
  declared_amount numeric(10,2),
  difference numeric(10,2),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Movimientos de caja (ingresos y egresos)
create table public.cash_movements (
  id uuid primary key default gen_random_uuid(),
  cash_register_id uuid not null references public.cash_registers(id),
  type public.movement_type not null,
  source public.movement_source not null,
  concept text not null,
  amount numeric(10,2) not null check (amount > 0),
  payment_method public.payment_method not null,
  reference_id uuid,
  observation text,
  registered_by uuid not null references public.profiles(id),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index ix_cash_movements_register on public.cash_movements(cash_register_id);
create index ix_cash_movements_occurred_at on public.cash_movements(occurred_at);

-- Auditoría (inmutable)
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id),
  action text not null,
  entity_type text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index ix_audit_log_created_at on public.audit_log(created_at);
create index ix_audit_log_user on public.audit_log(user_id);

-- =============================================================================
-- TRIGGERS: updated_at genérico
-- =============================================================================

create or replace function public.fn_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_profiles_updated_at before update on public.profiles
  for each row execute function public.fn_set_updated_at();
create trigger trg_parking_spots_updated_at before update on public.parking_spots
  for each row execute function public.fn_set_updated_at();
create trigger trg_vehicles_updated_at before update on public.vehicles
  for each row execute function public.fn_set_updated_at();
create trigger trg_tariffs_updated_at before update on public.tariffs
  for each row execute function public.fn_set_updated_at();
create trigger trg_cash_registers_updated_at before update on public.cash_registers
  for each row execute function public.fn_set_updated_at();

-- =============================================================================
-- ALTA AUTOMÁTICA DE PERFIL AL CREAR USUARIO EN auth.users
-- (el alta real de usuarios ocurre en el servidor con la service_role key,
--  usando supabase.auth.admin.createUser con user_metadata: nombre/apellido/rol)
-- =============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, nombre, apellido, email, rol, activo)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nombre', ''),
    coalesce(new.raw_user_meta_data->>'apellido', ''),
    new.email,
    coalesce((new.raw_user_meta_data->>'rol')::public.user_role, 'TRABAJADOR'),
    true
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =============================================================================
-- HELPERS DE AUTORIZACIÓN (security definer -> evita recursión de RLS)
-- =============================================================================

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and rol = 'ADMIN' and activo = true
  );
$$;

create or replace function public.is_active_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and activo = true
  );
$$;

-- =============================================================================
-- AUDITORÍA: función RPC de propósito general (login/logout, etc.)
-- =============================================================================

create or replace function public.log_audit_event(
  p_action text,
  p_entity_type text,
  p_entity_id text default null,
  p_details jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  insert into public.audit_log (user_id, action, entity_type, entity_id, details)
  values (auth.uid(), p_action, p_entity_type, p_entity_id, p_details);
end;
$$;

-- Auditoría automática de cambios sensibles (tarifas, configuración, perfiles).
-- Genérica a propósito: se usa en tablas con distinta primary key (tariffs.id,
-- profiles.id, system_settings.key). NUNCA accede a new.columna/old.columna
-- de forma estática (eso rompe en cuanto la tabla no tiene esa columna: PL/pgSQL
-- resuelve el nombre de campo contra la fila real al preparar la sentencia,
-- no en tiempo de evaluación de COALESCE). En su lugar:
--   1. Busca dinámicamente la primary key real de la tabla en pg_index.
--   2. Extrae el valor con to_jsonb(...) ->> columna, que devuelve NULL si la
--      columna no existe en vez de lanzar error.
-- Además nunca debe abortar la operación real que la disparó (login, cambio
-- de tarifa, etc.): cualquier fallo interno se registra como warning y se
-- deja continuar la transacción original.
create or replace function public.fn_audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pk_column text;
  v_row jsonb;
  v_before jsonb;
  v_after jsonb;
  v_entity_id text;
begin
  select a.attname
    into v_pk_column
  from pg_index i
  join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey::int2[])
  where i.indrelid = TG_RELID
    and i.indisprimary
  order by array_position(i.indkey::int2[], a.attnum)
  limit 1;

  if TG_OP = 'DELETE' then
    v_row := to_jsonb(old);
    v_before := v_row;
    v_after := null;
  elsif TG_OP = 'INSERT' then
    v_row := to_jsonb(new);
    v_before := null;
    v_after := v_row;
  else
    v_before := to_jsonb(old);
    v_after := to_jsonb(new);
    v_row := v_after;
  end if;

  if v_pk_column is not null then
    v_entity_id := v_row ->> v_pk_column;
  end if;

  insert into public.audit_log (user_id, action, entity_type, entity_id, details)
  values (
    auth.uid(),
    TG_OP || '_' || TG_TABLE_NAME,
    TG_TABLE_NAME,
    v_entity_id,
    jsonb_build_object('before', v_before, 'after', v_after)
  );

  if TG_OP = 'DELETE' then
    return old;
  end if;
  return new;
exception when others then
  raise warning 'fn_audit_row_change: no se pudo auditar % en % (%): %',
    TG_OP, TG_TABLE_NAME, v_entity_id, SQLERRM;
  if TG_OP = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger trg_audit_tariffs after update on public.tariffs
  for each row execute function public.fn_audit_row_change();
create trigger trg_audit_system_settings after update on public.system_settings
  for each row execute function public.fn_audit_row_change();
create trigger trg_audit_profiles after update on public.profiles
  for each row execute function public.fn_audit_row_change();

-- =============================================================================
-- RPC: INGRESO DE VEHÍCULO
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

  insert into public.vehicle_entries (plate, vehicle_type, parking_spot_id, registered_by, entry_at, status)
  values (v_plate, p_vehicle_type, p_spot_id, auth.uid(), now(), 'ACTIVO')
  returning * into v_entry;

  update public.parking_spots
  set status = 'OCUPADO', current_entry_id = v_entry.id
  where id = p_spot_id;

  insert into public.audit_log (user_id, action, entity_type, entity_id, details)
  values (
    auth.uid(), 'INGRESO_VEHICULO', 'vehicle_entries', v_entry.id::text,
    jsonb_build_object('placa', v_plate, 'tipo', p_vehicle_type, 'estacionamiento', v_spot.code)
  );

  return v_entry;
end;
$$;

-- =============================================================================
-- RPC: SALIDA DE VEHÍCULO + COBRO (atómico)
-- =============================================================================

create or replace function public.register_vehicle_exit(
  p_entry_id uuid,
  p_payment_method public.payment_method
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
  v_exit_at timestamptz := now();
  v_minutes integer;
  v_hours integer;
  v_amount numeric(10,2);
  v_exit public.vehicle_exits;
  v_register public.cash_registers;
begin
  if not public.is_active_staff() then
    raise exception 'No tienes permisos para realizar esta acción.';
  end if;

  select * into v_entry from public.vehicle_entries
    where id = p_entry_id and status = 'ACTIVO' for update;
  if not found then
    raise exception 'No existe un ingreso activo para este vehículo.';
  end if;

  select * into v_tariff from public.tariffs
    where vehicle_type = v_entry.vehicle_type and active = true;
  if not found then
    raise exception 'No hay una tarifa configurada para este tipo de vehículo.';
  end if;

  select * into v_register from public.cash_registers
    where business_date = public.today_lima() and status = 'ABIERTA';
  if not found then
    raise exception 'No hay una caja abierta. Debe aperturar caja antes de cobrar.';
  end if;

  v_minutes := greatest(0, ceil(extract(epoch from (v_exit_at - v_entry.entry_at)) / 60.0))::integer;
  v_hours := greatest(1, ceil(v_minutes / 60.0))::integer;
  v_amount := v_tariff.price_per_hour * v_hours;

  insert into public.vehicle_exits (
    entry_id, exit_at, duration_minutes, tariff_applied, amount, payment_method, registered_by
  ) values (
    p_entry_id, v_exit_at, v_minutes, v_tariff.price_per_hour, v_amount, p_payment_method, auth.uid()
  ) returning * into v_exit;

  update public.vehicle_entries set status = 'FINALIZADO' where id = p_entry_id;

  select * into v_spot from public.parking_spots where id = v_entry.parking_spot_id for update;
  update public.parking_spots
    set status = 'LIBRE', current_entry_id = null
    where id = v_entry.parking_spot_id;

  insert into public.cash_movements (
    cash_register_id, type, source, concept, amount, payment_method, reference_id, registered_by
  ) values (
    v_register.id, 'INGRESO', 'VEHICULO',
    'Cobro estacionamiento ' || v_spot.code || ' - placa ' || v_entry.plate,
    v_amount, p_payment_method, v_exit.id, auth.uid()
  );

  insert into public.audit_log (user_id, action, entity_type, entity_id, details)
  values (
    auth.uid(), 'SALIDA_VEHICULO_COBRO', 'vehicle_exits', v_exit.id::text,
    jsonb_build_object(
      'placa', v_entry.plate, 'estacionamiento', v_spot.code,
      'minutos', v_minutes, 'monto', v_amount, 'metodo_pago', p_payment_method
    )
  );

  return v_exit;
end;
$$;

-- =============================================================================
-- RPC: USO DE BAÑO
-- =============================================================================

create or replace function public.register_restroom_use(
  p_payment_method public.payment_method,
  p_observation text default null
)
returns public.restroom_uses
language plpgsql
security definer
set search_path = public
as $$
declare
  v_price numeric(10,2);
  v_register public.cash_registers;
  v_use public.restroom_uses;
begin
  if not public.is_active_staff() then
    raise exception 'No tienes permisos para realizar esta acción.';
  end if;

  select coalesce((value->>'price')::numeric, 1.00) into v_price
    from public.system_settings where key = 'restroom_price';
  if v_price is null then
    v_price := 1.00;
  end if;

  select * into v_register from public.cash_registers
    where business_date = public.today_lima() and status = 'ABIERTA';
  if not found then
    raise exception 'No hay una caja abierta. Debe aperturar caja antes de registrar el cobro.';
  end if;

  insert into public.restroom_uses (amount, payment_method, observation, registered_by)
  values (v_price, p_payment_method, p_observation, auth.uid())
  returning * into v_use;

  insert into public.cash_movements (
    cash_register_id, type, source, concept, amount, payment_method, reference_id, registered_by
  ) values (
    v_register.id, 'INGRESO', 'BANO', 'Uso de baño', v_price, p_payment_method, v_use.id, auth.uid()
  );

  insert into public.audit_log (user_id, action, entity_type, entity_id, details)
  values (auth.uid(), 'REGISTRO_BANO', 'restroom_uses', v_use.id::text,
    jsonb_build_object('monto', v_price, 'metodo_pago', p_payment_method));

  return v_use;
end;
$$;

-- =============================================================================
-- RPC: APERTURA DE CAJA
-- =============================================================================

create or replace function public.open_cash_register(p_opening_amount numeric)
returns public.cash_registers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_date date := public.today_lima();
  v_existing public.cash_registers;
  v_register public.cash_registers;
begin
  if not public.is_active_staff() then
    raise exception 'No tienes permisos para realizar esta acción.';
  end if;

  if p_opening_amount < 0 then
    raise exception 'El monto inicial no puede ser negativo.';
  end if;

  select * into v_existing from public.cash_registers where business_date = v_business_date;
  if found then
    if v_existing.status = 'ABIERTA' then
      raise exception 'La caja del día ya se encuentra aperturada.';
    else
      raise exception 'La caja del día ya fue cerrada. No puede reabrirse.';
    end if;
  end if;

  insert into public.cash_registers (business_date, opened_at, opened_by, opening_amount, status)
  values (v_business_date, now(), auth.uid(), p_opening_amount, 'ABIERTA')
  returning * into v_register;

  insert into public.audit_log (user_id, action, entity_type, entity_id, details)
  values (auth.uid(), 'APERTURA_CAJA', 'cash_registers', v_register.id::text,
    jsonb_build_object('monto_inicial', p_opening_amount));

  return v_register;
end;
$$;

-- =============================================================================
-- RPC: MOVIMIENTO MANUAL DE CAJA (otros ingresos / egresos / gastos / retiros)
-- =============================================================================

create or replace function public.register_cash_movement(
  p_cash_register_id uuid,
  p_type public.movement_type,
  p_concept text,
  p_amount numeric,
  p_payment_method public.payment_method,
  p_observation text default null
)
returns public.cash_movements
language plpgsql
security definer
set search_path = public
as $$
declare
  v_register public.cash_registers;
  v_movement public.cash_movements;
begin
  if not public.is_active_staff() then
    raise exception 'No tienes permisos para realizar esta acción.';
  end if;

  if p_amount <= 0 then
    raise exception 'El monto debe ser mayor a cero.';
  end if;
  if p_concept is null or length(trim(p_concept)) = 0 then
    raise exception 'Debe indicar un concepto para el movimiento.';
  end if;

  select * into v_register from public.cash_registers where id = p_cash_register_id;
  if not found or v_register.status <> 'ABIERTA' then
    raise exception 'La caja indicada no está abierta.';
  end if;

  insert into public.cash_movements (
    cash_register_id, type, source, concept, amount, payment_method, observation, registered_by
  ) values (
    p_cash_register_id, p_type, 'OTRO', trim(p_concept), p_amount, p_payment_method, p_observation, auth.uid()
  ) returning * into v_movement;

  insert into public.audit_log (user_id, action, entity_type, entity_id, details)
  values (auth.uid(), 'MOVIMIENTO_CAJA_' || p_type::text, 'cash_movements', v_movement.id::text,
    jsonb_build_object('concepto', p_concept, 'monto', p_amount, 'metodo_pago', p_payment_method));

  return v_movement;
end;
$$;

-- =============================================================================
-- RPC: CIERRE DE CAJA
-- =============================================================================

create or replace function public.close_cash_register(
  p_cash_register_id uuid,
  p_declared_amount numeric,
  p_notes text default null
)
returns public.cash_registers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_register public.cash_registers;
  v_cash_in numeric(10,2);
  v_cash_out numeric(10,2);
  v_expected numeric(10,2);
begin
  if not public.is_active_staff() then
    raise exception 'No tienes permisos para realizar esta acción.';
  end if;

  select * into v_register from public.cash_registers where id = p_cash_register_id for update;
  if not found then
    raise exception 'La caja indicada no existe.';
  end if;
  if v_register.status <> 'ABIERTA' then
    raise exception 'La caja ya se encuentra cerrada.';
  end if;

  select coalesce(sum(amount), 0) into v_cash_in
    from public.cash_movements
    where cash_register_id = p_cash_register_id and type = 'INGRESO' and payment_method = 'EFECTIVO';
  select coalesce(sum(amount), 0) into v_cash_out
    from public.cash_movements
    where cash_register_id = p_cash_register_id and type = 'EGRESO' and payment_method = 'EFECTIVO';

  v_expected := v_register.opening_amount + v_cash_in - v_cash_out;

  update public.cash_registers set
    status = 'CERRADA',
    closed_at = now(),
    closed_by = auth.uid(),
    expected_amount = v_expected,
    declared_amount = p_declared_amount,
    difference = p_declared_amount - v_expected,
    notes = p_notes
  where id = p_cash_register_id
  returning * into v_register;

  insert into public.audit_log (user_id, action, entity_type, entity_id, details)
  values (auth.uid(), 'CIERRE_CAJA', 'cash_registers', v_register.id::text,
    jsonb_build_object(
      'esperado', v_expected, 'declarado', p_declared_amount,
      'diferencia', p_declared_amount - v_expected
    ));

  return v_register;
end;
$$;

-- =============================================================================
-- RPC: RESUMEN DE CAJA (totales por método de pago)
-- =============================================================================

create or replace function public.get_cash_register_summary(p_cash_register_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not public.is_active_staff() then
    raise exception 'No tienes permisos para realizar esta acción.';
  end if;

  select jsonb_build_object(
    'efectivo', coalesce(sum(amount) filter (where payment_method = 'EFECTIVO' and type = 'INGRESO'), 0)
                - coalesce(sum(amount) filter (where payment_method = 'EFECTIVO' and type = 'EGRESO'), 0),
    'yape', coalesce(sum(amount) filter (where payment_method = 'YAPE' and type = 'INGRESO'), 0)
            - coalesce(sum(amount) filter (where payment_method = 'YAPE' and type = 'EGRESO'), 0),
    'plin', coalesce(sum(amount) filter (where payment_method = 'PLIN' and type = 'INGRESO'), 0)
            - coalesce(sum(amount) filter (where payment_method = 'PLIN' and type = 'EGRESO'), 0),
    'transferencia', coalesce(sum(amount) filter (where payment_method = 'TRANSFERENCIA' and type = 'INGRESO'), 0)
                      - coalesce(sum(amount) filter (where payment_method = 'TRANSFERENCIA' and type = 'EGRESO'), 0),
    'total_ingresos', coalesce(sum(amount) filter (where type = 'INGRESO'), 0),
    'total_egresos', coalesce(sum(amount) filter (where type = 'EGRESO'), 0)
  ) into v_result
  from public.cash_movements
  where cash_register_id = p_cash_register_id;

  return v_result;
end;
$$;

-- =============================================================================
-- RPC: SNAPSHOT DEL DASHBOARD
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

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

alter table public.profiles enable row level security;
alter table public.parking_spots enable row level security;
alter table public.vehicles enable row level security;
alter table public.vehicle_entries enable row level security;
alter table public.vehicle_exits enable row level security;
alter table public.restroom_uses enable row level security;
alter table public.tariffs enable row level security;
alter table public.system_settings enable row level security;
alter table public.cash_registers enable row level security;
alter table public.cash_movements enable row level security;
alter table public.audit_log enable row level security;

-- profiles: todo el staff activo puede ver el directorio interno (nombre,
-- correo, rol, activo) -- necesario para que el historial compartido pueda
-- mostrar "registrado por" y filtrar por trabajador sin que el INNER JOIN
-- de v_vehicle_history oculte filas por RLS. Nada de esto es información
-- sensible de clientes. Solo admin puede editar/crear perfiles.
create policy p_profiles_select on public.profiles
  for select using (public.is_active_staff());
create policy p_profiles_update on public.profiles
  for update using (public.is_admin()) with check (public.is_admin());
create policy p_profiles_insert on public.profiles
  for insert with check (public.is_admin());

-- catálogos de solo lectura para staff activo
create policy p_parking_spots_select on public.parking_spots
  for select using (public.is_active_staff());
create policy p_vehicles_select on public.vehicles
  for select using (public.is_active_staff());
create policy p_vehicle_entries_select on public.vehicle_entries
  for select using (public.is_active_staff());
create policy p_vehicle_exits_select on public.vehicle_exits
  for select using (public.is_active_staff());
create policy p_restroom_uses_select on public.restroom_uses
  for select using (public.is_active_staff());
create policy p_cash_movements_select on public.cash_movements
  for select using (public.is_active_staff());
create policy p_cash_registers_select on public.cash_registers
  for select using (public.is_active_staff());

-- tarifas: staff lee, solo admin edita
create policy p_tariffs_select on public.tariffs
  for select using (public.is_active_staff());
create policy p_tariffs_update on public.tariffs
  for update using (public.is_admin()) with check (public.is_admin());
create policy p_tariffs_insert on public.tariffs
  for insert with check (public.is_admin());

-- configuración: staff lee, solo admin edita
create policy p_system_settings_select on public.system_settings
  for select using (public.is_active_staff());
create policy p_system_settings_update on public.system_settings
  for update using (public.is_admin()) with check (public.is_admin());
create policy p_system_settings_insert on public.system_settings
  for insert with check (public.is_admin());

-- auditoría: solo admin lee, nadie escribe directo (solo vía RPC security definer)
create policy p_audit_log_select on public.audit_log
  for select using (public.is_admin());

-- Nota: parking_spots, vehicles, vehicle_entries, vehicle_exits, restroom_uses,
-- cash_registers y cash_movements NO tienen políticas de INSERT/UPDATE/DELETE
-- para authenticated: toda escritura ocurre exclusivamente a través de las
-- funciones RPC SECURITY DEFINER de arriba, que validan reglas de negocio
-- y dejan rastro de auditoría de forma atómica.

-- =============================================================================
-- GRANTS
-- =============================================================================

grant usage on schema public to authenticated;

grant select on public.profiles to authenticated;
grant update, insert on public.profiles to authenticated;

grant select on public.parking_spots to authenticated;
grant select on public.vehicles to authenticated;
grant select on public.vehicle_entries to authenticated;
grant select on public.vehicle_exits to authenticated;
grant select on public.restroom_uses to authenticated;
grant select on public.cash_registers to authenticated;
grant select on public.cash_movements to authenticated;
grant select on public.audit_log to authenticated;

grant select on public.tariffs to authenticated;
grant update, insert on public.tariffs to authenticated;
grant select on public.system_settings to authenticated;
grant update, insert on public.system_settings to authenticated;

grant execute on function public.log_audit_event(text, text, text, jsonb) to authenticated;
grant execute on function public.register_vehicle_entry(text, public.vehicle_type, uuid) to authenticated;
grant execute on function public.register_vehicle_exit(uuid, public.payment_method) to authenticated;
grant execute on function public.register_restroom_use(public.payment_method, text) to authenticated;
grant execute on function public.open_cash_register(numeric) to authenticated;
grant execute on function public.register_cash_movement(uuid, public.movement_type, text, numeric, public.payment_method, text) to authenticated;
grant execute on function public.close_cash_register(uuid, numeric, text) to authenticated;
grant execute on function public.get_cash_register_summary(uuid) to authenticated;
grant execute on function public.get_dashboard_snapshot() to authenticated;

-- =============================================================================
-- VISTA DE HISTORIAL (aplana ingreso+salida+espacio+trabajador para filtrar
-- fácilmente desde el cliente sin depender de embeds anidados de PostgREST)
-- =============================================================================

create view public.v_vehicle_history as
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
  trim(p.nombre || ' ' || p.apellido) as worker_name
from public.vehicle_exits ve
join public.vehicle_entries vent on vent.id = ve.entry_id
join public.parking_spots ps on ps.id = vent.parking_spot_id
join public.profiles p on p.id = ve.registered_by;

alter view public.v_vehicle_history set (security_invoker = true);
grant select on public.v_vehicle_history to authenticated;

-- =============================================================================
-- REALTIME
-- Permite que el mapa de estacionamientos, caja y baño se actualicen en todos
-- los dispositivos conectados sin necesidad de sondeo (polling) constante.
-- =============================================================================

do $$
begin
  alter publication supabase_realtime add table
    public.parking_spots,
    public.vehicle_entries,
    public.vehicle_exits,
    public.restroom_uses,
    public.cash_registers,
    public.cash_movements;
exception when duplicate_object then
  null;
end $$;
