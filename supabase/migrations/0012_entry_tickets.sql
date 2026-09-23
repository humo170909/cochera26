-- =============================================================================
-- TICKETS DE INGRESO (KRD PARK)
--
-- Un ticket se emite SOLO para ingresos que generan cobro real: tarifa por
-- hora o tarifa plana. Nunca para abonado activo, vehículo autorizado ni
-- reservado/propietario (v_authorized.id / v_subscriber.id ya son las
-- mismas variables que register_vehicle_entry usa para decidir el cobro:
-- la elegibilidad del ticket usa exactamente esa misma fuente de verdad,
-- nunca una regla nueva ni algo decidido en el cliente).
--
-- Seguridad anticopia: cada ticket tiene un validation_token largo
-- (20 bytes de pgcrypto/gen_random_bytes, 160 bits) que es lo único que
-- codifica el QR, y un validation_code corto derivado de sus primeros 8
-- caracteres hex (para tipeo manual de respaldo). Ninguno de los dos es
-- secuencial ni adivinable. La verificación es siempre una consulta a esta
-- tabla dentro de una función SECURITY DEFINER — nunca una firma que el
-- cliente pueda recalcular, y la clave (si la hubiera) nunca vive en el
-- frontend.
-- =============================================================================

create type public.ticket_status as enum ('ACTIVE', 'USED', 'CANCELLED', 'VOID');

create sequence public.entry_tickets_seq;

create table public.entry_tickets (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.vehicle_entries(id),
  ticket_code text not null,
  validation_code text not null,
  validation_token text not null,
  plate text not null,
  plate_normalizada text generated always as (public.normalize_plate(plate)) stored,
  parking_spot_id uuid not null references public.parking_spots(id),
  vehicle_type public.vehicle_type not null,
  tariff_type public.tariff_type not null check (tariff_type in ('HORA', 'PLANA')),
  tariff_amount numeric(10,2) not null,
  status public.ticket_status not null default 'ACTIVE',
  issued_at timestamptz not null default now(),
  issued_by uuid not null references public.profiles(id),
  used_at timestamptz,
  used_by uuid references public.profiles(id),
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

comment on table public.entry_tickets is
  'Ticket físico entregado al ingreso (solo HORA/PLANA). Un solo uso: pasa a USED al completar la salida asociada, nunca se reimprime otro en la salida.';

create unique index ux_entry_tickets_entry on public.entry_tickets(entry_id);
create unique index ux_entry_tickets_validation_token on public.entry_tickets(validation_token);
create unique index ux_entry_tickets_validation_code on public.entry_tickets(validation_code);
create index ix_entry_tickets_status on public.entry_tickets(status);
create index ix_entry_tickets_plate_normalizada on public.entry_tickets(plate_normalizada);

-- RLS: sin políticas de INSERT/UPDATE/DELETE/SELECT para "authenticated" a
-- propósito. Ningún componente hace .from("entry_tickets") directo: toda
-- lectura/escritura pasa por las funciones SECURITY DEFINER de abajo, que
-- ya validan is_active_staff()/is_admin() internamente. Esto es más
-- restrictivo que cash_movements (que sí expone SELECT directo) porque acá
-- no hace falta exponer la tabla cruda al cliente en ningún flujo.
alter table public.entry_tickets enable row level security;

-- =============================================================================
-- register_vehicle_entry — se agrega emisión de ticket al final, sin tocar
-- ninguna regla de negocio existente (misma firma, mismo cálculo de
-- autorizado/abonado/tarifa plana que ya estaba).
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
  -- PLANA, las dos únicas modalidades que generan cobro real).
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

-- =============================================================================
-- get_entry_ticket — trae el ticket recién emitido (o uno existente, para
-- reimprimirlo) con TODO lo necesario para pintarlo/imprimirlo: incluye el
-- validation_token en crudo porque es exactamente lo que va dentro del QR.
-- Solo se llama inmediatamente después de un ingreso propio o al reimprimir
-- desde la ficha del espacio — nunca se lista en bloque.
-- =============================================================================

