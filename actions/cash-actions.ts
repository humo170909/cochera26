"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAuth, requireRole } from "@/lib/auth/dal";
import {
  cashMovementSchema,
  closeCashRegisterSchema,
  openCashRegisterSchema,
} from "@/lib/validation";
import type { ActionResult } from "@/actions/vehicle-actions";
import { z } from "zod";

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

const reopenCashRegisterSchema = z.object({ cashRegisterId: z.uuid() });

/** Exclusivo ADMIN — reabre la caja del día actual ya cerrada, para poder
 * seguir registrando ingresos/cobros/movimientos sin crear una segunda
 * caja (business_date es UNIQUE) ni perder el cierre anterior en la
 * auditoría (queda registrado como REAPERTURA_DE_CAJA). */
export async function reopenCashRegister(input: unknown): Promise<ActionResult> {
  await requireRole("ADMIN");

  const parsed = reopenCashRegisterSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Datos inválidos." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_reopen_cash_register", {
    p_cash_register_id: parsed.data.cashRegisterId,
  });
  if (error) return { error: error.message };

  revalidateCash();
  return {};
}

export type ResetDailyOperationsSummary = {
  businessDate: string;
  ingresosEliminados: number;
  salidasEliminadas: number;
  ticketsEliminados: number;
  banosEliminados: number;
  movimientosEliminados: number;
  cajaReiniciada: boolean;
};

/** Exclusivo ADMIN — borra ÚNICAMENTE los datos operativos (ingresos,
 * salidas, tickets, baños, movimientos de caja) del día actual y deja la
 * caja de hoy en S/ 0.00 y ABIERTA. No toca abonados, vehículos
 * autorizados, usuarios, tarifas ni datos de otros días. */
export async function resetDailyCashOperations(): Promise<
  ActionResult<ResetDailyOperationsSummary>
> {
  await requireRole("ADMIN");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_reset_daily_cash_operations");
  if (error) return { error: error.message };

  revalidateCash();
  revalidatePath("/ingresos");
  revalidatePath("/estacionamientos");

  const summary = data as {
    business_date: string;
    ingresos_eliminados: number;
    salidas_eliminadas: number;
    tickets_eliminados: number;
    banos_eliminados: number;
    movimientos_eliminados: number;
    caja_reiniciada: boolean;
  };

  return {
    data: {
      businessDate: summary.business_date,
      ingresosEliminados: summary.ingresos_eliminados,
      salidasEliminadas: summary.salidas_eliminadas,
      ticketsEliminados: summary.tickets_eliminados,
      banosEliminados: summary.banos_eliminados,
      movimientosEliminados: summary.movimientos_eliminados,
      cajaReiniciada: summary.caja_reiniciada,
    },
  };
}
