-- =============================================================================
-- REINICIO DE CAJA DEL DÍA ACTUAL (solo ADMIN)
--
-- Auditoría de las tablas involucradas antes de tocar nada:
--   - vehicle_entries.plate  -> vehicles(plate)               [NO se toca `vehicles`, es solo un catálogo de placas]
--   - vehicle_exits.entry_id -> vehicle_entries(id) UNIQUE     [1 salida por ingreso, sin ON DELETE CASCADE]
--   - entry_tickets.entry_id -> vehicle_entries(id)            [sin ON DELETE CASCADE]
--   - parking_spots.current_entry_id -> vehicle_entries(id)    [FK fk_parking_spots_current_entry, sin CASCADE:
--                                                                hay que limpiarla ANTES de borrar el ingreso o
--                                                                la base de datos rechaza el DELETE]
--   - cash_movements.reference_id                              [uuid SUELTO, sin FK -> apunta a vehicle_exits.id o
--                                                                restroom_uses.id según `source`, pero no hay
--                                                                restricción que obligue un orden de borrado]
--   - cash_movements.cash_register_id -> cash_registers(id)    [toda la caja de HOY (VEHICULO/BANO/OTRO) cuelga de
--                                                                la única fila cash_registers con business_date =
--                                                                today_lima(), por lo que basta con borrar por
--                                                                cash_register_id para vaciarla completa]
--   - subscriber_payments, subscribers, authorized_vehicles,
--     tariffs, system_settings, profiles, audit_log            [NUNCA tocados por esta función]
--
-- "Día actual" se determina siempre con public.lima_date(...) / public.today_lima()
-- (America/Lima), igual que el resto del sistema (get_dashboard_snapshot, etc.).
--
-- Alcance deliberado: solo se consideran para borrado los `vehicle_entries`
-- cuyo entry_at cae HOY. Una salida fechada hoy mismo pero que pertenece a
-- un ingreso de un día ANTERIOR (ej. vehículo que quedó toda la noche) NO se
-- toca: borrar esa salida obligaría a modificar el estado de un ingreso que
-- pertenece a "otro día", justo lo que el administrador pidió no hacer. Se
-- prioriza la regla explícita "nunca datos de otros días" sobre ese caso
-- borde, que en la práctica de una sesión de pruebas del mismo día no
-- ocurre (todo lo creado hoy, entra y sale hoy).
--
-- Todo corre dentro de una sola función PL/pgSQL: si cualquier paso falla,
-- Postgres revierte la transacción completa (atomicidad real, no manual).
-- =============================================================================

create or replace function public.admin_reset_daily_cash_operations()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := public.today_lima();
  v_register public.cash_registers;
  v_entry_ids uuid[];
  v_count_entries int := 0;
  v_count_exits int := 0;
  v_count_tickets int := 0;
  v_count_restroom int := 0;
  v_count_movements int := 0;
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede reiniciar la caja del día.';
  end if;

  -- Bloquea los ingresos de hoy (evita choques con un ingreso/salida
  -- concurrente mientras se reinicia).
  with locked as (
    select id from public.vehicle_entries
    where public.lima_date(entry_at) = v_today
    for update
  )
  select array_agg(id) into v_entry_ids from locked;

  if v_entry_ids is not null then
    delete from public.entry_tickets where entry_id = any(v_entry_ids);
    get diagnostics v_count_tickets = row_count;

    delete from public.vehicle_exits where entry_id = any(v_entry_ids);
    get diagnostics v_count_exits = row_count;

    -- Debe ir antes del delete de vehicle_entries: fk_parking_spots_current_entry
    -- rechazaría el borrado si algún espacio todavía apunta a estos ingresos.
    update public.parking_spots set status = 'LIBRE', current_entry_id = null
      where current_entry_id = any(v_entry_ids);

    delete from public.vehicle_entries where id = any(v_entry_ids);
    get diagnostics v_count_entries = row_count;
  end if;

  delete from public.restroom_uses where public.lima_date(used_at) = v_today;
  get diagnostics v_count_restroom = row_count;

  select * into v_register from public.cash_registers where business_date = v_today for update;
  if found then
    -- Todo movimiento de hoy (cobros de vehículo, baños, manuales) cuelga
    -- de esta única fila del día: borrarlos por cash_register_id la deja
    -- en S/ 0.00 sin tener que adivinar fechas por movimiento.
    delete from public.cash_movements where cash_register_id = v_register.id;
    get diagnostics v_count_movements = row_count;

    update public.cash_registers set
      status = 'ABIERTA',
      opened_at = now(),
      opened_by = auth.uid(),
      opening_amount = 0,
      closed_at = null,
      closed_by = null,
      expected_amount = null,
      declared_amount = null,
      difference = null,
      notes = null
    where id = v_register.id
    returning * into v_register;
  end if;

  -- audit_log es inmutable (ver comentario en 0001_init.sql): no se borra
  -- nada de ahí, solo se agrega el registro de esta acción.
  insert into public.audit_log (user_id, action, entity_type, entity_id, details)
  values (
    auth.uid(), 'REINICIO_CAJA_DIA', 'cash_registers',
    coalesce(v_register.id::text, v_today::text),
    jsonb_build_object(
      'business_date', v_today,
      'ingresos_eliminados', v_count_entries,
      'salidas_eliminadas', v_count_exits,
      'tickets_eliminados', v_count_tickets,
      'banos_eliminados', v_count_restroom,
      'movimientos_eliminados', v_count_movements,
      'caja_reiniciada', v_register.id is not null
    )
  );

  select jsonb_build_object(
    'business_date', v_today,
    'ingresos_eliminados', v_count_entries,
    'salidas_eliminadas', v_count_exits,
    'tickets_eliminados', v_count_tickets,
    'banos_eliminados', v_count_restroom,
    'movimientos_eliminados', v_count_movements,
    'caja_reiniciada', v_register.id is not null
  ) into v_result;

  return v_result;
end;
$$;

revoke execute on function public.admin_reset_daily_cash_operations() from public;
grant execute on function public.admin_reset_daily_cash_operations() to authenticated;

-- Fuerza a PostgREST a refrescar su caché de esquema inmediatamente.
notify pgrst, 'reload schema';
