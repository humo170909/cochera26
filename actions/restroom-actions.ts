"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth/dal";
import { restroomUseSchema } from "@/lib/validation";
import type { ActionResult } from "@/actions/vehicle-actions";

export async function registerRestroomUse(input: unknown): Promise<ActionResult> {
  await requireAuth();

  const parsed = restroomUseSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("register_restroom_use", {
    p_payment_method: parsed.data.paymentMethod,
    p_observation: parsed.data.observation ?? null,
  });

  if (error) return { error: error.message };

  revalidatePath("/bano");
  revalidatePath("/caja");
  revalidatePath("/dashboard");
  revalidatePath("/historial");
  return {};
}
