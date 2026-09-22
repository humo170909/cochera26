import "server-only";
import { createClient } from "@/lib/supabase/server";
import { businessDateLima } from "@/lib/datetime";
import type { CashRegisterSummary } from "@/types/database";
import type { PaymentMethod, RegisterStatus, MovementType } from "@/types/database";

export interface CashRegisterRow {
  id: string;
  businessDate: string;
  openedAt: string;
  openedByName: string;
  openingAmount: number;
  status: RegisterStatus;
  closedAt: string | null;
  closedByName: string | null;
  expectedAmount: number | null;
  declaredAmount: number | null;
  difference: number | null;
  notes: string | null;
}

interface RawRegisterRow {
  id: string;
  business_date: string;
  opened_at: string;
  opened_by_profile: { nombre: string; apellido: string } | null;
  opening_amount: number;
  status: RegisterStatus;
  closed_at: string | null;
  closed_by_profile: { nombre: string; apellido: string } | null;
  expected_amount: number | null;
  declared_amount: number | null;
  difference: number | null;
  notes: string | null;
}

const REGISTER_SELECT = `id, business_date, opened_at, opening_amount, status, closed_at,
  expected_amount, declared_amount, difference, notes,
  opened_by_profile:profiles!cash_registers_opened_by_fkey ( nombre, apellido ),
  closed_by_profile:profiles!cash_registers_closed_by_fkey ( nombre, apellido )`;

function mapRegister(r: RawRegisterRow): CashRegisterRow {
  return {
    id: r.id,
    businessDate: r.business_date,
    openedAt: r.opened_at,
    openedByName: `${r.opened_by_profile?.nombre ?? ""} ${r.opened_by_profile?.apellido ?? ""}`.trim(),
    openingAmount: Number(r.opening_amount),
    status: r.status,
    closedAt: r.closed_at,
    closedByName: r.closed_by_profile
      ? `${r.closed_by_profile.nombre} ${r.closed_by_profile.apellido}`.trim()
      : null,
    expectedAmount: r.expected_amount !== null ? Number(r.expected_amount) : null,
    declaredAmount: r.declared_amount !== null ? Number(r.declared_amount) : null,
    difference: r.difference !== null ? Number(r.difference) : null,
    notes: r.notes,
  };
}

export async function getTodayCashRegister(): Promise<CashRegisterRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cash_registers")
    .select(REGISTER_SELECT)
    .eq("business_date", businessDateLima())
    .maybeSingle()
    .returns<RawRegisterRow>();

  if (error) throw new Error(error.message);
  return data ? mapRegister(data) : null;
}

export async function getRecentCashRegisters(limit = 15): Promise<CashRegisterRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cash_registers")
    .select(REGISTER_SELECT)
    .order("business_date", { ascending: false })
    .limit(limit)
    .returns<RawRegisterRow[]>();

  if (error) throw new Error(error.message);
  return (data ?? []).map(mapRegister);
}

export async function getCashRegisterSummary(cashRegisterId: string): Promise<CashRegisterSummary> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_cash_register_summary", {
    p_cash_register_id: cashRegisterId,
  });
  if (error || !data) throw new Error(error?.message ?? "No se pudo calcular el resumen de caja.");
  return data as CashRegisterSummary;
}

export interface CashMovementRow {
  id: string;
  type: MovementType;
  source: string;
  concept: string;
  amount: number;
  paymentMethod: PaymentMethod;
  observation: string | null;
  registeredByName: string;
  occurredAt: string;
}

interface RawMovementRow {
  id: string;
  type: MovementType;
  source: string;
  concept: string;
  amount: number;
  payment_method: PaymentMethod;
  observation: string | null;
  occurred_at: string;
  registrar: { nombre: string; apellido: string } | null;
}

export async function getCashMovements(cashRegisterId: string): Promise<CashMovementRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cash_movements")
    .select(
      "id, type, source, concept, amount, payment_method, observation, occurred_at, registrar:profiles!cash_movements_registered_by_fkey ( nombre, apellido )"
    )
    .eq("cash_register_id", cashRegisterId)
    .order("occurred_at", { ascending: false })
    .returns<RawMovementRow[]>();

  if (error) throw new Error(error.message);

  return (data ?? []).map((m) => ({
    id: m.id,
    type: m.type,
    source: m.source,
    concept: m.concept,
    amount: Number(m.amount),
    paymentMethod: m.payment_method,
    observation: m.observation,
    registeredByName: `${m.registrar?.nombre ?? ""} ${m.registrar?.apellido ?? ""}`.trim(),
    occurredAt: m.occurred_at,
  }));
}
