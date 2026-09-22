import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { PaymentMethod } from "@/types/database";

export interface RestroomUseRow {
  id: string;
  usedAt: string;
  amount: number;
  paymentMethod: PaymentMethod;
  observation: string | null;
  registeredByName: string;
}

interface RawRow {
  id: string;
  used_at: string;
  amount: number;
  payment_method: PaymentMethod;
  observation: string | null;
  registrar: { nombre: string; apellido: string } | null;
}

export async function getRestroomUsesInRange(dateFrom: string, dateTo: string): Promise<RestroomUseRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("restroom_uses")
    .select(
      "id, used_at, amount, payment_method, observation, registrar:profiles!restroom_uses_registered_by_fkey ( nombre, apellido )"
    )
    .gte("used_at", `${dateFrom}T00:00:00-05:00`)
    .lte("used_at", `${dateTo}T23:59:59-05:00`)
    .order("used_at", { ascending: false })
    .returns<RawRow[]>();

  if (error) throw new Error(error.message);

  return (data ?? []).map((r) => ({
    id: r.id,
    usedAt: r.used_at,
    amount: Number(r.amount),
    paymentMethod: r.payment_method,
    observation: r.observation,
    registeredByName: `${r.registrar?.nombre ?? ""} ${r.registrar?.apellido ?? ""}`.trim(),
  }));
}

export async function getTodayRestroomUses(): Promise<RestroomUseRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("restroom_uses")
    .select(
      "id, used_at, amount, payment_method, observation, registrar:profiles!restroom_uses_registered_by_fkey ( nombre, apellido )"
    )
    .order("used_at", { ascending: false })
    .limit(50)
    .returns<RawRow[]>();

  if (error) throw new Error(error.message);

  return (data ?? []).map((r) => ({
    id: r.id,
    usedAt: r.used_at,
    amount: Number(r.amount),
    paymentMethod: r.payment_method,
    observation: r.observation,
    registeredByName: `${r.registrar?.nombre ?? ""} ${r.registrar?.apellido ?? ""}`.trim(),
  }));
}
