-- =============================================================================
-- NORMALIZACIÓN CENTRALIZADA DE PLACAS
--
-- Problema: "BSX277" y "BSX-277" se trataban como placas distintas en todo
-- el sistema (lookup_plate_status, find_active_subscriber,
-- register_vehicle_entry, búsquedas de historial/abonados), porque cada
-- comparación solo hacía upper(trim(...)) sin quitar el guion/espacios.
-- Esto no era solo un problema de UI: el propio register_vehicle_entry
-- insertaba una placa con guion como una identidad distinta en
-- vehicles/vehicle_entries, permitiendo registrar el MISMO vehículo dos
-- veces (una vez como "BSX277" y otra como "BSX-277") sin que el chequeo
-- "ya se encuentra dentro" lo detectara.
--
-- Solución: una única función normalize_plate() en Postgres (fuente de
-- verdad para todo el backend) + columnas generadas "plate_normalizada"
-- en subscribers/authorized_vehicles/vehicle_entries. La columna "plate"
-- ORIGINAL se conserva intacta en todas las tablas (lo que el usuario
-- escribió/ve se mantiene tal cual, incluida auditoría/historial); solo
-- "plate_normalizada" se usa para comparar identidad.
-- =============================================================================

create or replace function public.normalize_plate(p_plate text)
returns text
language sql
immutable
as $$
  select case
    when p_plate is null then null
    else upper(regexp_replace(trim(p_plate), '[\s-]+', '', 'g'))
  end;
$$;

comment on function public.normalize_plate(text) is
  'Única fuente de verdad para comparar placas: trim + mayúsculas + sin guiones/espacios. BSX277 y BSX-277 producen el mismo valor.';

-- subscribers/authorized_vehicles se insertan/editan con INSERT/UPDATE
-- directos desde el rol "authenticated" (RLS-gated, no vía RPC), así que
-- ese rol necesita EXECUTE para que Postgres pueda calcular la columna
-- generada plate_normalizada en cada escritura.
revoke execute on function public.normalize_plate(text) from public;
grant execute on function public.normalize_plate(text) to authenticated;

-- -----------------------------------------------------------------------------
-- Aviso de posibles duplicados YA EXISTENTES antes de crear los índices
-- únicos de más abajo. No se borra ni se fusiona nada automáticamente: si
-- aparece un WARNING aquí, el índice único fallará y hay que resolver el
-- conflicto a mano (desactivar/editar uno de los registros) antes de volver
-- a correr esta migración.
-- -----------------------------------------------------------------------------

do $$
declare
  r record;
begin
  for r in
    select public.normalize_plate(plate) as norm, count(*) as total, array_agg(plate order by plate) as variantes
    from public.authorized_vehicles
    group by public.normalize_plate(plate)
    having count(*) > 1
  loop
    raise warning 'authorized_vehicles: % filas comparten la placa normalizada % (variantes: %). Resuélvelo manualmente: el índice único de más abajo fallará hasta que solo quede una fila con esa placa normalizada.',
      r.total, r.norm, r.variantes;
  end loop;
end $$;

do $$
declare
  r record;
begin
  for r in
    select public.normalize_plate(plate) as norm, count(*) as total, array_agg(plate order by plate) as variantes
    from public.vehicle_entries
    where status = 'ACTIVO'
    group by public.normalize_plate(plate)
    having count(*) > 1
  loop
    raise warning 'vehicle_entries ACTIVOS: % filas comparten la placa normalizada % (variantes: %). No debería haber dos ingresos activos para el mismo vehículo real; registra la salida del duplicado antes de continuar.',
      r.total, r.norm, r.variantes;
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- Columnas generadas (Postgres las recalcula solas en cada insert/update,
-- y también las rellena automáticamente para las filas existentes al
-- crearlas: no hace falta un UPDATE de backfill manual).
-- -----------------------------------------------------------------------------

alter table public.subscribers
  add column plate_normalizada text generated always as (public.normalize_plate(plate)) stored;

alter table public.authorized_vehicles
  add column plate_normalizada text generated always as (public.normalize_plate(plate)) stored;

alter table public.vehicle_entries
  add column plate_normalizada text generated always as (public.normalize_plate(plate)) stored;

-- -----------------------------------------------------------------------------
-- Índices: mismo alcance de negocio que los que reemplazan (abonados
-- admite múltiples filas por placa -renovaciones-, así que su índice no es
-- único; autorizados y el ingreso activo sí lo eran y lo siguen siendo,
-- ahora comparando por identidad real).
-- -----------------------------------------------------------------------------

