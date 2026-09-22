-- =============================================================================
-- PARKING ADMIN - Migración 0006
-- Corrige 3 problemas reportados: (1) todas las placas mostraban "ABONADO
-- ACTIVO", (2) cupo máximo de 10 vehículos simultáneos en tarifa plana,
-- (3) el monto S/180.00 no se guardaba (bug de frontend, ver notas abajo).
--
-- ===========================================================================
-- PROBLEMA 1 — CAUSA RAÍZ REAL (no era el frontend "adivinando", era un
-- detalle de serialización de PostgREST):
--
-- find_active_subscriber() está declarada `RETURNS public.subscribers`
-- (una fila, no un conjunto). Cuando la consulta interna no encuentra
-- ninguna fila, la función devuelve NULL... pero NULL de tipo compuesto.
-- Postgres serializa un registro compuesto NULL como un objeto JSON con
-- TODOS los campos en null (`{"id":null,"nombre_completo":null,...}`), NO
-- como `null` a secas. El código cliente hacía `if (!data)`, y ese objeto
-- con todos los campos null es un objeto válido (truthy en JS) — por eso
-- CUALQUIER placa terminaba en la rama "encontrado".
--
-- Fix: una función NUEVA, dedicada a la UI, declarada `RETURNS TABLE(...)`
-- (equivalente a SETOF). Las funciones que devuelven conjuntos SIEMPRE se
-- serializan como array `[]` cuando no hay coincidencias — con eso
-- `.maybeSingle()` en el cliente obtiene `data: null` de verdad, sin
-- ambigüedad posible. find_active_subscriber() se deja intacta para su uso
-- interno (register_vehicle_entry, vía PL/pgSQL no sufre este problema:
-- accede a v_subscriber.id sobre un registro NULL sin errores), pero se le
-- quita el GRANT directo a `authenticated` porque ya nadie del cliente
-- debe llamarla directo.
--
-- PROBLEMA 3 — el backend (NUMERIC(10,2)) siempre fue correcto. El bug
-- estaba en los inputs de React: `min="0.10" step="1"` en los formularios
-- de abonado. La validación nativa de HTML5 para `step` exige que el valor
-- sea min + N×step; con esos parámetros 180.00 NO es un múltiplo válido
-- (solo 0.10, 1.10, 2.10, ...), así que el navegador bloqueaba el envío
-- del formulario antes de que llegara a Zod o a Supabase. Se corrige en
-- el frontend (no requiere cambios de base de datos) a `step="0.01"`.
-- ===========================================================================

-- =============================================================================
-- PROBLEMA 1 — Función segura para la UI (nunca ambigua)
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
  where upper(s.plate) = upper(trim(p_plate))
  order by s.fecha_vencimiento desc
  limit 1;
end;
$$;

revoke execute on function public.lookup_subscriber_by_plate(text) from public;
grant execute on function public.lookup_subscriber_by_plate(text) to authenticated;

-- find_active_subscriber() ya no se llama directo desde el cliente (solo
-- internamente, dentro de register_vehicle_entry, que corre como el dueño
-- de la función — no necesita el grant). Se retira el acceso directo.
revoke execute on function public.find_active_subscriber(text, timestamptz) from authenticated;

-- =============================================================================
-- PROBLEMA 2 — Cupo máximo de tarifa plana (reservado al INGRESO)
-- =============================================================================

alter table public.flat_rate_settings
  add column cupo_maximo integer not null default 10 check (cupo_maximo > 0);

alter table public.vehicle_entries
  add column flat_rate_reserved boolean not null default false;

-- Índice parcial: es exactamente la consulta que hace el conteo de cupos
-- (solo entradas activas con tarifa plana reservada), la más sensible a
-- rendimiento porque se ejecuta dentro del lock de concurrencia.
create index ix_vehicle_entries_flat_rate_active
  on public.vehicle_entries(flat_rate_reserved)
  where status = 'ACTIVO' and flat_rate_reserved = true;

-- Índices adicionales solicitados para búsquedas frecuentes.
create index ix_subscribers_estado on public.subscribers(estado);
create index ix_subscribers_fecha_vencimiento on public.subscribers(fecha_vencimiento);
create index ix_vehicle_entries_status on public.vehicle_entries(status);
create index ix_vehicle_exits_tariff_type on public.vehicle_exits(tariff_type);

-- =============================================================================
-- RPC: consulta de cupos de tarifa plana (para mostrar "7 / 10" en la UI)
-- =============================================================================

create or replace function public.get_flat_rate_capacity()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cupo integer;
  v_activos integer;
