import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/types/database";

export interface ProfileRow {
  id: string;
  nombre: string;
  apellido: string;
  email: string;
  rol: UserRole;
  activo: boolean;
  createdAt: string;
}

export async function getProfiles(): Promise<ProfileRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, nombre, apellido, email, rol, activo, created_at")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  return (data ?? []).map((p) => ({
    id: p.id,
    nombre: p.nombre,
    apellido: p.apellido,
    email: p.email,
    rol: p.rol,
    activo: p.activo,
    createdAt: p.created_at,
  }));
}

export async function getActiveWorkers(): Promise<ProfileRow[]> {
  const profiles = await getProfiles();
  return profiles.filter((p) => p.activo);
}
