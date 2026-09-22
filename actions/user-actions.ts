"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/dal";
import { createUserSchema, updateUserSchema } from "@/lib/validation";
import type { ActionResult } from "@/actions/vehicle-actions";

export async function createUser(input: unknown): Promise<ActionResult> {
  await requireRole("ADMIN");

  const parsed = createUserSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  const { nombre, apellido, email, password, rol } = parsed.data;

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nombre, apellido, rol },
  });

  if (error) {
    if (error.message.toLowerCase().includes("already")) {
      return { error: "Ya existe un usuario registrado con ese correo." };
    }
    return { error: error.message };
  }

  const supabase = await createClient();
  await supabase.rpc("log_audit_event", {
    p_action: "CREACION_USUARIO",
    p_entity_type: "profiles",
    p_entity_id: data.user?.id ?? null,
    p_details: { email, rol },
  });

  revalidatePath("/usuarios");
  revalidatePath("/trabajadores");
  return {};
}

export async function updateUser(input: unknown): Promise<ActionResult> {
  await requireRole("ADMIN");

  const parsed = updateUserSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  const { id, nombre, apellido, rol, activo } = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ nombre, apellido, rol, activo })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/usuarios");
  revalidatePath("/trabajadores");
  return {};
}
