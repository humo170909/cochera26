-- =============================================================================
-- REAPERTURA DE CAJA (solo ADMIN)
--
-- Auditoría de lo existente antes de tocar nada:
--   - public.cash_registers.business_date es `date not null UNIQUE` — solo
--     puede existir UNA fila por día calendario, para siempre. Esto ya
--     garantiza, a nivel de esquema, que reabrir jamás pueda crear una
--     segunda caja para el mismo día: la única operación posible es
--     actualizar la fila existente, nunca insertar otra (violaría la
--     restricción UNIQUE).
--   - open_cash_register() ya contempla este escenario y lo rechaza a
--     propósito: `raise exception 'La caja del día ya fue cerrada. No
--     puede reabrirse.'` — es el mensaje que el usuario está viendo ahora
--     mismo. No se toca esa función: sigue siendo correcto que "abrir" no
--     sirva para reabrir una caja cerrada. Hace falta una operación
--     administrativa DISTINTA y explícita, que es esta.
--   - close_cash_register() ya usa `for update` + `is_active_staff()`; se
--     replica el mismo patrón de bloqueo de fila, pero exigiendo
--     is_admin() (más estricto, exclusivo para administrador).
--
-- Reabrir = revertir exactamente lo que dejó el cierre (status, closed_at,
-- closed_by, expected/declared/difference, notes) sobre la MISMA fila.
-- Los movimientos de caja (cash_movements), vehículos, salidas y abonados
-- nunca se tocan — no hay nada que borrar ni recrear.
-- =============================================================================

create or replace function public.admin_reopen_cash_register(p_cash_register_id uuid)
returns public.cash_registers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before public.cash_registers;
  v_register public.cash_registers;
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede reabrir la caja.';
  end if;

  select * into v_before from public.cash_registers where id = p_cash_register_id for update;
  if not found then
    raise exception 'La caja indicada no existe.';
  end if;

  -- Exclusivo para la caja del día actual (hora de Perú) — nunca la de
  -- otro día, aunque alguien intente pasar su id manualmente.
  if v_before.business_date <> public.today_lima() then
    raise exception 'Solo se puede reabrir la caja del día actual.';
  end if;

  if v_before.status <> 'CERRADA' then
    raise exception 'La caja ya se encuentra abierta.';
  end if;

  update public.cash_registers set
    status = 'ABIERTA',
    closed_at = null,
    closed_by = null,
    expected_amount = null,
    declared_amount = null,
    difference = null,
    notes = null
  where id = p_cash_register_id
  returning * into v_register;

  insert into public.audit_log (user_id, action, entity_type, entity_id, details)
  values (
    auth.uid(), 'REAPERTURA_DE_CAJA', 'cash_registers', v_register.id::text,
    jsonb_build_object(
      'business_date', v_register.business_date,
      'cerrada_previamente_en', v_before.closed_at,
      'declarado_previo', v_before.declared_amount,
      'diferencia_previa', v_before.difference
    )
  );

  return v_register;
end;
$$;

revoke execute on function public.admin_reopen_cash_register(uuid) from public;
grant execute on function public.admin_reopen_cash_register(uuid) to authenticated;

-- Fuerza a PostgREST a refrescar su caché de esquema inmediatamente.
notify pgrst, 'reload schema';
