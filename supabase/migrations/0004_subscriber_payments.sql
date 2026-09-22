-- =============================================================================
-- PARKING ADMIN - Migración 0004
-- Historial de pagos de abonados + renovación automática, y soporte para
-- que el TRABAJADOR consulte/pague abonados (no solo el ADMIN).
--
-- NO destructivo: solo ALTER TABLE ADD COLUMN / CREATE TABLE / CREATE OR
-- REPLACE FUNCTION. Ejecutar sobre un proyecto que ya corrió 0001-0003.
--
-- Decisiones de diseño explícitas (confirmadas en la charla):
--   1. Renovación anticipada (el abonado paga antes de vencer) EXTIENDE
--      desde la fecha de vencimiento anterior, no desde hoy — no se pierden
--      días ya pagados. Si ya venció, el nuevo período arranca hoy.
--   2. Duración del período: fija, configurable por ADMIN en meses
--      (subscriber_plan_settings.periodo_meses, default 1). El trabajador
--      nunca elige la fecha de fin al registrar un pago.
--   3. El monto del pago SIEMPRE es subscribers.monto (la fotografía del
--      abonado, no un valor editable en el momento del pago) — ni el
--      trabajador ni el admin lo escriben a mano en la pantalla de pago.
--   4. "POR VENCER" es un estado CALCULADO (no se guarda en la tabla):
--      fecha_vencimiento - hoy <= dias_alerta_vencimiento configurado.
-- =============================================================================

alter table public.subscriber_plan_settings
  add column periodo_meses integer not null default 1 check (periodo_meses >= 1),
  add column dias_alerta_vencimiento integer not null default 5 check (dias_alerta_vencimiento >= 0);

-- =============================================================================
-- HISTORIAL DE PAGOS DE ABONADOS
-- =============================================================================

create table public.subscriber_payments (
  id uuid primary key default gen_random_uuid(),
  subscriber_id uuid not null references public.subscribers(id),
  paid_at timestamptz not null default now(),
  amount numeric(10,2) not null check (amount > 0),
  payment_method public.payment_method not null,
  period_start date not null,
  period_end date not null,
  registered_by uuid not null references public.profiles(id),
  observation text,
  estado text not null default 'REGISTRADO',
  created_at timestamptz not null default now(),
  constraint chk_subscriber_payments_period check (period_end >= period_start)
);
comment on table public.subscriber_payments is 'Cada fila es un pago real ya cobrado. amount/period_* son fotografía, no se recalculan.';
create index ix_subscriber_payments_subscriber on public.subscriber_payments(subscriber_id);
create index ix_subscriber_payments_paid_at on public.subscriber_payments(paid_at);

-- =============================================================================
-- RPC: REGISTRAR PAGO DE ABONADO (renueva y cobra, atómico)
-- =============================================================================

create or replace function public.register_subscriber_payment(
  p_subscriber_id uuid,
  p_payment_method public.payment_method,
  p_observation text default null
)
returns public.subscriber_payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subscriber public.subscribers;
  v_settings public.subscriber_plan_settings;
  v_period_start date;
  v_period_end date;
  v_payment public.subscriber_payments;
  v_register public.cash_registers;
begin
  if not public.is_active_staff() then
    raise exception 'No tienes permisos para realizar esta acción.';
  end if;

  select * into v_subscriber from public.subscribers where id = p_subscriber_id for update;
  if not found then
    raise exception 'El abonado indicado no existe.';
  end if;
  if v_subscriber.estado in ('SUSPENDIDO', 'CANCELADO') then
    raise exception 'Este abonado está % y no puede registrar pagos.', v_subscriber.estado;
  end if;

  select * into v_settings from public.subscriber_plan_settings where id = true;

  -- Renovación anticipada: extiende desde el vencimiento anterior (no se
  -- pierden días ya pagados). Si ya venció, el nuevo período arranca hoy.
  if v_subscriber.fecha_vencimiento >= public.today_lima() then
    v_period_start := v_subscriber.fecha_vencimiento + 1;
    v_period_end := (v_subscriber.fecha_vencimiento + (v_settings.periodo_meses || ' months')::interval)::date;
  else
    v_period_start := public.today_lima();
    v_period_end := (public.today_lima() + (v_settings.periodo_meses || ' months')::interval)::date;
  end if;

  select * into v_register from public.cash_registers
    where business_date = public.today_lima() and status = 'ABIERTA';
  if not found then
    raise exception 'No hay una caja abierta. Debe aperturar caja antes de registrar el pago.';
  end if;

  insert into public.subscriber_payments (
    subscriber_id, amount, payment_method, period_start, period_end, registered_by, observation
  ) values (
    p_subscriber_id, v_subscriber.monto, p_payment_method, v_period_start, v_period_end, auth.uid(), p_observation
  ) returning * into v_payment;

  update public.subscribers
    set fecha_vencimiento = v_period_end, estado = 'ACTIVO'
    where id = p_subscriber_id;

  insert into public.cash_movements (
    cash_register_id, type, source, concept, amount, payment_method, reference_id, registered_by
  ) values (
    v_register.id, 'INGRESO', 'OTRO',
    'Pago abonado ' || v_subscriber.nombre_completo || ' - placa ' || v_subscriber.plate,
    v_subscriber.monto, p_payment_method, v_payment.id, auth.uid()
  );

  insert into public.audit_log (user_id, action, entity_type, entity_id, details)
  values (
    auth.uid(), 'PAGO_ABONADO', 'subscriber_payments', v_payment.id::text,
    jsonb_build_object(
      'abonado', v_subscriber.nombre_completo, 'placa', v_subscriber.plate,
      'monto', v_subscriber.monto, 'periodo_inicio', v_period_start, 'periodo_fin', v_period_end
    )
  );

  return v_payment;
end;
$$;

-- =============================================================================
-- RLS
-- =============================================================================

alter table public.subscriber_payments enable row level security;

-- Todo el staff activo puede consultar el historial de pagos (lo necesita
-- el trabajador para saber "¿cuándo pagó / hasta cuándo está pagado?").
-- La escritura ocurre EXCLUSIVAMENTE vía register_subscriber_payment().
create policy p_subscriber_payments_select on public.subscriber_payments
  for select using (public.is_active_staff());

-- =============================================================================
-- GRANTS
-- =============================================================================

grant select on public.subscriber_payments to authenticated;
grant execute on function public.register_subscriber_payment(uuid, public.payment_method, text) to authenticated;

-- =============================================================================
-- REALTIME
-- =============================================================================

do $$
begin
  alter publication supabase_realtime add table public.subscriber_payments;
exception when duplicate_object then
  null;
end $$;
