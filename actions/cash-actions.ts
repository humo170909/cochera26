"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth/dal";
import {
  cashMovementSchema,
  closeCashRegisterSchema,
  openCashRegisterSchema,
} from "@/lib/validation";
import type { ActionResult } from "@/actions/vehicle-actions";

function revalidateCash() {
  revalidatePath("/caja");
  revalidatePath("/dashboard");
  revalidatePath("/salida");
  revalidatePath("/bano");
}

export async function openCashRegister(input: unknown): Promise<ActionResult> {
  await requireAuth();
  const parsed = openCashRegisterSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("open_cash_register", {
    p_opening_amount: parsed.data.openingAmount,
  });
  if (error) return { error: error.message };

  revalidateCash();
  return {};
}

export async function registerCashMovement(input: unknown): Promise<ActionResult> {
  await requireAuth();
  const parsed = cashMovementSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("register_cash_movement", {
    p_cash_register_id: parsed.data.cashRegisterId,
    p_type: parsed.data.type,
    p_concept: parsed.data.concept,
    p_amount: parsed.data.amount,
    p_payment_method: parsed.data.paymentMethod,
    p_observation: parsed.data.observation ?? null,
  });
  if (error) return { error: error.message };

  revalidateCash();
  return {};
}

export async function closeCashRegister(input: unknown): Promise<ActionResult> {
  await requireAuth();
  const parsed = closeCashRegisterSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("close_cash_register", {
    p_cash_register_id: parsed.data.cashRegisterId,
    p_declared_amount: parsed.data.declaredAmount,
    p_notes: parsed.data.notes ?? null,
  });
  if (error) return { error: error.message };

  revalidateCash();
  return {};
}
