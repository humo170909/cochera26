-- =============================================================================
-- CORREGIR TIPO DE VEHÍCULO DE UN INGRESO ACTIVO (COLABORADOR y ADMIN)
--
-- Revisión previa (para no duplicar nada):
--   - admin_update_vehicle_visit() (0020) ya permite corregir vehicle_type,
--     pero SOLO en visitas YA FINALIZADAS (recibe p_exit_id) y solo para
--     ADMIN. No sirve para un vehículo que sigue estacionado ahora mismo.
--   - No existe ninguna otra función que actualice vehicle_entries.vehicle_type
--     fuera de register_vehicle_entry() (al crear el ingreso).
--   - Esta es, por lo tanto, una función nueva y no una duplicada: cubre el
--     caso "el vehículo TODAVÍA está adentro y el tipo se cargó mal".
--
-- Alcance deliberadamente mínimo: SOLO actualiza vehicle_type de un ingreso
-- con status = 'ACTIVO'. No toca placa, espacio, fecha/hora, tarifa, pago,
-- caja, abono ni usuario — ninguno de esos es parámetro de esta función.
-- El tipo se sigue leyendo en vivo desde vehicle_entries.vehicle_type al
-- momento de la salida (register_vehicle_exit calcula la tarifa horaria
-- contra el tipo ACTUAL de la fila, nunca contra una fotografía tomada al
-- ingreso), así que el cambio queda reflejado automáticamente en historial
-- y en el cobro de salida sin tocar esas funciones.
-- =============================================================================

create or replace function public.update_active_entry_vehicle_type(
  p_entry_id uuid,
  p_vehicle_type public.vehicle_type
)
returns public.vehicle_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry public.vehicle_entries;
  v_previous public.vehicle_type;
begin
  if not public.is_active_staff() then
    raise exception 'No tienes permisos para realizar esta acción.';
  end if;

  select * into v_entry from public.vehicle_entries
    where id = p_entry_id and status = 'ACTIVO' for update;
  if not found then
    raise exception 'Este ingreso ya no está activo o no existe.';
  end if;

  v_previous := v_entry.vehicle_type;

  update public.vehicle_entries set vehicle_type = p_vehicle_type where id = p_entry_id
  returning * into v_entry;

  -- Mismo upsert que ya hace register_vehicle_entry() al crear el ingreso:
  -- mantiene el catálogo de vehículos (por placa) consistente con el
  -- último tipo conocido, sin inventar un mecanismo nuevo.
  insert into public.vehicles (plate, vehicle_type)
  values (v_entry.plate, p_vehicle_type)
  on conflict (plate) do update set vehicle_type = excluded.vehicle_type;

  insert into public.audit_log (user_id, action, entity_type, entity_id, details)
  values (
    auth.uid(), 'CORRECCION_TIPO_VEHICULO', 'vehicle_entries', p_entry_id::text,
    jsonb_build_object('placa', v_entry.plate, 'tipo_anterior', v_previous, 'tipo_nuevo', p_vehicle_type)
  );

  return v_entry;
end;
$$;

revoke execute on function public.update_active_entry_vehicle_type(uuid, public.vehicle_type) from public;
grant execute on function public.update_active_entry_vehicle_type(uuid, public.vehicle_type) to authenticated;

notify pgrst, 'reload schema';
