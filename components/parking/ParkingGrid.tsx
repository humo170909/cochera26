"use client";

import { useState } from "react";
import { ParkingSpotTile } from "@/components/parking/ParkingSpotTile";
import { SpotDetailsModal } from "@/components/parking/SpotDetailsModal";
import { useRealtimeRefresh } from "@/hooks/useRealtimeRefresh";
import type { ParkingSpotWithEntry, FlatRateSettings, ToleranceSettings } from "@/types/domain";
import type { VehicleType } from "@/types/database";

/**
 * "view": /estacionamientos y /ingreso — solo consulta, los espacios
 * ocupados muestran su detalle (incluida la corrección de datos); el
 * espacio para un nuevo ingreso ya no se elige acá, lo asigna
 * automáticamente register_vehicle_entry() (ver VehicleEntryModal, 0027).
 * "exit": /salida — los espacios ocupados invocan `onSelectExit` (el cobro
 * de salida ya no vive acá: SalidaWorkspace es dueño del PaymentModal para
 * poder alimentarlo también desde la búsqueda por placa, ver
 * buildExitTarget en lib/exitTarget.ts). Los libres no ejecutan ninguna
 * acción en ningún modo.
 */
export type ParkingGridMode = "view" | "exit";

export function ParkingGrid({
  spots,
  tariffMap,
  tolerance,
  flatRate,
  mode,
  onSelectExit,
}: {
  spots: ParkingSpotWithEntry[];
  tariffMap: Record<VehicleType, number>;
  tolerance: ToleranceSettings;
  flatRate: FlatRateSettings;
  mode: ParkingGridMode;
  onSelectExit?: (spot: ParkingSpotWithEntry) => void;
}) {
  // "vehicle_entries" se agregó porque update_active_entry_details()
  // (corrección de placa/tipo) solo toca esa tabla, nunca parking_spots —
  // sin esto, la corrección no se reflejaba en la grilla hasta una
  // recarga manual de la página.
  useRealtimeRefresh(["parking_spots", "vehicle_entries"]);

  const [detailsTarget, setDetailsTarget] = useState<ParkingSpotWithEntry | null>(null);

  return (
    <>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3 md:grid-cols-6 lg:grid-cols-8">
        {spots.map((spot) => (
          <ParkingSpotTile
            key={spot.id}
            spot={spot}
            interactive={spot.status === "OCUPADO"}
            onClick={() => {
              if (spot.status === "OCUPADO") {
                if (mode === "exit") {
                  onSelectExit?.(spot);
                } else {
                  setDetailsTarget(spot);
                }
              }
              // LIBRE: solo consulta, sin acción (el ingreso ya no se
              // dispara tocando un espacio — ver VehicleEntryModal).
            }}
          />
        ))}
      </div>

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
    </>
  );
}
