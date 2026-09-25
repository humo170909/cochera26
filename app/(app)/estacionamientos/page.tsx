import type { Metadata } from "next";
import { getParkingSpots } from "@/services/parking";
import { getTariffMap, getToleranceSettings, getFlatRateSettings } from "@/services/tariffs";
import { ParkingGrid } from "@/components/parking/ParkingGrid";
import { TOTAL_PARKING_SPOTS } from "@/lib/constants";

export const metadata: Metadata = { title: "Estacionamientos" };

export default async function EstacionamientosPage() {
  const [spots, tariffMap, tolerance, flatRate] = await Promise.all([
    getParkingSpots(),
    getTariffMap(),
    getToleranceSettings(),
    getFlatRateSettings(),
  ]);
  const occupied = spots.filter((s) => s.status === "OCUPADO").length;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-foreground">Estacionamientos</h1>
        <p className="text-sm text-muted">
          {TOTAL_PARKING_SPOTS} espacios · {occupied} ocupados · {TOTAL_PARKING_SPOTS - occupied} libres
        </p>
      </div>

      <div className="flex items-center gap-4 text-xs font-medium text-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-success" /> Libre
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-danger" /> Ocupado
        </span>
      </div>

      <ParkingGrid
        spots={spots}
        tariffMap={tariffMap}
        tolerance={tolerance}
        flatRate={flatRate}
        mode="view"
      />
    </div>
  );
}
