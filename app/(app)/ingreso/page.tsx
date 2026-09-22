import type { Metadata } from "next";
import { getParkingSpots } from "@/services/parking";
import { getTariffMap, getToleranceSettings, getFlatRateSettings, getFlatRateCapacity } from "@/services/tariffs";
import { ParkingGrid } from "@/components/parking/ParkingGrid";

export const metadata: Metadata = { title: "Registrar ingreso" };

export default async function IngresoPage() {
  const [spots, tariffMap, tolerance, flatRate, flatRateCapacity] = await Promise.all([
    getParkingSpots(),
    getTariffMap(),
    getToleranceSettings(),
    getFlatRateSettings(),
    getFlatRateCapacity(),
  ]);
  const free = spots.filter((s) => s.status === "LIBRE").length;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-foreground">Registrar ingreso</h1>
        <p className="text-sm text-muted">
          Toca un estacionamiento <span className="font-semibold text-success">libre</span> para registrar
          el ingreso de un vehículo. Hay {free} espacios disponibles.
        </p>
      </div>

      <ParkingGrid
        spots={spots}
        tariffMap={tariffMap}
        tolerance={tolerance}
        flatRate={flatRate}
        flatRateCapacity={flatRateCapacity}
        mode="entry"
      />
    </div>
  );
}
