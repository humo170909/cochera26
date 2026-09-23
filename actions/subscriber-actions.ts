"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAuth, requireRole } from "@/lib/auth/dal";
import {
  createSubscriberSchema,
  registerSubscriberPaymentSchema,
  updateSubscriberSchema,
} from "@/lib/validation";
import type { ActionResult } from "@/actions/vehicle-actions";
import type { PaymentMethod } from "@/types/database";
import { z } from "zod";

interface SubscriberPaymentResult {
  amount: number;
  periodStart: string;
  periodEnd: string;
  paymentMethod: PaymentMethod;
}

export async function createSubscriber(input: unknown): Promise<ActionResult> {
  const profile = await requireRole("ADMIN");

  const parsed = createSubscriberSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  const d = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.from("subscribers").insert({
    nombre_completo: d.nombreCompleto,
    documento: d.documento || null,
    telefono: d.telefono || null,
    plate: d.plate,
    vehicle_type: d.vehicleType,
    fecha_inicio: d.fechaInicio,
    fecha_vencimiento: d.fechaVencimiento,
    hora_limite: d.horaLimite,
    monto: d.monto,
    estado: d.estado,
    observaciones: d.observaciones || null,
    assigned_spot_id: d.assignedSpotId || null,
    created_by: profile.id,
  });

  if (error) return { error: error.message };

  revalidatePath("/abonados");
  revalidatePath("/estacionamientos");
  revalidatePath("/ingreso");
  revalidatePath("/salida");
  return {};
}

export async function updateSubscriber(input: unknown): Promise<ActionResult> {
  await requireRole("ADMIN");

  const parsed = updateSubscriberSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  const d = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase
    .from("subscribers")
    .update({
      nombre_completo: d.nombreCompleto,
      documento: d.documento || null,
      telefono: d.telefono || null,
      plate: d.plate,
      vehicle_type: d.vehicleType,
      fecha_inicio: d.fechaInicio,
      fecha_vencimiento: d.fechaVencimiento,
      hora_limite: d.horaLimite,
      monto: d.monto,
      estado: d.estado,
      observaciones: d.observaciones || null,
      assigned_spot_id: d.assignedSpotId || null,
    })
    .eq("id", d.id);

  if (error) return { error: error.message };

  revalidatePath("/abonados");
  revalidatePath("/estacionamientos");
  revalidatePath("/ingreso");
  revalidatePath("/salida");
  return {};
}

export async function registerSubscriberPayment(
  input: unknown
): Promise<ActionResult<SubscriberPaymentResult>> {
  await requireAuth();

  const parsed = registerSubscriberPaymentSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("register_subscriber_payment", {
      p_subscriber_id: parsed.data.subscriberId,
      p_payment_method: parsed.data.paymentMethod,
      p_observation: parsed.data.observation ?? null,
    })
    .single()
    .returns<{ amount: number; period_start: string; period_end: string; payment_method: PaymentMethod }>();

  if (error || !data) {
    return { error: error?.message ?? "No se pudo registrar el pago." };
  }

  revalidatePath("/abonados");
  revalidatePath("/abonados/pagos");
  revalidatePath("/caja");
  revalidatePath("/dashboard");

  return {
    data: {
      amount: Number(data.amount),
      periodStart: data.period_start,
      periodEnd: data.period_end,
      paymentMethod: data.payment_method,
    },
  };
}

const uuidSchema = z.object({ subscriberId: z.uuid() });

export async function deleteSubscriber(input: unknown): Promise<ActionResult> {
  await requireRole("ADMIN");

  const parsed = uuidSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Datos inválidos." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_delete_subscriber", {
    p_subscriber_id: parsed.data.subscriberId,
  });

  if (error) return { error: error.message };

  revalidatePath("/abonados");
  return {};
}

export async function reactivateSubscriber(input: unknown): Promise<ActionResult> {
  await requireRole("ADMIN");

  const parsed = uuidSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Datos inválidos." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_reactivate_subscriber", {
    p_subscriber_id: parsed.data.subscriberId,
  });

  if (error) return { error: error.message };

  revalidatePath("/abonados");
  return {};
}
