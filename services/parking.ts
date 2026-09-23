import "server-only";
import { createClient } from "@/lib/supabase/server";
import { businessDateLima } from "@/lib/datetime";
import type { VehicleType } from "@/types/database";
import type { ParkingSpotWithEntry } from "@/types/domain";

interface ParkingSpotRow {
  id: string;
  code: string;
  status: "LIBRE" | "OCUPADO";
  spot_type: string;
  entry: {
    id: string;
    plate: string;
    vehicle_type: VehicleType;
    entry_at: string;
    covered_by_subscription: boolean;
    flat_rate_reserved: boolean;
    flat_rate_price_snapshot: number | null;
    is_authorized: boolean;
    registrar: { nombre: string; apellido: string } | null;
    subscriber: { nombre_completo: string } | null;
    authorized: { propietario: string } | null;
  } | null;
}

interface ReservationRow {
  assigned_spot_id: string;
  plate: string;
  nombre_completo: string;
}

/** Los 31 estacionamientos con su ocupación actual (si la tiene) y, para los
 * que están libres, si pertenecen en fijo a un abonado activo. */
export async function getParkingSpots(): Promise<ParkingSpotWithEntry[]> {
  const supabase = await createClient();

  const [{ data, error }, { data: reservations, error: reservationsError }] = await Promise.all([
    supabase
      .from("parking_spots")
      .select(
        `id, code, status, spot_type,
         entry:vehicle_entries!fk_parking_spots_current_entry (
           id, plate, vehicle_type, entry_at, covered_by_subscription, flat_rate_reserved, flat_rate_price_snapshot, is_authorized,
           registrar:profiles!vehicle_entries_registered_by_fkey ( nombre, apellido ),
           subscriber:subscribers!vehicle_entries_subscriber_id_fkey ( nombre_completo ),
           authorized:authorized_vehicles!vehicle_entries_authorized_vehicle_id_fkey ( propietario )
         )`
      )
      .order("code")
      .returns<ParkingSpotRow[]>(),
    supabase
      .from("subscribers")
      .select("assigned_spot_id, plate, nombre_completo")
      .eq("estado", "ACTIVO")
      .not("assigned_spot_id", "is", null)
      .gte("fecha_vencimiento", businessDateLima())
      .returns<ReservationRow[]>(),
  ]);

  if (error) throw new Error(error.message);
  if (reservationsError) throw new Error(reservationsError.message);

  const reservationBySpot = new Map<string, ReservationRow>();
  for (const r of reservations ?? []) {
    reservationBySpot.set(r.assigned_spot_id, r);
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    code: row.code,
    status: row.status,
    spotType: row.spot_type,
    activeEntry: row.entry
      ? {
          id: row.entry.id,
          plate: row.entry.plate,
          vehicleType: row.entry.vehicle_type,
          entryAt: row.entry.entry_at,
          registeredByName: `${row.entry.registrar?.nombre ?? ""} ${row.entry.registrar?.apellido ?? ""}`.trim(),
          coveredBySubscription: row.entry.covered_by_subscription,
          subscriberName: row.entry.subscriber?.nombre_completo ?? null,
          flatRateReserved: row.entry.flat_rate_reserved,
          flatRatePriceSnapshot:
            row.entry.flat_rate_price_snapshot !== null ? Number(row.entry.flat_rate_price_snapshot) : null,
          isAuthorized: row.entry.is_authorized,
          authorizedOwnerName: row.entry.authorized?.propietario ?? null,
        }
      : null,
    reservedFor: row.status === "LIBRE" && reservationBySpot.has(row.id)
      ? {
          plate: reservationBySpot.get(row.id)!.plate,
          nombreCompleto: reservationBySpot.get(row.id)!.nombre_completo,
        }
      : null,
  }));
}

/** Solo los espacios libres, para el selector del formulario de ingreso. */
export async function getFreeParkingSpots() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("parking_spots")
    .select("id, code")
    .eq("status", "LIBRE")
    .order("code");

  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Los 31 espacios (cualquier estado), para el selector de "espacio
 * asignado" en el formulario de abonados — un espacio puede reservarse a
 * un abonado aunque en este momento esté ocupado por otro vehículo. */
export async function getAllSpotCodes() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("parking_spots")
    .select("id, code")
    .order("code");

  if (error) throw new Error(error.message);
  return data ?? [];
}
