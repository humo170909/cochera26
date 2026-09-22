"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loginSchema } from "@/lib/validation";

export interface LoginState {
  error?: string;
}

export async function login(
  _prevState: LoginState,
  formData: FormData
): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    return { error: "Correo o contraseña incorrectos." };
  }

  await supabase.rpc("log_audit_event", {
    p_action: "LOGIN",
    p_entity_type: "auth",
  });

  redirect("/dashboard");
}

export async function logout() {
  const supabase = await createClient();

  await supabase.rpc("log_audit_event", {
    p_action: "LOGOUT",
    p_entity_type: "auth",
  });
  await supabase.auth.signOut();

  redirect("/login");
}