create or replace function public.get_entry_ticket(p_entry_id uuid)
returns table (
  id uuid,
  ticket_code text,
  validation_code text,
  validation_token text,
  plate text,
  vehicle_type public.vehicle_type,
  spot_code text,
  tariff_type public.tariff_type,
  tariff_amount numeric,
  status public.ticket_status,
  issued_at timestamptz
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
  select t.id, t.ticket_code, t.validation_code, t.validation_token, t.plate,
    t.vehicle_type, ps.code, t.tariff_type, t.tariff_amount, t.status, t.issued_at
  from public.entry_tickets t
  join public.parking_spots ps on ps.id = t.parking_spot_id
  where t.entry_id = p_entry_id;
end;
$$;

-- =============================================================================
-- validate_entry_ticket — chequeo de salida. Acepta el token largo (QR) o el
-- código corto (tipeo manual), y si se pasa p_expected_entry_id (el
-- vehículo que el colaborador seleccionó en /salida) también verifica que
-- el ticket pertenezca a ESA entrada, no solo que exista y esté activo —
-- así una copia del ticket de otro vehículo no pasa la validación aunque el
-- código en sí sea real. Deja rastro en auditoría de cada intento.
-- =============================================================================

create or replace function public.validate_entry_ticket(
  p_code text,
  p_expected_entry_id uuid default null
)
returns table (
  outcome text,
  ticket_id uuid,
  entry_id uuid,
  plate text,
  spot_code text,
  status public.ticket_status
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_input text := upper(trim(p_code));
  v_ticket public.entry_tickets;
  v_spot_code text;
  v_outcome text;
begin
  if not public.is_active_staff() then
    raise exception 'No tienes permisos para realizar esta acción.';
  end if;

  if v_input is null or length(v_input) = 0 then
    raise exception 'Ingresa el código del ticket.';
  end if;

  select * into v_ticket from public.entry_tickets
    where upper(validation_token) = v_input or upper(validation_code) = v_input
    limit 1;

  if not found then
    insert into public.audit_log (user_id, action, entity_type, details)
    values (auth.uid(), 'TICKET_INVALID', 'entry_tickets', jsonb_build_object('codigo_ingresado', v_input));
    return query select 'NOT_FOUND'::text, null::uuid, null::uuid, null::text, null::text, null::public.ticket_status;
    return;
  end if;

  select ps.code into v_spot_code from public.parking_spots ps where ps.id = v_ticket.parking_spot_id;

  if p_expected_entry_id is not null and v_ticket.entry_id <> p_expected_entry_id then
    v_outcome := 'WRONG_VEHICLE';
    insert into public.audit_log (user_id, action, entity_type, entity_id, details)
    values (auth.uid(), 'TICKET_INVALID', 'entry_tickets', v_ticket.id::text,
      jsonb_build_object('motivo', 'placa_no_corresponde', 'placa_ticket', v_ticket.plate, 'ticket_code', v_ticket.ticket_code));
  elsif v_ticket.status = 'USED' then
    v_outcome := 'ALREADY_USED';
    insert into public.audit_log (user_id, action, entity_type, entity_id, details)
    values (auth.uid(), 'TICKET_ALREADY_USED', 'entry_tickets', v_ticket.id::text,
      jsonb_build_object('placa', v_ticket.plate, 'ticket_code', v_ticket.ticket_code));
  elsif v_ticket.status in ('CANCELLED', 'VOID') then
    v_outcome := 'CANCELLED';
    insert into public.audit_log (user_id, action, entity_type, entity_id, details)
    values (auth.uid(), 'TICKET_INVALID', 'entry_tickets', v_ticket.id::text,
      jsonb_build_object('placa', v_ticket.plate, 'ticket_code', v_ticket.ticket_code, 'motivo', v_ticket.status));
  else
    v_outcome := 'VALID';
    insert into public.audit_log (user_id, action, entity_type, entity_id, details)
    values (auth.uid(), 'TICKET_VALIDATED', 'entry_tickets', v_ticket.id::text,
      jsonb_build_object('placa', v_ticket.plate, 'ticket_code', v_ticket.ticket_code));
  end if;

  return query select v_outcome, v_ticket.id, v_ticket.entry_id, v_ticket.plate, v_spot_code, v_ticket.status;
end;
$$;

-- =============================================================================
-- register_vehicle_exit — se agrega p_ticket_code (parámetro nuevo al
-- final, con default, no rompe llamadas existentes). Si la entrada tiene
-- ticket asociado, exige validarlo correctamente y lo marca USED dentro de
-- la MISMA transacción que la salida — nunca se confía en que el paso de
-- validación anterior del frontend baste por sí solo. Si la entrada nunca
-- tuvo ticket (abonado/autorizado/reservado), el comportamiento es
-- idéntico al que ya existía.
-- =============================================================================

-- CREATE OR REPLACE exige la MISMA firma para reemplazar una función; como
-- esta gana un parámetro nuevo, hay que DROP explícito primero o Postgres
-- crearía una segunda función sobrecargada (register_vehicle_exit de 3
-- argumentos conviviendo con la de 4), lo cual además rompe la resolución
-- de PostgREST por ambigüedad de sobrecarga.
drop function if exists public.register_vehicle_exit(uuid, public.payment_method, public.tariff_type);

create function public.register_vehicle_exit(
  p_entry_id uuid,
  p_payment_method public.payment_method,
  p_tariff_type public.tariff_type default 'HORA',
  p_ticket_code text default null
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
  v_ticket public.entry_tickets;
  v_ticket_input text;
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

  -- Si esta entrada emitió ticket, su salida exige validarlo (mismo código
  -- que ya se validó en pantalla, revalidado acá server-side) y se marca
  -- USED en este mismo commit. Si nunca tuvo ticket (abonado/autorizado),
  -- no hay nada que chequear.
  select * into v_ticket from public.entry_tickets where entry_id = p_entry_id for update;
  if found then
    if p_ticket_code is null or length(trim(p_ticket_code)) = 0 then
      raise exception 'Debes validar el ticket de ingreso antes de registrar la salida.';
    end if;

    v_ticket_input := upper(trim(p_ticket_code));
    if upper(v_ticket.validation_token) <> v_ticket_input and upper(v_ticket.validation_code) <> v_ticket_input then
      raise exception 'El código de ticket no coincide con el ticket de esta entrada.';
    end if;

    if v_ticket.status = 'USED' then
      raise exception 'Este ticket ya fue utilizado.';
    end if;

    if v_ticket.status in ('CANCELLED', 'VOID') then
      raise exception 'Este ticket fue anulado y no es válido.';
    end if;
  end if;

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

  if v_ticket.id is not null then
    update public.entry_tickets set status = 'USED', used_at = v_exit_at, used_by = auth.uid()
    where id = v_ticket.id;
  end if;

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
      'monto', v_amount, 'metodo_pago', p_payment_method,
      'ticket_code', v_ticket.ticket_code
    )
  );

  return v_exit;
end;
$$;

-- =============================================================================
-- admin_cancel_entry_ticket — capacidad administrativa para anular un
-- ticket (p.ej. impreso con datos erróneos). Sin UI en esta entrega; queda
-- disponible en el backend para cuando se necesite. Nunca lo puede llamar
-- el trabajador (is_admin(), no is_active_staff()).
-- =============================================================================

create or replace function public.admin_cancel_entry_ticket(p_ticket_id uuid)
returns public.entry_tickets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket public.entry_tickets;
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede anular un ticket.';
  end if;

  select * into v_ticket from public.entry_tickets where id = p_ticket_id for update;
  if not found then
    raise exception 'Ticket no encontrado.';
  end if;
  if v_ticket.status = 'USED' then
    raise exception 'No se puede anular un ticket que ya fue utilizado.';
  end if;

  update public.entry_tickets set status = 'CANCELLED', cancelled_at = now(), cancelled_by = auth.uid()
  where id = p_ticket_id
  returning * into v_ticket;

  insert into public.audit_log (user_id, action, entity_type, entity_id, details)
  values (auth.uid(), 'TICKET_CANCELLED', 'entry_tickets', v_ticket.id::text,
    jsonb_build_object('placa', v_ticket.plate, 'ticket_code', v_ticket.ticket_code));

  return v_ticket;
end;
$$;

-- =============================================================================
-- GRANTS
-- =============================================================================

revoke execute on function public.register_vehicle_entry(text, public.vehicle_type, uuid, boolean) from public;
grant execute on function public.register_vehicle_entry(text, public.vehicle_type, uuid, boolean) to authenticated;

revoke execute on function public.register_vehicle_exit(uuid, public.payment_method, public.tariff_type, text) from public;
grant execute on function public.register_vehicle_exit(uuid, public.payment_method, public.tariff_type, text) to authenticated;

revoke execute on function public.get_entry_ticket(uuid) from public;
grant execute on function public.get_entry_ticket(uuid) to authenticated;

revoke execute on function public.validate_entry_ticket(text, uuid) from public;
grant execute on function public.validate_entry_ticket(text, uuid) to authenticated;

revoke execute on function public.admin_cancel_entry_ticket(uuid) from public;
grant execute on function public.admin_cancel_entry_ticket(uuid) to authenticated;

-- Fuerza a PostgREST a refrescar su caché de esquema inmediatamente.
notify pgrst, 'reload schema';