begin
  if not public.is_active_staff() then
    raise exception 'No tienes permisos para realizar esta acción.';
  end if;

  select cupo_maximo into v_cupo from public.flat_rate_settings where id = true;

  select count(*) into v_activos
  from public.vehicle_entries
  where flat_rate_reserved = true and status = 'ACTIVO';

  return jsonb_build_object(
    'cupo_maximo', v_cupo,
    'activos', v_activos,
    'disponibles', greatest(v_cupo - v_activos, 0)
  );
end;
$$;

revoke execute on function public.get_flat_rate_capacity() from public;
grant execute on function public.get_flat_rate_capacity() to authenticated;

-- =============================================================================
-- RPC: INGRESO DE VEHÍCULO (reemplaza la versión anterior — agrega
-- p_use_flat_rate al final con DEFAULT, compatible con CREATE OR REPLACE).
-- Reserva el cupo de tarifa plana de forma segura ante concurrencia con un
-- advisory lock: dos ingresos simultáneos NUNCA pueden hacer que el conteo
-- supere cupo_maximo, porque el segundo espera a que el primero termine su
-- transacción antes de poder contar/reservar.
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

  -- Reserva de cupo de tarifa plana: solo si se solicitó y el vehículo no
  -- está ya cubierto por un abono (el abono tiene prioridad y no compite
  -- por cupos de tarifa plana).
  if p_use_flat_rate and v_subscriber.id is null then
    perform pg_advisory_xact_lock(hashtext('flat_rate_reservation'));

    select * into v_flat from public.flat_rate_settings where id = true;
    if v_flat is null or not v_flat.activo then
      raise exception 'La tarifa plana no está disponible actualmente.';
    end if;

    select count(*) into v_active_flat_count
    from public.vehicle_entries
    where flat_rate_reserved = true and status = 'ACTIVO';

    if v_active_flat_count >= v_flat.cupo_maximo then
      raise exception 'Tarifa plana completa: % / % vehículos. No hay cupos disponibles.',
        v_active_flat_count, v_flat.cupo_maximo;
    end if;

    v_flat_reserved := true;
  end if;

  insert into public.vehicle_entries (
    plate, vehicle_type, parking_spot_id, registered_by, entry_at, status,
    subscriber_id, covered_by_subscription, flat_rate_reserved
  ) values (
    v_plate, p_vehicle_type, p_spot_id, auth.uid(), v_entry_at, 'ACTIVO',
    v_subscriber.id, v_subscriber.id is not null, v_flat_reserved
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
      'abonado', v_subscriber.id is not null, 'tarifa_plana_reservada', v_flat_reserved
    )
  );

  return v_entry;
end;
$$;

-- =============================================================================
-- RPC: SALIDA DE VEHÍCULO + COBRO (reemplaza la versión anterior).
-- p_tariff_type se conserva por compatibilidad de firma, pero YA NO decide
-- si se cobra tarifa plana: eso ahora lo determina exclusivamente
-- vehicle_entries.flat_rate_reserved (fijado al ingreso, con cupo). Si se
-- solicitó tarifa plana al ingresar pero ya no es elegible al salir (pasó
-- la hora límite o cambió el día), cae automáticamente a tarifa por hora
-- en vez de bloquear el cobro — el vehículo tiene que poder salir.
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
  v_flat_still_eligible boolean := false;
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
    select * into v_flat from public.flat_rate_settings where id = true;
    v_flat_still_eligible := v_flat is not null and v_flat.activo
      and (extract(dow from (v_exit_at at time zone 'America/Lima'))::integer = any (v_flat.dias_aplicacion))
      and (v_exit_at at time zone 'America/Lima')::time <= v_flat.hora_limite;

    if p_payment_method is null then
      raise exception 'Debe seleccionar un método de pago.';
    end if;

    if v_flat_still_eligible then
      v_effective_type := 'PLANA';
      v_tariff_base := v_flat.precio;
      v_tolerance := null;
      v_amount := v_flat.precio;
    else
      -- Ya no aplica (p.ej. pasó la hora límite): cae a tarifa por hora.
      select * into v_tariff from public.tariffs
        where vehicle_type = v_entry.vehicle_type and active = true;
      if not found then
        raise exception 'No hay una tarifa configurada para este tipo de vehículo.';
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
-- GRANTS (re-afirmados: mismas firmas, CREATE OR REPLACE no las cambia,
-- pero se dejan explícitos por si el proyecto se instala desde cero salteando
-- migraciones intermedias).
-- =============================================================================

revoke execute on function public.register_vehicle_entry(text, public.vehicle_type, uuid, boolean) from public;
grant execute on function public.register_vehicle_entry(text, public.vehicle_type, uuid, boolean) to authenticated;

revoke execute on function public.register_vehicle_exit(uuid, public.payment_method, public.tariff_type) from public;
grant execute on function public.register_vehicle_exit(uuid, public.payment_method, public.tariff_type) to authenticated;
