import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/types/database";

export interface AuthProfile {
  id: string;
  nombre: string;
  apellido: string;
  email: string;
  rol: UserRole;
  activo: boolean;
}

/**
 * Verifica la sesión contra el servidor de Supabase Auth (no confía solo en
 * la cookie) y devuelve el perfil (rol, activo) desde la base de datos.
 * Memoizado por request con React.cache: se puede llamar en múltiples
 * Server Components/Actions sin duplicar consultas.
 */
export const getAuthProfile = cache(async (): Promise<AuthProfile | null> => {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) return null;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, nombre, apellido, email, rol, activo")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) return null;

  return profile;
});

/** Exige una sesión válida y un perfil activo. Redirige a /login si no la hay. */
export async function requireAuth(): Promise<AuthProfile> {
  const profile = await getAuthProfile();
  if (!profile || !profile.activo) {
    redirect("/login");
  }
  return profile;
}

/**
 * Exige que el usuario autenticado tenga uno de los roles indicados.
 * Un trabajador que intente entrar a una ruta de administrador es
 * redirigido a su propio dashboard (no solo se le oculta el botón).
 */
export async function requireRole(...roles: UserRole[]): Promise<AuthProfile> {
  const profile = await requireAuth();
  if (!roles.includes(profile.rol)) {
    redirect("/dashboard?unauthorized=1");
  }
  return profile;
}
