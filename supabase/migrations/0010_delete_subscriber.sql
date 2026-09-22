-- =============================================================================
-- PARKING ADMIN - Migración 0010
-- "Eliminar" abonado (solo ADMIN) — eliminación LÓGICA, nunca DELETE físico.
--
-- Por qué no puede ser DELETE físico: vehicle_entries.subscriber_id y
-- subscriber_payments.subscriber_id referencian subscribers(id) sin
-- ON DELETE CASCADE (el default de Postgres es NO ACTION/RESTRICT). Un
-- DELETE físico simplemente fallaría con foreign key violation en cuanto
-- el abonado tenga algún ingreso o pago histórico — que es el caso normal.
-- Y aunque no fallara, borraría la referencia que sostiene los reportes,
-- la caja y la auditoría.
--
-- Fix: "Eliminar" = estado = 'CANCELADO' (ya es un valor válido del enum
-- subscriber_status desde 0003, no hace falta columna nueva). Con esto:
--   - find_active_subscriber() ya lo ignora (solo mira estado = 'ACTIVO').
--   - lookup_plate_status() ahora también lo ignora en la rama ABONADO
--     (antes de esta migración, un CANCELADO todavía se mostraba como
--     "🔴 ABONADO CANCELADO" al trabajador; ahora cae directo a CLIENTE
--     NORMAL, tal como se pide).
--   - Pagos, caja, historial y auditoría no se tocan: son otras tablas.
--
-- Seguridad: RLS de subscribers YA exige is_admin() para UPDATE desde 0003
-- (el trabajador ya no puede ni debería poder hacer UPDATE directo). Estas
-- RPC son SECURITY DEFINER (bypasean RLS) pero repiten el chequeo de
-- is_admin() internamente — el mismo patrón que toda otra operación
-- administrativa en este proyecto.
-- =============================================================================

-- =============================================================================
-- lookup_plate_status(): un abonado CANCELADO (= eliminado) deja de
-- mostrarse como abonado de cualquier tipo — se comporta como si la placa
-- nunca hubiera tenido abono. SUSPENDIDO sigue mostrándose (es temporal,
-- no una eliminación).
-- =============================================================================

create or replace function public.lookup_plate_status(p_plate text)
returns table (
  kind text,
  id uuid,
  nombre text,
  fecha_vencimiento date,
  display_status text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_plate text := upper(trim(p_plate));
begin
  if not public.is_active_staff() then
    raise exception 'No tienes permisos para realizar esta acción.';
  end if;

  return query
  select 'AUTORIZADO'::text, av.id, av.propietario, null::date, av.estado
  from public.authorized_vehicles av
  where upper(av.plate) = v_plate and av.estado = 'ACTIVO'
  limit 1;

  if found then
    return;
  end if;

  return query
  select
    'ABONADO'::text,
    s.id,
    s.nombre_completo,
    s.fecha_vencimiento,
    case
      when s.estado = 'SUSPENDIDO' then 'SUSPENDIDO'
      when s.fecha_vencimiento < public.today_lima() then 'VENCIDO'
      else 'ACTIVO'
    end
  from public.subscribers s
  where upper(s.plate) = v_plate
    and s.estado <> 'CANCELADO'
  order by s.fecha_vencimiento desc
  limit 1;
end;
$$;

revoke execute on function public.lookup_plate_status(text) from public;
grant execute on function public.lookup_plate_status(text) to authenticated;

-- =============================================================================
-- RPC: ELIMINAR (desactivar) ABONADO
-- =============================================================================

create or replace function public.admin_delete_subscriber(p_subscriber_id uuid)
returns public.subscribers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subscriber public.subscribers;
  v_previous_estado public.subscriber_status;
  v_has_active_vehicle boolean;
begin
  if not public.is_admin() then
    raise exception 'No tienes permisos para realizar esta acción.';
  end if;

  select * into v_subscriber from public.subscribers where id = p_subscriber_id for update;
  if not found then
    raise exception 'El abonado indicado no existe.';
  end if;

  -- No eliminar silenciosamente si el abonado tiene un vehículo activo
  -- dentro de la cochera en este momento: rompería el registro de esa
  -- visita (que sigue dependiendo de subscriber_id / covered_by_subscription).
  select exists(
    select 1 from public.vehicle_entries
    where subscriber_id = p_subscriber_id and status = 'ACTIVO'
  ) into v_has_active_vehicle;

  if v_has_active_vehicle then
    raise exception 'Este abonado tiene un vehículo actualmente dentro de la cochera. Registra su salida antes de eliminarlo.';
  end if;

  v_previous_estado := v_subscriber.estado;

  update public.subscribers set estado = 'CANCELADO' where id = p_subscriber_id
  returning * into v_subscriber;

  insert into public.audit_log (user_id, action, entity_type, entity_id, details)
  values (
    auth.uid(), 'ELIMINAR_ABONADO', 'subscribers', p_subscriber_id::text,
    jsonb_build_object(
      'placa', v_subscriber.plate, 'cliente', v_subscriber.nombre_completo,
      'estado_anterior', v_previous_estado, 'estado_nuevo', 'CANCELADO'
    )
  );

  return v_subscriber;
end;
$$;

revoke execute on function public.admin_delete_subscriber(uuid) from public;
grant execute on function public.admin_delete_subscriber(uuid) to authenticated;

-- =============================================================================
-- RPC: REACTIVAR ABONADO (recuperar uno eliminado/desactivado por error)
-- =============================================================================

create or replace function public.admin_reactivate_subscriber(p_subscriber_id uuid)
returns public.subscribers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subscriber public.subscribers;
  v_previous_estado public.subscriber_status;
begin
  if not public.is_admin() then
    raise exception 'No tienes permisos para realizar esta acción.';
  end if;

  select * into v_subscriber from public.subscribers where id = p_subscriber_id for update;
  if not found then
    raise exception 'El abonado indicado no existe.';
  end if;

  v_previous_estado := v_subscriber.estado;

  update public.subscribers set estado = 'ACTIVO' where id = p_subscriber_id
  returning * into v_subscriber;

  insert into public.audit_log (user_id, action, entity_type, entity_id, details)
  values (
    auth.uid(), 'REACTIVAR_ABONADO', 'subscribers', p_subscriber_id::text,
    jsonb_build_object(
      'placa', v_subscriber.plate, 'cliente', v_subscriber.nombre_completo,
      'estado_anterior', v_previous_estado, 'estado_nuevo', 'ACTIVO'
    )
  );

  return v_subscriber;
end;
$$;

revoke execute on function public.admin_reactivate_subscriber(uuid) from public;
grant execute on function public.admin_reactivate_subscriber(uuid) to authenticated;

notify pgrst, 'reload schema';
