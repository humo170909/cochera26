-- =============================================================================
-- EDITAR / ELIMINAR INGRESO+SALIDA (solo ADMIN)
--
-- Auditoría previa de relaciones (antes de escribir código):
--   - vehicle_exits.entry_id -> vehicle_entries(id) UNIQUE, sin CASCADE.
--   - entry_tickets.entry_id -> vehicle_entries(id), sin CASCADE, NOT NULL
--     (no se puede dejar huérfano ni poner en null: hay que borrarlo si se
--     borra el ingreso).
--   - parking_spots.current_entry_id -> vehicle_entries(id) (fk_parking_spots_current_entry).
--     Para un ingreso FINALIZADO ya está en null (register_vehicle_exit lo
--     limpia al salir); se refuerza de todos modos de forma defensiva.
--   - cash_movements.reference_id es un uuid SUELTO (sin FK) que para
--     source='VEHICULO' apunta a vehicle_exits.id — no bloquea nada a nivel
--     de base de datos, pero si no se sincroniza manualmente, la caja del
--     día quedaría con un monto/método de pago que ya no coincide con el
--     registro editado (o un cargo fantasma tras un borrado).
--   - vehicles(plate) es un catálogo compartido por placa: nunca se toca al
--     editar/eliminar UNA visita (lo usan también otras visitas de la misma
--     placa).
--
-- A diferencia de admin_delete_subscriber() (0010, que es un soft-delete
-- porque un abonado puede tener DECENAS de ingresos históricos que
-- dependen de él), acá se trata de UNA sola visita cuyos únicos
-- dependientes (su propio ticket 1:1 y su propio movimiento de caja) se
-- limpian explícitamente antes de borrar — no deja huérfanos ni rompe el
-- historial de nadie más, así que el DELETE físico que pide el
-- administrador es seguro.
--
-- Alcance: exclusivamente ingresos que YA tienen salida (status FINALIZADO),
-- que es lo que /historial muestra. No se tocan ingresos activos (todavía
-- estacionados): esos se gestionan desde /salida como siempre.
-- =============================================================================

-- =============================================================================
-- EDITAR
-- =============================================================================

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

  -- No se permite editar el tipo de tarifa (ABONADO/AUTORIZADO/HORA/PLANA)
  -- desde acá: se valida método de pago/importe contra el que YA tenía el
  -- registro, respetando la misma regla que chk_vehicle_exits_payment_method
  -- ya exige (abonado/autorizado nunca tienen cobro ni método de pago).
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

  -- Coherencia con caja: el movimiento (si existe) queda ATADO a la caja
  -- donde se registró originalmente — editar la fecha de salida NO lo
  -- traslada a otro día, solo corrige su monto/método/concepto. Si el
  -- importe pasa a ser 0 (ej. se corrige a "no debía cobrarse"), el
  -- movimiento se elimina (cash_movements.amount exige > 0, no admite 0).
  -- Si antes no existía movimiento (era abonado/autorizado) y ahora pasa a
  -- tener cobro, se crea uno nuevo en la caja de la fecha de salida vigente.
  select * into v_movement from public.cash_movements
    where reference_id = p_exit_id and source = 'VEHICULO';

  v_concept := (case v_exit_before.tariff_type when 'PLANA' then 'Cobro tarifa plana ' else 'Cobro estacionamiento ' end)
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

revoke execute on function public.admin_update_vehicle_visit(
  uuid, text, public.vehicle_type, uuid, timestamptz, timestamptz, public.payment_method, numeric
) from public;
grant execute on function public.admin_update_vehicle_visit(
  uuid, text, public.vehicle_type, uuid, timestamptz, timestamptz, public.payment_method, numeric
) to authenticated;

-- =============================================================================
-- ELIMINAR
-- =============================================================================

create or replace function public.admin_delete_vehicle_visit(p_exit_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_exit public.vehicle_exits;
  v_entry public.vehicle_entries;
  v_movement public.cash_movements;
  v_ticket public.entry_tickets;
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede eliminar un registro de ingreso/salida.';
  end if;

  select * into v_exit from public.vehicle_exits where id = p_exit_id for update;
  if not found then
    raise exception 'La salida indicada no existe.';
  end if;

  select * into v_entry from public.vehicle_entries where id = v_exit.entry_id for update;
  if not found then
    raise exception 'El ingreso asociado no existe.';
  end if;

  select * into v_movement from public.cash_movements
    where reference_id = p_exit_id and source = 'VEHICULO';

  select * into v_ticket from public.entry_tickets where entry_id = v_entry.id;

  delete from public.entry_tickets where entry_id = v_entry.id;
  delete from public.cash_movements where reference_id = p_exit_id and source = 'VEHICULO';
  delete from public.vehicle_exits where id = p_exit_id;

  -- Defensivo: un ingreso FINALIZADO ya debería tener current_entry_id en
  -- null (register_vehicle_exit lo limpia al salir); esto solo evita que el
  -- FK bloquee el borrado si algo quedó inconsistente.
  update public.parking_spots set current_entry_id = null where current_entry_id = v_entry.id;

  delete from public.vehicle_entries where id = v_entry.id;

  insert into public.audit_log (user_id, action, entity_type, entity_id, details)
  values (
    auth.uid(), 'ELIMINACION_INGRESO_SALIDA', 'vehicle_exits', p_exit_id::text,
    jsonb_build_object(
      'placa', v_entry.plate, 'espacio_id', v_entry.parking_spot_id,
      'ingreso', v_entry.entry_at, 'salida', v_exit.exit_at,
      'tipo_tarifa', v_exit.tariff_type, 'importe', v_exit.amount,
      'metodo_pago', v_exit.payment_method,
      'movimiento_caja_eliminado_id', v_movement.id,
      'ticket_code_eliminado', v_ticket.ticket_code
    )
  );
end;
$$;

revoke execute on function public.admin_delete_vehicle_visit(uuid) from public;
grant execute on function public.admin_delete_vehicle_visit(uuid) to authenticated;

notify pgrst, 'reload schema';