drop index if exists public.ix_subscribers_plate;
create index ix_subscribers_plate_normalizada on public.subscribers(plate_normalizada);

drop index if exists public.ux_authorized_vehicles_plate;
create unique index ux_authorized_vehicles_plate_normalizada on public.authorized_vehicles(plate_normalizada);

drop index if exists public.ux_vehicle_entries_active_plate;
create unique index ux_vehicle_entries_active_plate_normalizada
  on public.vehicle_entries(plate_normalizada) where status = 'ACTIVO';

-- =============================================================================
-- RPC: lookup_plate_status — usado por el formulario de ingreso mientras el
-- trabajador escribe. Prioridad AUTORIZADO > ABONADO; un abonado CANCELADO
-- (eliminado, ver 0010) sigue sin mostrarse como abonado de ningún tipo.
-- Único cambio real de esta migración: la comparación pasa a
-- plate_normalizada en vez de upper(trim(...)).
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
  v_plate_norm text := public.normalize_plate(p_plate);
begin
  if not public.is_active_staff() then
    raise exception 'No tienes permisos para realizar esta acción.';
  end if;

  return query
  select 'AUTORIZADO'::text, av.id, av.propietario, null::date, av.estado
  from public.authorized_vehicles av
  where av.plate_normalizada = v_plate_norm and av.estado = 'ACTIVO'
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
      when s.estado = 'SUSPENDIDO' then 'SUSPENDIDO'
      when s.fecha_vencimiento < public.today_lima() then 'VENCIDO'
      else 'ACTIVO'
    end
  from public.subscribers s
  where s.plate_normalizada = v_plate_norm
    and s.estado <> 'CANCELADO'
  order by s.fecha_vencimiento desc
  limit 1;
end;
$$;

-- =============================================================================
-- RPC: lookup_subscriber_by_plate — usado solo para el aviso "esta placa ya
-- tiene un abono activo" al crear un vehículo autorizado.
-- =============================================================================

create or replace function public.lookup_subscriber_by_plate(p_plate text)
returns table (
  id uuid,
  nombre_completo text,
  fecha_vencimiento date,
  display_status text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_active_staff() then
    raise exception 'No tienes permisos para realizar esta acción.';
  end if;

  return query
  select
    s.id,
    s.nombre_completo,
    s.fecha_vencimiento,
    case
      when s.estado in ('SUSPENDIDO', 'CANCELADO') then s.estado::text
      when s.fecha_vencimiento < public.today_lima() then 'VENCIDO'
      else 'ACTIVO'
    end as display_status
  from public.subscribers s
  where s.plate_normalizada = public.normalize_plate(p_plate)
  order by s.fecha_vencimiento desc
  limit 1;
end;
$$;

-- =============================================================================
-- RPC: find_active_subscriber — llamada internamente por register_vehicle_entry.
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
    and (p_at at time zone 'America/Lima')::time <= hora_limite
  order by fecha_vencimiento desc
  limit 1;

  return v_result;
end;
$$;

-- =============================================================================
-- RPC: register_vehicle_entry — misma lógica de negocio (prioridad
-- autorizado > abonado > tarifa plana), pero toda comparación de identidad
-- de placa usa plate_normalizada. La columna "plate" que se guarda sigue
-- siendo exactamente lo que escribió el trabajador (upper+trim, tal como
-- ya funcionaba), para no alterar lo que se muestra en el mapa/historial.
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
  -- activo. Un vehículo autorizado nunca consulta ni consume el abono.
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

  return v_entry;
end;
$$;

-- =============================================================================
-- HISTORIAL: agrega plate_normalizada al final (CREATE OR REPLACE VIEW solo
-- permite añadir columnas al final de la lista, nunca insertarlas en medio).
-- =============================================================================

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
  ve.tolerance_minutes_applied,
  vent.plate_normalizada
from public.vehicle_exits ve
join public.vehicle_entries vent on vent.id = ve.entry_id
join public.parking_spots ps on ps.id = vent.parking_spot_id
join public.profiles p on p.id = ve.registered_by;

alter view public.v_vehicle_history set (security_invoker = true);
grant select on public.v_vehicle_history to authenticated;

-- Fuerza a PostgREST a refrescar su caché de esquema inmediatamente.
notify pgrst, 'reload schema';
