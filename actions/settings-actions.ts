"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/dal";
import { z } from "zod";
import type { ActionResult } from "@/actions/vehicle-actions";

const companySettingsSchema = z.object({
  companyName: z.string().trim().min(2, "El nombre de la empresa es obligatorio."),
  currencySymbol: z.string().trim().min(1).max(4),
});

export async function updateCompanySettings(input: unknown): Promise<ActionResult> {
  const profile = await requireRole("ADMIN");

  const parsed = companySettingsSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const supabase = await createClient();
  const [r1, r2] = await Promise.all([
    supabase
      .from("system_settings")
      .update({ value: parsed.data.companyName, updated_by: profile.id })
      .eq("key", "company_name"),
    supabase
      .from("system_settings")
      .update({ value: parsed.data.currencySymbol, updated_by: profile.id })
      .eq("key", "currency_symbol"),
  ]);

  if (r1.error) return { error: r1.error.message };
  if (r2.error) return { error: r2.error.message };

  revalidatePath("/configuracion");
  return {};
}
