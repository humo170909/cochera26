"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/dal";
import {
  flatRateSettingsSchema,
  subscriberPlanSettingsSchema,
  tariffUpdateSchema,
  toleranceSettingsSchema,
} from "@/lib/validation";
import type { ActionResult } from "@/actions/vehicle-actions";
import { z } from "zod";

export async function updateTariff(input: unknown): Promise<ActionResult> {
  const profile = await requireRole("ADMIN");

  const parsed = tariffUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("tariffs")
    .update({ price_per_hour: parsed.data.pricePerHour, updated_by: profile.id })
    .eq("vehicle_type", parsed.data.vehicleType);

  if (error) return { error: error.message };

  revalidatePath("/tarifas");
  return {};
}

const restroomPriceSchema = z.object({
  price: z.coerce.number().positive("El precio debe ser mayor a cero."),
});

export async function updateRestroomPrice(input: unknown): Promise<ActionResult> {
  const profile = await requireRole("ADMIN");

  const parsed = restroomPriceSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("system_settings")
    .update({ value: { price: parsed.data.price }, updated_by: profile.id })
    .eq("key", "restroom_price");

  if (error) return { error: error.message };

  revalidatePath("/tarifas");
  revalidatePath("/bano");
  return {};
}

export async function updateToleranceSettings(input: unknown): Promise<ActionResult> {
  const profile = await requireRole("ADMIN");

  const parsed = toleranceSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("tariff_settings")
    .update({
      tolerancia_corta_minutos: parsed.data.tolerCortaMinutos,
      tolerancia_larga_minutos: parsed.data.tolerLargaMinutos,
      umbral_larga_horas: parsed.data.umbralLargaHoras,
      updated_by: profile.id,
    })
    .eq("id", true);

  if (error) return { error: error.message };

  revalidatePath("/tarifas");
  return {};
}

export async function updateFlatRateSettings(input: unknown): Promise<ActionResult> {
  const profile = await requireRole("ADMIN");

  const parsed = flatRateSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("flat_rate_settings")
    .update({
      precio: parsed.data.precio,
      precio_noche: parsed.data.precioNoche,
      hora_limite: parsed.data.horaLimite,
      dias_aplicacion: parsed.data.diasAplicacion,
      activo: parsed.data.activo,
      cupo_maximo: parsed.data.cupoMaximo,
      updated_by: profile.id,
    })
    .eq("id", true);

  if (error) return { error: error.message };

  revalidatePath("/tarifas");
  revalidatePath("/ingreso");
  revalidatePath("/estacionamientos");
  return {};
}

export async function updateSubscriberPlanSettings(input: unknown): Promise<ActionResult> {
  const profile = await requireRole("ADMIN");

  const parsed = subscriberPlanSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("subscriber_plan_settings")
    .update({
      precio_mensual: parsed.data.precioMensual,
      hora_limite: parsed.data.horaLimite,
      periodo_meses: parsed.data.periodoMeses,
      dias_alerta_vencimiento: parsed.data.diasAlertaVencimiento,
      updated_by: profile.id,
    })
    .eq("id", true);

  if (error) return { error: error.message };

  revalidatePath("/tarifas");
  revalidatePath("/abonados");
  return {};
}
