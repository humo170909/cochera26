"use client";

import { useState } from "react";
import { ParkingGrid } from "@/components/parking/ParkingGrid";
import { PaymentModal, type ExitTarget } from "@/components/parking/PaymentModal";
import { SearchVehicleBox } from "@/components/parking/SearchVehicleBox";
import { buildExitTarget } from "@/lib/exitTarget";
import { normalizePlate } from "@/lib/plate";
import type { ParkingSpotWithEntry, FlatRateSettings, ToleranceSettings } from "@/types/domain";
import type { VehicleType } from "@/types/database";

/**
 * Dueño único del PaymentModal en /salida: tanto la búsqueda por placa
 * como el clic sobre un espacio ocupado en la grilla terminan en el mismo
 * ExitTarget (buildExitTarget) y el mismo PaymentModal — el cálculo de
 * tarifa, el cobro, el ticket y la caja son exactamente los que ya
 * existían, sin ninguna lógica nueva de salida.
 *
 * La búsqueda solo mira `spots` (ya cargado por la página, con
 * activeEntry únicamente para espacios OCUPADO) — nunca consulta
 * historial, así que un vehículo que ya salió jamás puede encontrarse acá.
 */
export function SalidaWorkspace({
  spots,
  tariffMap,
  tolerance,
  flatRate,
}: {
  spots: ParkingSpotWithEntry[];
  tariffMap: Record<VehicleType, number>;
  tolerance: ToleranceSettings;
  flatRate: FlatRateSettings;
}) {
  const [exitTarget, setExitTarget] = useState<ExitTarget | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  const openExitForSpot = (spot: ParkingSpotWithEntry) => {
    const target = buildExitTarget(spot, tariffMap);
    if (target) setExitTarget(target);
  };

  const onSearch = (plateQuery: string) => {
    setSearchError(null);
    const normalized = normalizePlate(plateQuery);
    if (!normalized) return;

    const spot = spots.find(
      (s) => s.activeEntry && normalizePlate(s.activeEntry.plate) === normalized
    );

    if (!spot) {
      setSearchError(
        "Vehículo no encontrado. Verifica la placa o confirma que el vehículo se encuentre dentro del estacionamiento."
      );
      return;
    }

    openExitForSpot(spot);
  };

  return (
    <>
      <SearchVehicleBox onSearch={onSearch} error={searchError} />

      <ParkingGrid
        spots={spots}
        tariffMap={tariffMap}
        tolerance={tolerance}
        flatRate={flatRate}
        mode="exit"
        onSelectExit={openExitForSpot}
      />

      <PaymentModal
        target={exitTarget}
        tolerance={tolerance}
        flatRate={flatRate}
        onClose={() => setExitTarget(null)}
      />
    </>
  );
}
