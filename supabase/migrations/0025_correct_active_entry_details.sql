-- =============================================================================
-- CORREGIR PLACA Y TIPO DE UN INGRESO ACTIVO (COLABORADOR y ADMIN)
--
-- Auditoría previa (antes de escribir nada):
--   - update_active_entry_vehicle_type() (0021) ya cubría "solo tipo, solo
--     mientras status='ACTIVO'". Ahora el pedido crece a "placa Y tipo,
--     una sola confirmación, una sola fila de auditoría" — en vez de
--     mantener dos funciones que hacen casi lo mismo (duplicación), esta
--     migración DROPEA la de 0021 y la reemplaza por una versión que
--     cubre ambos campos. No es un sistema paralelo: es la evolución de
--     la misma función, con el mismo alcance de permisos (is_active_staff,
--     ambos roles) y la misma restricción (status='ACTIVO' únicamente).
--   - normalize_plate()/plate_normalizada ya existen (0011) y son la única
--     fuente de verdad para comparar placas — se reutilizan tal cual, sin
--     ninguna comparación ad-hoc nueva.
--   - admin_update_vehicle_visit() (0020) es la función hermana para
--     visitas YA FINALIZADAS (con salida) — esta nueva función es su
--     equivalente para ingresos TODAVÍA ACTIVOS (vehículo adentro). No se
--     tocan entre sí ni se duplican: cada una cubre un estado distinto.
--   - Ni flat_rate_reserved/flat_rate_period/flat_rate_price_snapshot ni
--     subscriber_id/covered_by_subscription/authorized_vehicle_id/
--     is_authorized se tocan: la tarifa y el estado de abonado/autorizado
--     quedan exactamente como se determinaron en el ingreso original,
--     nunca se recalculan por corregir placa/tipo (así se pidió
--     explícitamente).
--   - entry_tickets: si el ingreso tiene un ticket todavía ACTIVE (no usado
--     en la salida), se le actualiza plate/vehicle_type para que un
--     "Reimprimir ticket" posterior muestre los datos corregidos — nunca
--     se crea un ticket nuevo ni se toca su validation_code/token/estado.
-- =============================================================================

drop function if exists public.update_active_entry_vehicle_type(uuid, public.vehicle_type);

create or replace function public.update_active_entry_details(
  p_entry_id uuid,
  p_plate text,
  p_vehicle_type public.vehicle_type
)
returns public.vehicle_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry public.vehicle_entries;
  v_plate text := upper(trim(p_plate));
  v_plate_norm text := public.normalize_plate(p_plate);
  v_previous_plate text;
  v_previous_type public.vehicle_type;
begin
  if not public.is_active_staff() then
    raise exception 'No tienes permisos para realizar esta acción.';
  end if;

  select * into v_entry from public.vehicle_entries
    where id = p_entry_id and status = 'ACTIVO' for update;
  if not found then
    raise exception 'El registro ya no está disponible.';
  end if;

  if v_plate is null or length(v_plate) < 5 then
    raise exception 'Debes ingresar una placa válida.';
  end if;

  if exists (
    select 1 from public.vehicle_entries
    where plate_normalizada = v_plate_norm and status = 'ACTIVO' and id <> p_entry_id
  ) then
    raise exception 'Esta placa ya tiene un ingreso activo.';
  end if;

  v_previous_plate := v_entry.plate;
  v_previous_type := v_entry.vehicle_type;

  update public.vehicle_entries set
    plate = v_plate,
    vehicle_type = p_vehicle_type
  where id = p_entry_id
  returning * into v_entry;

  -- Mismo upsert que register_vehicle_entry(): mantiene el catálogo de
  -- vehículos (por placa) consistente con el último dato conocido.
  insert into public.vehicles (plate, vehicle_type)
  values (v_plate, p_vehicle_type)
  on conflict (plate) do update set vehicle_type = excluded.vehicle_type;

  -- Ticket todavía no usado: se corrige para que un reimpreso futuro
  -- muestre la placa/tipo correctos. Nunca se crea uno nuevo ni se toca
  -- su código/token/estado.
  update public.entry_tickets
  set plate = v_plate, vehicle_type = p_vehicle_type
  where entry_id = p_entry_id and status = 'ACTIVE';

  insert into public.audit_log (user_id, action, entity_type, entity_id, details)
  values (
    auth.uid(), 'MODIFICACION_DATOS_INGRESO', 'vehicle_entries', p_entry_id::text,
    jsonb_build_object(
      'placa_anterior', v_previous_plate, 'placa_nueva', v_plate,
      'tipo_anterior', v_previous_type, 'tipo_nuevo', p_vehicle_type
    )
  );

  return v_entry;
end;
$$;

revoke execute on function public.update_active_entry_details(uuid, text, public.vehicle_type) from public;
grant execute on function public.update_active_entry_details(uuid, text, public.vehicle_type) to authenticated;

notify pgrst, 'reload schema';
