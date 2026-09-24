"use client";

import { useState } from "react";
import { ParkingSpotTile } from "@/components/parking/ParkingSpotTile";
import { VehicleEntryModal } from "@/components/parking/VehicleEntryModal";
import { SpotDetailsModal } from "@/components/parking/SpotDetailsModal";
import { PaymentModal, type ExitTarget } from "@/components/parking/PaymentModal";
import { useRealtimeRefresh } from "@/hooks/useRealtimeRefresh";
import type {
  ParkingSpotWithEntry,
  FlatRateCapacity,
  FlatRateSettings,
  ToleranceSettings,
} from "@/types/domain";
import type { VehicleType } from "@/types/database";

/**
 * "view": /estacionamientos — solo consulta, ningún espacio ejecuta acciones.
 * "entry": /ingreso — los espacios libres abren el formulario de ingreso;
 * los ocupados solo muestran información de solo lectura.
 * "exit": /salida — los espacios ocupados abren directamente el cobro de
 * salida (toda la tarjeta es el botón, sin paso intermedio); los libres no
 * ejecutan ninguna acción.
 */
export type ParkingGridMode = "view" | "entry" | "exit";

export function ParkingGrid({
  spots,
  tariffMap,
  tolerance,
  flatRate,
  flatRateCapacity,
  mode,
}: {
  spots: ParkingSpotWithEntry[];
  tariffMap: Record<VehicleType, number>;
  tolerance: ToleranceSettings;
  flatRate: FlatRateSettings;
  flatRateCapacity: FlatRateCapacity;
  mode: ParkingGridMode;
}) {
  // "vehicle_entries" se agregó porque update_active_entry_vehicle_type()
  // (corrección de tipo de vehículo) solo toca esa tabla, nunca
  // parking_spots — sin esto, el tipo corregido no se reflejaba en la
  // grilla hasta una recarga manual de la página.
  useRealtimeRefresh(["parking_spots", "vehicle_entries"]);

  const [entryTarget, setEntryTarget] = useState<{ id: string; code: string } | null>(null);
  const [detailsTarget, setDetailsTarget] = useState<ParkingSpotWithEntry | null>(null);
  const [exitTarget, setExitTarget] = useState<ExitTarget | null>(null);

  const freeSpots = spots.filter((s) => s.status === "LIBRE").map((s) => ({ id: s.id, code: s.code }));

  const openExit = (spot: ParkingSpotWithEntry) => {
    const entry = spot.activeEntry;
    if (!entry) return;
    setExitTarget({
      entryId: entry.id,
      plate: entry.plate,
      spotCode: spot.code,
      entryAt: entry.entryAt,
      pricePerHour: tariffMap[entry.vehicleType] ?? 0,
      vehicleType: entry.vehicleType,
      coveredBySubscription: entry.coveredBySubscription,
      subscriberName: entry.subscriberName,
      flatRateReserved: entry.flatRateReserved,
      flatRatePriceSnapshot: entry.flatRatePriceSnapshot,
      isAuthorized: entry.isAuthorized,
      authorizedOwnerName: entry.authorizedOwnerName,
    });
  };

  return (
    <>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3 md:grid-cols-6 lg:grid-cols-8">
        {spots.map((spot) => (
          <ParkingSpotTile
            key={spot.id}
            spot={spot}
            interactive={mode === "entry" ? true : spot.status === "OCUPADO"}
            onClick={() => {
              if (spot.status === "OCUPADO") {
                if (mode === "exit") {
                  openExit(spot);
                } else {
                  setDetailsTarget(spot);
                }
              } else if (mode === "entry") {
                setEntryTarget({ id: spot.id, code: spot.code });
              }
              // mode === "view" | "exit" + LIBRE: solo consulta, sin acción.
            }}
          />
        ))}
      </div>

      {mode === "entry" && (
        <VehicleEntryModal
          open={!!entryTarget}
          fixedSpot={entryTarget ?? undefined}
          freeSpots={freeSpots}
          flatRateSettings={flatRate}
          flatRateCapacity={flatRateCapacity}
          onClose={() => setEntryTarget(null)}
        />
      )}

      {mode !== "exit" && (
        <SpotDetailsModal
          spot={detailsTarget}
          pricePerHour={
            detailsTarget?.activeEntry ? tariffMap[detailsTarget.activeEntry.vehicleType] ?? 0 : 0
          }
          tolerance={tolerance}
          flatRate={flatRate}
          onClose={() => setDetailsTarget(null)}
        />
      )}

      {mode === "exit" && (
        <PaymentModal target={exitTarget} tolerance={tolerance} flatRate={flatRate} onClose={() => setExitTarget(null)} />
      )}
    </>
  );
}
