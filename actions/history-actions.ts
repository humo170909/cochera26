"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/dal";
import { updateVehicleVisitSchema, deleteVehicleVisitSchema } from "@/lib/validation";
import { fromLimaInputValue } from "@/lib/datetime";
import type { ActionResult } from "@/actions/vehicle-actions";

function revalidateHistory() {
  revalidatePath("/historial");
  revalidatePath("/caja");
  revalidatePath("/dashboard");
  revalidatePath("/reportes");
}

/** Exclusivo ADMIN — corrige un ingreso/salida ya finalizado. La
 * autorización real vive en admin_update_vehicle_visit() (exige
 * is_admin() internamente); requireRole() acá es una segunda capa, no la
 * única. Los datetime-local ("yyyy-MM-ddTHH:mm") se interpretan siempre
 * como hora de Lima antes de enviarlos al RPC. */
export async function updateVehicleVisit(input: unknown): Promise<ActionResult> {
  await requireRole("ADMIN");

  const parsed = updateVehicleVisitSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_update_vehicle_visit", {
    p_exit_id: parsed.data.exitId,
    p_plate: parsed.data.plate,
    p_vehicle_type: parsed.data.vehicleType,
    p_spot_id: parsed.data.spotId,
    p_entry_at: fromLimaInputValue(parsed.data.entryAt),
    p_exit_at: fromLimaInputValue(parsed.data.exitAt),
    p_payment_method: parsed.data.paymentMethod,
    p_amount: parsed.data.amount,
  });
  if (error) return { error: error.message };

  revalidateHistory();
  return {};
}

/** Exclusivo ADMIN — elimina un ingreso/salida ya finalizado, con sus
 * dependientes propios (ticket, movimiento de caja). Ver
 * admin_delete_vehicle_visit() para el detalle de relaciones. */
export async function deleteVehicleVisit(input: unknown): Promise<ActionResult> {
  await requireRole("ADMIN");

  const parsed = deleteVehicleVisitSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Registro inválido." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_delete_vehicle_visit", {
    p_exit_id: parsed.data.exitId,
  });
  if (error) return { error: error.message };

  revalidateHistory();
  return {};
}
