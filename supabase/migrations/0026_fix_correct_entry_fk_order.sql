-- =============================================================================
-- FIX: "insert or update on table vehicle_entries violates foreign key
-- constraint vehicle_entries_plate_fkey" al corregir la placa de un ingreso.
--
-- CAUSA RAÍZ (localizada, no parcheada a ciegas):
--
-- vehicle_entries.plate REFERENCIA vehicles(plate) (fk_vehicle_entries_plate,
-- desde 0001). Esa FK es arquitectura correcta y NO se toca: "vehicles" es
-- el catálogo de placas conocidas; toda fila de vehicle_entries.plate debe
-- existir primero ahí. register_vehicle_entry() ya respeta este orden
-- (siempre hace el upsert a "vehicles" ANTES del insert en
-- "vehicle_entries").
--
-- update_active_entry_details() (0025), en cambio, quedó con el orden
-- INVERTIDO por error de escritura:
--   1. UPDATE vehicle_entries SET plate = <placa nueva>   <- falla acá
--   2. INSERT INTO vehicles (plate, ...) ON CONFLICT ...  <- nunca se alcanza
-- Si la placa corregida es una que NUNCA existió antes en "vehicles" (caso
-- normal: se corrige un error de tipeo a una placa real que el sistema
-- jamás vio), el paso 1 intenta apuntar plate a un valor que todavía no
-- existe en la tabla referenciada -> viola la foreign key. Si la placa
-- corregida YA existía en "vehicles" (por cualquier otro ingreso previo),
-- el error no aparecía -- por eso el bug era intermitente y confuso.
--
-- SOLUCIÓN: invertir el orden (upsert primero, UPDATE después) — exactamente
-- el mismo orden que register_vehicle_entry() y admin_update_vehicle_visit()
-- ya usan correctamente. No se toca la FK, no se toca RLS, no se pierde
-- ningún dato: es un error de secuencia de dos sentencias dentro de la
-- misma función.
-- =============================================================================

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

  -- FIX: el upsert al catálogo va PRIMERO — vehicle_entries.plate exige
  -- que la placa ya exista en "vehicles" (fk_vehicle_entries_plate).
  insert into public.vehicles (plate, vehicle_type)
  values (v_plate, p_vehicle_type)
  on conflict (plate) do update set vehicle_type = excluded.vehicle_type;

  update public.vehicle_entries set
    plate = v_plate,
    vehicle_type = p_vehicle_type
  where id = p_entry_id
  returning * into v_entry;

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

-- Firma sin cambios respecto a 0025: no hace falta reemplazar grants.

notify pgrst, 'reload schema';
