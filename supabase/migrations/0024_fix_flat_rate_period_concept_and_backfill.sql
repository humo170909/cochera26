-- =============================================================================
-- AUDITORÍA COMPLETA POST TARIFA PLANA DÍA/NOCHE — 2 correcciones encontradas
--
-- 1) admin_update_vehicle_visit() (0020) arma el concepto del movimiento de
--    caja con `case v_exit_before.tariff_type when 'PLANA' then ...` — ese
--    'PLANA' quedó huérfano desde 0023: los registros nuevos ya nunca usan
--    'PLANA' (usan 'PLANA_DIA'/'PLANA_NOCHE'), así que editar el importe/
--    método de pago de una salida con tarifa plana día/noche generaba un
--    concepto genérico "Cobro estacionamiento" en vez de identificar la
--    modalidad. No afecta el MONTO (eso seguía correcto), solo el texto
--    descriptivo del movimiento en caja. Se corrige el CASE para reconocer
--    los 3 valores históricos/vigentes.
--
-- 2) entry_tickets.tariff_type: las filas existentes con 'PLANA' (tickets
--    emitidos antes de esta migración, de ingresos que backfillearon su
--    vehicle_entries.flat_rate_period a 'PLANA_DIA' en 0023) quedaron
--    desincronizadas — el ingreso ya dice PLANA_DIA pero su propio ticket
--    sigue diciendo PLANA. No es visible en el ticket impreso (no muestra
--    tarifa) y no afecta ningún cálculo, pero se corrige por coherencia de
--    datos: ambas tablas deben decir lo mismo para la misma visita.
-- =============================================================================

update public.entry_tickets
set tariff_type = 'PLANA_DIA'
where tariff_type = 'PLANA';

create or replace function public.admin_update_vehicle_visit(
  p_exit_id uuid,
  p_plate text,
  p_vehicle_type public.vehicle_type,
  p_spot_id uuid,
  p_entry_at timestamptz,
  p_exit_at timestamptz,
  p_payment_method public.payment_method,
  p_amount numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_exit_before public.vehicle_exits;
  v_entry_before public.vehicle_entries;
  v_spot public.parking_spots;
  v_plate text := upper(trim(p_plate));
  v_minutes integer;
  v_movement public.cash_movements;
  v_register public.cash_registers;
  v_concept text;
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede editar un registro de ingreso/salida.';
  end if;

  select * into v_exit_before from public.vehicle_exits where id = p_exit_id for update;
  if not found then
    raise exception 'La salida indicada no existe.';
  end if;

  select * into v_entry_before from public.vehicle_entries where id = v_exit_before.entry_id for update;
  if not found then
    raise exception 'El ingreso asociado no existe.';
  end if;

  if v_plate is null or length(v_plate) < 5 then
    raise exception 'La placa ingresada no es válida.';
  end if;

  select * into v_spot from public.parking_spots where id = p_spot_id;
  if not found then
    raise exception 'El estacionamiento seleccionado no existe.';
  end if;

  if p_exit_at <= p_entry_at then
    raise exception 'La fecha/hora de salida debe ser posterior a la de ingreso.';
  end if;

  if p_amount < 0 then
    raise exception 'El importe no puede ser negativo.';
  end if;

  -- No se permite editar el tipo de tarifa desde acá: se valida método de
  -- pago/importe contra el que YA tenía el registro, respetando la misma
  -- regla que chk_vehicle_exits_payment_method ya exige (abonado/
  -- autorizado nunca tienen cobro ni método de pago).
  if v_exit_before.tariff_type in ('ABONADO', 'AUTORIZADO') then
    if p_payment_method is not null or p_amount <> 0 then
      raise exception 'Este registro es % y no admite método de pago ni importe.', v_exit_before.tariff_type;
    end if;
  else
    if p_payment_method is null then
      raise exception 'Debe indicar un método de pago.';
    end if;
  end if;

  v_minutes := greatest(0, ceil(extract(epoch from (p_exit_at - p_entry_at)) / 60.0))::integer;

  insert into public.vehicles (plate, vehicle_type)
  values (v_plate, p_vehicle_type)
  on conflict (plate) do update set vehicle_type = excluded.vehicle_type;

  update public.vehicle_entries set
    plate = v_plate,
    vehicle_type = p_vehicle_type,
    parking_spot_id = p_spot_id,
    entry_at = p_entry_at
  where id = v_entry_before.id;

  update public.vehicle_exits set
    exit_at = p_exit_at,
    duration_minutes = v_minutes,
    payment_method = p_payment_method,
    amount = p_amount
  where id = p_exit_id;

  select * into v_movement from public.cash_movements
    where reference_id = p_exit_id and source = 'VEHICULO';

  -- FIX (auditoría): reconoce PLANA_DIA/PLANA_NOCHE además del histórico
  -- 'PLANA' — antes solo reconocía 'PLANA' y caía siempre a "Cobro
  -- estacionamiento" para tarifa plana día/noche.
  v_concept := (case v_exit_before.tariff_type
      when 'PLANA_DIA' then 'Cobro tarifa plana día '
      when 'PLANA_NOCHE' then 'Cobro tarifa plana noche '
      when 'PLANA' then 'Cobro tarifa plana '
      else 'Cobro estacionamiento '
    end)
    || v_spot.code || ' - placa ' || v_plate || ' (editado por admin)';

  if p_amount > 0 then
    if found then
      update public.cash_movements set
        amount = p_amount,
        payment_method = p_payment_method,
        concept = v_concept
      where id = v_movement.id;
    else
      select * into v_register from public.cash_registers
        where business_date = public.lima_date(p_exit_at);
      if not found then
        raise exception 'No existe una caja registrada para la fecha de salida indicada. Ajusta la fecha o crea primero la caja de ese día.';
      end if;

      insert into public.cash_movements (
        cash_register_id, type, source, concept, amount, payment_method, reference_id, registered_by
      ) values (
        v_register.id, 'INGRESO', 'VEHICULO', v_concept, p_amount, p_payment_method, p_exit_id, auth.uid()
      );
    end if;
  else
    if found then
      delete from public.cash_movements where id = v_movement.id;
    end if;
  end if;

  insert into public.audit_log (user_id, action, entity_type, entity_id, details)
  values (
    auth.uid(), 'EDICION_INGRESO_SALIDA', 'vehicle_exits', p_exit_id::text,
    jsonb_build_object(
      'antes', jsonb_build_object(
        'placa', v_entry_before.plate, 'tipo', v_entry_before.vehicle_type,
        'espacio_id', v_entry_before.parking_spot_id, 'ingreso', v_entry_before.entry_at,
        'salida', v_exit_before.exit_at, 'metodo_pago', v_exit_before.payment_method,
        'importe', v_exit_before.amount
      ),
      'despues', jsonb_build_object(
        'placa', v_plate, 'tipo', p_vehicle_type,
        'espacio_id', p_spot_id, 'ingreso', p_entry_at,
        'salida', p_exit_at, 'metodo_pago', p_payment_method,
        'importe', p_amount
      )
    )
  );

  return jsonb_build_object('exitId', p_exit_id, 'entryId', v_entry_before.id);
end;
$$;

-- Firma sin cambios respecto a 0020: no hace falta reemplazar grants.

notify pgrst, 'reload schema';
