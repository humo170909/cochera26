-- =============================================================================
-- FIX: "function gen_random_bytes(integer) does not exist" al registrar un
-- ingreso.
--
-- CAUSA RAÍZ (encontrada, no asumida):
--
-- 1. Dónde se llama: un único call site en todo el proyecto —
--    supabase/migrations/0012_entry_tickets.sql, dentro de
--    register_vehicle_entry(), línea que genera el token del ticket:
--      v_ticket_token := encode(gen_random_bytes(20), 'hex');
--    Es la ÚNICA función de todo el esquema que llama a una función de
--    pgcrypto — todo el resto del proyecto usa gen_random_uuid(), que es
--    un built-in de Postgres (vive en pg_catalog) y por eso nunca tuvo
--    este problema, aunque comparte el mismo patrón `set search_path`.
--
-- 2. Qué extensión hace falta: pgcrypto (gen_random_bytes es suya).
--    migración 0001_init.sql ya corre `create extension if not exists
--    pgcrypto;` sin `SCHEMA` explícito — en un proyecto Supabase hosteado,
--    pgcrypto viene preinstalada de fábrica en el schema `extensions`
--    (no en `public`), así que ese `create extension if not exists` fue
--    un no-op silencioso: no la reinstaló en `public`, solo confirmó que
--    ya existía (en `extensions`).
--
-- 3. Por qué falla igual estando instalada: register_vehicle_entry() (como
--    TODAS las funciones SECURITY DEFINER de este proyecto, a propósito,
--    para blindarlas contra search_path hijacking) declara
--    `set search_path = public`. Eso RESTRINGE la resolución de nombres a
--    únicamente el schema public durante la ejecución de la función,
--    excluyendo `extensions` — así que `gen_random_bytes(20)` sin calificar
--    no se encuentra, aunque exista y funcione perfectamente en cualquier
--    otra sesión/query normal (que sí hereda el search_path por defecto
--    del proyecto, el cual sí incluye `extensions`).
--
-- FIX (sin tocar datos, sin eliminar nada, misma firma de función — no
-- hace falta DROP): agregar "extensions" al search_path de la función
-- (`set search_path = public, extensions`), que es el patrón que la propia
-- documentación de Supabase recomienda para RPC SECURITY DEFINER que
-- necesitan funciones de extensiones. Se deja el call site SIN calificar
-- (`gen_random_bytes(20)`, tal como ya estaba) a propósito: así resuelve
-- correctamente sea cual sea el schema real donde termine viviendo
-- pgcrypto en este proyecto (extensions, que es lo estándar en Supabase,
-- o incluso public si alguna vez se reinstala ahí) sin necesidad de
-- adivinar y hardcodear un schema exacto que no pude verificar en vivo.
-- =============================================================================

-- Confirma la extensión sin moverla ni recrearla si ya existe en otro
-- schema (CREATE EXTENSION IF NOT EXISTS es no-op si el nombre ya existe,
-- sin importar en qué schema esté).
create extension if not exists pgcrypto with schema extensions;

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

  -- Ticket de ingreso: solo si NO es autorizado ni abonado (cubre HORA y
  -- PLANA, las dos únicas modalidades que generan cobro real). Antes
  -- fallaba con "function gen_random_bytes(integer) does not exist" porque
  -- el search_path de esta función (restringido a "public" por diseño)
  -- no incluía el schema donde realmente vive pgcrypto en Supabase; el fix
  -- está en el "set search_path" de la cabecera de esta función, no acá.
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

-- Firma sin cambios respecto a 0012: no hace falta reemplazar grants.

-- Fuerza a PostgREST a refrescar su caché de esquema inmediatamente.
notify pgrst, 'reload schema';
