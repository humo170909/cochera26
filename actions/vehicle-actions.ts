"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth/dal";
import { vehicleEntrySchema, vehicleExitSchema } from "@/lib/validation";
import type { VehicleExitDetail } from "@/types/domain";
import type { PaymentMethod, TariffType } from "@/types/database";

interface VehicleExitRpcResult {
  amount: number;
  duration_minutes: number;
  payment_method: PaymentMethod | null;
  tariff_type: TariffType;
  tolerance_minutes_applied: number | null;
}

export interface ActionResult<T = undefined> {
  error?: string;
  data?: T;
}

export async function registerVehicleEntry(
  input: unknown
): Promise<ActionResult> {
  await requireAuth();

  const parsed = vehicleEntrySchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("register_vehicle_entry", {
    p_plate: parsed.data.plate,
    p_vehicle_type: parsed.data.vehicleType,
    p_spot_id: parsed.data.spotId,
    p_use_flat_rate: parsed.data.useFlatRate,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/dashboard");
  revalidatePath("/estacionamientos");
  revalidatePath("/ingreso");
  revalidatePath("/salida");
  return {};
}

export async function registerVehicleExit(
  input: unknown
): Promise<ActionResult<VehicleExitDetail>> {
  await requireAuth();

  const parsed = vehicleExitSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("register_vehicle_exit", {
      p_entry_id: parsed.data.entryId,
      p_payment_method: parsed.data.paymentMethod,
      p_tariff_type: parsed.data.tariffType,
    })
    .single()
    .returns<VehicleExitRpcResult>();

  if (error || !data) {
    return { error: error?.message ?? "No se pudo procesar el pago." };
  }

  revalidatePath("/dashboard");
  revalidatePath("/estacionamientos");
  revalidatePath("/salida");
  revalidatePath("/caja");
  revalidatePath("/historial");

  return {
    data: {
      amount: Number(data.amount),
      durationMinutes: data.duration_minutes,
      paymentMethod: data.payment_method,
      tariffType: data.tariff_type,
      toleranceMinutesApplied: data.tolerance_minutes_applied,
    },
  };
}
