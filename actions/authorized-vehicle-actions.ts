"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/dal";
import { createAuthorizedVehicleSchema, updateAuthorizedVehicleSchema } from "@/lib/validation";
import type { ActionResult } from "@/actions/vehicle-actions";

export async function createAuthorizedVehicle(input: unknown): Promise<ActionResult> {
  const profile = await requireRole("ADMIN");

  const parsed = createAuthorizedVehicleSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  const d = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.from("authorized_vehicles").insert({
    plate: d.plate,
    propietario: d.propietario,
    vehicle_type: d.vehicleType,
    telefono: d.telefono || null,
    estado: d.estado,
    observaciones: d.observaciones || null,
    created_by: profile.id,
    updated_by: profile.id,
  });

  if (error) {
    if (error.message.toLowerCase().includes("duplicate") || error.message.toLowerCase().includes("unique")) {
      return { error: "Ya existe un vehículo autorizado con esa placa." };
    }
    return { error: error.message };
  }

  revalidatePath("/vehiculos-autorizados");
  return {};
}

export async function updateAuthorizedVehicle(input: unknown): Promise<ActionResult> {
  const profile = await requireRole("ADMIN");

  const parsed = updateAuthorizedVehicleSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  const d = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase
    .from("authorized_vehicles")
    .update({
      plate: d.plate,
      propietario: d.propietario,
      vehicle_type: d.vehicleType,
      telefono: d.telefono || null,
      estado: d.estado,
      observaciones: d.observaciones || null,
      updated_by: profile.id,
    })
    .eq("id", d.id);

  if (error) {
    if (error.message.toLowerCase().includes("duplicate") || error.message.toLowerCase().includes("unique")) {
      return { error: "Ya existe un vehículo autorizado con esa placa." };
    }
    return { error: error.message };
  }

  revalidatePath("/vehiculos-autorizados");
  return {};
}
