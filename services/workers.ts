import "server-only";
import { createClient } from "@/lib/supabase/server";
import { businessDateLima } from "@/lib/datetime";
import { getProfiles } from "@/services/users";

export interface WorkerActivity {
  id: string;
  nombre: string;
  apellido: string;
  email: string;
  activo: boolean;
  ingresosHoy: number;
  salidasHoy: number;
  banosHoy: number;
}

export async function getWorkerActivityToday(): Promise<WorkerActivity[]> {
  const supabase = await createClient();
  const profiles = await getProfiles();
  const workers = profiles.filter((p) => p.rol === "TRABAJADOR");

  const today = businessDateLima();
  const startUtc = `${today}T00:00:00-05:00`;
  const endUtc = `${today}T23:59:59-05:00`;

  const [{ data: entries }, { data: exits }, { data: restroom }] = await Promise.all([
    supabase.from("vehicle_entries").select("registered_by").gte("entry_at", startUtc).lte("entry_at", endUtc),
    supabase.from("vehicle_exits").select("registered_by").gte("exit_at", startUtc).lte("exit_at", endUtc),
    supabase.from("restroom_uses").select("registered_by").gte("used_at", startUtc).lte("used_at", endUtc),
  ]);

  const countBy = (rows: { registered_by: string }[] | null) => {
    const map = new Map<string, number>();
    for (const row of rows ?? []) {
      map.set(row.registered_by, (map.get(row.registered_by) ?? 0) + 1);
    }
    return map;
  };

  const entryCounts = countBy(entries);
  const exitCounts = countBy(exits);
  const restroomCounts = countBy(restroom);

  return workers.map((w) => ({
    id: w.id,
    nombre: w.nombre,
    apellido: w.apellido,
    email: w.email,
    activo: w.activo,
    ingresosHoy: entryCounts.get(w.id) ?? 0,
    salidasHoy: exitCounts.get(w.id) ?? 0,
    banosHoy: restroomCounts.get(w.id) ?? 0,
  }));
}
