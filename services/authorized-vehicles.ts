import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { AuthorizedVehicleStatus, VehicleType } from "@/types/database";

export interface AuthorizedVehicleRow {
  id: string;
  plate: string;
  propietario: string;
  vehicleType: VehicleType;
  telefono: string | null;
  estado: AuthorizedVehicleStatus;
  observaciones: string | null;
  createdAt: string;
}

interface RawAuthorizedVehicleRow {
  id: string;
  plate: string;
  propietario: string;
  vehicle_type: VehicleType;
  telefono: string | null;
  estado: AuthorizedVehicleStatus;
  observaciones: string | null;
  created_at: string;
}

export async function getAuthorizedVehicles(): Promise<AuthorizedVehicleRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("authorized_vehicles")
    .select("id, plate, propietario, vehicle_type, telefono, estado, observaciones, created_at")
    .order("created_at", { ascending: false })
    .returns<RawAuthorizedVehicleRow[]>();

  if (error) throw new Error(error.message);

  return (data ?? []).map((v) => ({
    id: v.id,
    plate: v.plate,
    propietario: v.propietario,
    vehicleType: v.vehicle_type,
    telefono: v.telefono,
    estado: v.estado,
    observaciones: v.observaciones,
    createdAt: v.created_at,
  }));
}
