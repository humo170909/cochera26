import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { DashboardSnapshot } from "@/types/database";

export async function getDashboardSnapshot(): Promise<DashboardSnapshot> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_dashboard_snapshot");
  if (error || !data) {
    throw new Error(error?.message ?? "No se pudo cargar el dashboard.");
  }
  return data as DashboardSnapshot;
}
