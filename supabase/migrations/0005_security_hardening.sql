-- =============================================================================
-- PARKING ADMIN - Migración 0005
-- CORRECCIÓN DE SEGURIDAD: find_active_subscriber() no tenía el chequeo
-- interno is_active_staff() que sí tienen el resto de funciones RPC.
--
-- Postgres otorga EXECUTE a PUBLIC por defecto en funciones nuevas, salvo
-- que se revoque explícitamente. Nunca se revocó, así que el `grant execute
-- ... to authenticated` de 0003 no era una restricción real: cualquiera con
-- la anon key (sin sesión) podía llamar find_active_subscriber(placa) y
-- recibir nombre completo, teléfono y monto del abonado si existía uno
-- activo para esa placa — una fuga de datos personales/financieros.
--
-- Verificado en vivo contra el proyecto: la llamada anónima NO fallaba
-- (debía fallar con "No tienes permisos para realizar esta acción.").
--
-- Fix de dos capas (defensa en profundidad, igual que el resto del código):
--   1. Chequeo interno is_active_staff() en la función (la causa real).
--   2. REVOKE EXECUTE FROM PUBLIC en todas las funciones RPC de negocio,
--      para que un futuro descuido similar no vuelva a depender solo del
--      GRANT a `authenticated` (que Postgres nunca aplica automáticamente
--      como restricción — es aditivo sobre PUBLIC, no un reemplazo).
-- =============================================================================

create or replace function public.find_active_subscriber(p_plate text, p_at timestamptz)
returns public.subscribers
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result public.subscribers;
begin
  if not public.is_active_staff() then
    raise exception 'No tienes permisos para realizar esta acción.';
  end if;

  select *
    into v_result
  from public.subscribers
  where upper(plate) = upper(trim(p_plate))
    and estado = 'ACTIVO'
    and fecha_inicio <= (p_at at time zone 'America/Lima')::date
    and fecha_vencimiento >= (p_at at time zone 'America/Lima')::date
    and (p_at at time zone 'America/Lima')::time <= hora_limite
  order by fecha_vencimiento desc
  limit 1;

  return v_result;
end;
$$;

-- Defensa en profundidad: quita el EXECUTE que PUBLIC tenía por defecto en
-- todas las funciones RPC de negocio. A partir de ahora solo `authenticated`
-- puede invocarlas (y, dentro de cada una, solo si is_active_staff()/is_admin()
-- lo permite). is_admin()/is_active_staff()/today_lima()/lima_date() quedan
-- públicas a propósito: no exponen datos, solo evalúan la sesión actual.
revoke execute on function public.log_audit_event(text, text, text, jsonb) from public;
revoke execute on function public.register_vehicle_entry(text, public.vehicle_type, uuid) from public;
revoke execute on function public.register_vehicle_exit(uuid, public.payment_method, public.tariff_type) from public;
revoke execute on function public.register_restroom_use(public.payment_method, text) from public;
revoke execute on function public.open_cash_register(numeric) from public;
revoke execute on function public.register_cash_movement(uuid, public.movement_type, text, numeric, public.payment_method, text) from public;
revoke execute on function public.close_cash_register(uuid, numeric, text) from public;
revoke execute on function public.get_cash_register_summary(uuid) from public;
revoke execute on function public.get_dashboard_snapshot() from public;
revoke execute on function public.calculate_hourly_fee(numeric, timestamptz, timestamptz, integer, integer, integer) from public;
revoke execute on function public.find_active_subscriber(text, timestamptz) from public;
revoke execute on function public.register_subscriber_payment(uuid, public.payment_method, text) from public;

grant execute on function public.log_audit_event(text, text, text, jsonb) to authenticated;
grant execute on function public.register_vehicle_entry(text, public.vehicle_type, uuid) to authenticated;
grant execute on function public.register_vehicle_exit(uuid, public.payment_method, public.tariff_type) to authenticated;
grant execute on function public.register_restroom_use(public.payment_method, text) to authenticated;
grant execute on function public.open_cash_register(numeric) to authenticated;
grant execute on function public.register_cash_movement(uuid, public.movement_type, text, numeric, public.payment_method, text) to authenticated;
grant execute on function public.close_cash_register(uuid, numeric, text) to authenticated;
grant execute on function public.get_cash_register_summary(uuid) to authenticated;
grant execute on function public.get_dashboard_snapshot() to authenticated;
grant execute on function public.calculate_hourly_fee(numeric, timestamptz, timestamptz, integer, integer, integer) to authenticated;
grant execute on function public.find_active_subscriber(text, timestamptz) to authenticated;
grant execute on function public.register_subscriber_payment(uuid, public.payment_method, text) to authenticated;
