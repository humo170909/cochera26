-- =============================================================================
-- TARIFA PLANA DÍA / NOCHE — paso 2 (KRD PARK)
--
-- Auditoría previa (antes de escribir nada):
--   - flat_rate_settings ya existía como fila única (id=true) con UN solo
--     precio, hora_limite, dias_aplicacion, activo, cupo_maximo. No había
--     ninguna distinción día/noche. Se agrega precio_noche a la MISMA fila
--     (no una tabla nueva): sigue siendo una sola configuración de tarifa
--     plana, ahora con dos precios.
--   - vehicle_entries.flat_rate_reserved/flat_rate_price_snapshot ya
--     existían (0006/0007) y NO se tocan: se agrega flat_rate_period para
--     saber CUÁL de las dos modalidades corresponde. Se reutiliza el mismo
--     enum public.tariff_type (el campo que el propio pedido sugería como
--     "tariff_type") en vez de inventar un texto/booleano nuevo — el mismo
--     valor ('PLANA_DIA'/'PLANA_NOCHE') fluye sin traducciones desde el
--     ingreso hasta vehicle_exits.tariff_type, entry_tickets.tariff_type,
--     el historial y el ticket.
--   - entry_tickets.tariff_type tenía un CHECK inline limitado a
--     ('HORA','PLANA'): hay que ampliarlo para aceptar los dos valores
--     nuevos (conservando 'PLANA' para no romper filas históricas ya
--     guardadas con ese valor).
--   - register_vehicle_exit() YA decide "PLANA" únicamente a través de
--     vehicle_entries.flat_rate_reserved (branch elsif, nunca vuelve a
--     evaluar hora/tolerancia para ese caso) — ese es exactamente el
--     mecanismo que impide el bug histórico de "se cobra S/3.50 por hora".
--     Solo cambia CUÁL etiqueta se asigna (flat_rate_period en vez de la
--     constante 'PLANA'), la lógica de "nunca recalcular" queda intacta.
--
-- Regla de negocio para la ventana horaria (hora_limite/dias_aplicacion):
-- se preserva EXACTAMENTE igual que antes, pero ahora solo gobierna la
-- modalidad DÍA (que es, en los hechos, la tarifa plana que ya existía).
-- NOCHE es un producto nuevo, sin restricción horaria, sujeto únicamente a
-- "activo" y al cupo máximo compartido (misma cuenta de
-- flat_rate_reserved = true que ya existía, sin duplicar el conteo).
-- =============================================================================

alter table public.flat_rate_settings
  add column precio_noche numeric(10,2) not null default 15.00 check (precio_noche > 0);

comment on table public.flat_rate_settings is
  'Tarifa plana: precio (día, sujeto a hora_limite/dias_aplicacion) y precio_noche (sin restricción horaria). Elegida manualmente por el colaborador al ingreso.';

alter table public.vehicle_entries
  add column flat_rate_period public.tariff_type check (flat_rate_period in ('PLANA_DIA', 'PLANA_NOCHE'));

comment on column public.vehicle_entries.flat_rate_period is
  'Solo cuando flat_rate_reserved = true: PLANA_DIA o PLANA_NOCHE. Mismo valor se copia tal cual a vehicle_exits.tariff_type y entry_tickets.tariff_type al salir/emitir ticket.';

-- Backfill: toda reserva de tarifa plana hecha ANTES de esta migración era,
-- por definición, la única modalidad que existía — equivalente a DÍA.
update public.vehicle_entries
set flat_rate_period = 'PLANA_DIA'
where flat_rate_reserved = true and flat_rate_period is null;

-- Amplía el CHECK de entry_tickets.tariff_type sin asumir el nombre exacto
-- que Postgres le dio automáticamente al ser un CHECK inline sin nombre.
do $$
declare
  v_constraint_name text;
begin
  select con.conname into v_constraint_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'entry_tickets'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%tariff_type%';

  if v_constraint_name is not null then
    execute format('alter table public.entry_tickets drop constraint %I', v_constraint_name);
  end if;

  alter table public.entry_tickets add constraint entry_tickets_tariff_type_check
    check (tariff_type in ('HORA', 'PLANA', 'PLANA_DIA', 'PLANA_NOCHE'));
end;
$$;

-- =============================================================================
-- register_vehicle_entry(): gana un 5º parámetro (p_flat_rate_period).
-- Cambia el conjunto de tipos de la firma -> requiere DROP explícito de la
-- versión de 4 argumentos para no dejar un overload viejo y ambiguo
-- invocable con los 4 parámetros originales (mismo motivo por el que
-- register_vehicle_exit se dropeó al ganar p_ticket_code en 0012).
-- =============================================================================

drop function if exists public.register_vehicle_entry(text, public.vehicle_type, uuid, boolean);

create or replace function public.register_vehicle_entry(
  p_plate text,
  p_vehicle_type public.vehicle_type,
  p_spot_id uuid,
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
    if p_flat_rate_period is null or p_flat_rate_period not in ('PLANA_DIA', 'PLANA_NOCHE') then
      raise exception 'Debes indicar si la tarifa plana es DÍA o NOCHE.';
    end if;

    perform pg_advisory_xact_lock(hashtext('flat_rate_reservation'));

    select * into v_flat from public.flat_rate_settings where id = true;
    if v_flat is null or not v_flat.activo then
      raise exception 'La tarifa plana no está disponible actualmente.';
    end if;

    -- Ventana horaria: EXACTAMENTE la misma regla que ya existía, ahora
    -- acotada a DÍA. NOCHE no tiene restricción horaria.
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

revoke execute on function public.register_vehicle_entry(
  text, public.vehicle_type, uuid, boolean, public.tariff_type
) from public;
grant execute on function public.register_vehicle_entry(
  text, public.vehicle_type, uuid, boolean, public.tariff_type
) to authenticated;

-- =============================================================================
-- register_vehicle_exit(): misma firma (no cambia), solo cambia CÓMO se
-- etiqueta una salida cubierta por tarifa plana. El branch que decide "esto
-- es plana, no recalcules nada" (elsif v_entry.flat_rate_reserved) queda
-- intacto — solo se lee flat_rate_period en vez de escribir la constante
-- 'PLANA'. El coalesce es una red de seguridad para filas activas que
-- pudieran haber quedado sin backfill (no debería ocurrir: el backfill de
-- arriba ya cubre todo lo existente).
-- =============================================================================

create or replace function public.register_vehicle_exit(
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

    v_effective_type := coalesce(v_entry.flat_rate_period, 'PLANA_DIA'::public.tariff_type);
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

  update public.entry_tickets
  set status = 'USED', used_at = v_exit_at, used_by = auth.uid()
  where entry_id = p_entry_id and status = 'ACTIVE'
  returning * into v_ticket;

  -- AUTORIZADO y ABONADO tienen v_amount = 0: nunca generan cash_movement.
  if v_amount > 0 then
    v_concept := (case v_effective_type
        when 'PLANA_DIA' then 'Cobro tarifa plana día '
        when 'PLANA_NOCHE' then 'Cobro tarifa plana noche '
        else 'Cobro estacionamiento '
      end)
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

-- Firma sin cambios respecto a 0014: no hace falta reemplazar grants.

notify pgrst, 'reload schema';
