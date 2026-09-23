-- =============================================================================
-- SIMPLIFICAR SALIDA: ya no se exige código de ticket para cerrar la salida.
--
-- Antes (0012): si la entrada tenía ticket, register_vehicle_exit() exigía
-- p_ticket_code, lo comparaba contra validation_token/validation_code y
-- rechazaba la salida si faltaba o no coincidía.
--
-- Ahora: el colaborador ya no escanea/escribe ningún código. La seguridad
-- de "cerrar la entrada correcta, una sola vez, sin choques entre dos
-- colaboradores" sigue intacta y no depende del código en absoluto — la da
-- el propio `select ... where status = 'ACTIVO' for update` sobre
-- vehicle_entries (bloquea la fila; un segundo intento concurrente
-- encuentra la entrada ya en 'FINALIZADO' y es rechazado) más
-- is_active_staff(). El ticket, si existe, se sigue marcando USED
-- automáticamente por entry_id — no como control de seguridad, sino como
-- registro histórico/auditoría de que esa visita ya cerró.
--
-- El código y el token del ticket NO se eliminan de la base de datos: la
-- columna, el historial y la función validate_entry_ticket() siguen
-- existiendo tal cual, por si en el futuro se necesitan para control
-- administrativo. Simplemente ya no son requisito para procesar la salida.
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

  -- Ya no se exige ni se compara p_ticket_code: si esta entrada emitió
  -- ticket, simplemente se marca USED por entry_id (identificación por el
  -- registro de entrada, no por código escaneado/tipeado).
  update public.entry_tickets
  set status = 'USED', used_at = v_exit_at, used_by = auth.uid()
  where entry_id = p_entry_id and status = 'ACTIVE'
  returning * into v_ticket;

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

-- Firma sin cambios respecto a 0012/0013: no hace falta reemplazar grants.

-- Fuerza a PostgREST a refrescar su caché de esquema inmediatamente.
notify pgrst, 'reload schema';
