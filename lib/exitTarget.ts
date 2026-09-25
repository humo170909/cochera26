import type { ExitTarget } from "@/components/parking/PaymentModal";
import type { ParkingSpotWithEntry } from "@/types/domain";
import type { VehicleType } from "@/types/database";

/**
 * Arma el ExitTarget que PaymentModal necesita a partir de un espacio
 * ocupado. Única fuente de verdad para esta construcción — la usan tanto
 * el clic sobre un espacio en la grilla como la búsqueda por placa en
 * /salida, para no duplicar esta lógica en dos lugares.
 */
export function buildExitTarget(
  spot: ParkingSpotWithEntry,
  tariffMap: Record<VehicleType, number>
): ExitTarget | null {
  const entry = spot.activeEntry;
  if (!entry) return null;

  return {
    entryId: entry.id,
    plate: entry.plate,
    spotCode: spot.code,
    entryAt: entry.entryAt,
    pricePerHour: tariffMap[entry.vehicleType] ?? 0,
    vehicleType: entry.vehicleType,
    coveredBySubscription: entry.coveredBySubscription,
    subscriberName: entry.subscriberName,
    flatRateReserved: entry.flatRateReserved,
    flatRatePeriod: entry.flatRatePeriod,
    flatRatePriceSnapshot: entry.flatRatePriceSnapshot,
    isAuthorized: entry.isAuthorized,
    authorizedOwnerName: entry.authorizedOwnerName,
  };
}
