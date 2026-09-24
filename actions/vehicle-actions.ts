"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth/dal";
import { vehicleEntrySchema, vehicleExitSchema, updateEntryVehicleTypeSchema } from "@/lib/validation";
import type { VehicleExitDetail } from "@/types/domain";
import type { PaymentMethod, TariffType, VehicleType } from "@/types/database";

interface VehicleExitRpcResult {
  id: string;
  entry_id: string;
  exit_at: string;
  amount: number;
  tariff_applied: number;
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
): Promise<ActionResult<{ entryId: string; spotCode: string }>> {
  await requireAuth();

  const parsed = vehicleEntrySchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("register_vehicle_entry", {
      p_plate: parsed.data.plate,
      p_vehicle_type: parsed.data.vehicleType,
      p_spot_id: parsed.data.spotId,
      p_use_flat_rate: parsed.data.useFlatRate,
      p_flat_rate_period: parsed.data.useFlatRate ? (parsed.data.flatRatePeriod ?? null) : null,
    })
    .single()
    .returns<{ id: string; parking_spot_id: string }>();

  if (error || !data) {
    return { error: error?.message ?? "No se pudo registrar el ingreso." };
  }

  // El espacio realmente ocupado puede no ser el que se tocó en la grilla:
  // si la placa es de un abonado con espacio fijo, register_vehicle_entry()
  // lo redirige automáticamente a su espacio asignado (ver 0017).
  const { data: spotRow } = await supabase
    .from("parking_spots")
    .select("code")
    .eq("id", data.parking_spot_id)
    .single();

  revalidatePath("/dashboard");
  revalidatePath("/estacionamientos");
  revalidatePath("/ingreso");
  revalidatePath("/salida");
  return { data: { entryId: data.id, spotCode: spotRow?.code ?? "" } };
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
      p_ticket_code: parsed.data.ticketCode ?? null,
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
      id: data.id,
      entryId: data.entry_id,
      exitAt: data.exit_at,
      amount: Number(data.amount),
      tariffApplied: Number(data.tariff_applied),
      durationMinutes: data.duration_minutes,
      paymentMethod: data.payment_method,
      tariffType: data.tariff_type,
      toleranceMinutesApplied: data.tolerance_minutes_applied,
    },
  };
}

/** Disponible para COLABORADOR y ADMIN — corrige únicamente el tipo de
 * vehículo de un ingreso que TODAVÍA está activo (vehículo adentro). No
 * acepta placa, espacio ni fechas: solo existe para arreglar una mala
 * clasificación al momento del ingreso. */
export async function updateEntryVehicleType(
  input: unknown
): Promise<ActionResult<{ vehicleType: VehicleType }>> {
  await requireAuth();

  const parsed = updateEntryVehicleTypeSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("update_active_entry_vehicle_type", {
      p_entry_id: parsed.data.entryId,
      p_vehicle_type: parsed.data.vehicleType,
    })
    .single()
    .returns<{ vehicle_type: VehicleType }>();

  if (error || !data) {
    return { error: error?.message ?? "No se pudo actualizar el tipo de vehículo." };
  }

  revalidatePath("/dashboard");
  revalidatePath("/estacionamientos");
  revalidatePath("/ingreso");
  revalidatePath("/salida");

  return { data: { vehicleType: data.vehicle_type } };
}
