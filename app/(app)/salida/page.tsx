import type { Metadata } from "next";
import { getParkingSpots } from "@/services/parking";
import { getTariffMap, getToleranceSettings, getFlatRateSettings, getFlatRateCapacity } from "@/services/tariffs";
import { ParkingGrid } from "@/components/parking/ParkingGrid";

export const metadata: Metadata = { title: "Registrar salida" };

export default async function SalidaPage() {
  const [spots, tariffMap, tolerance, flatRate, flatRateCapacity] = await Promise.all([
    getParkingSpots(),
    getTariffMap(),
    getToleranceSettings(),
    getFlatRateSettings(),
    getFlatRateCapacity(),
  ]);
  const occupied = spots.filter((s) => s.status === "OCUPADO").length;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-foreground">Registrar salida</h1>
        <p className="text-sm text-muted">
          Selecciona un estacionamiento <span className="font-semibold text-danger">ocupado</span> para
          registrar la salida. Hay {occupied} {occupied === 1 ? "vehículo dentro" : "vehículos dentro"}.
        </p>
      </div>

      <ParkingGrid
        spots={spots}
        tariffMap={tariffMap}
        tolerance={tolerance}
        flatRate={flatRate}
        flatRateCapacity={flatRateCapacity}
        mode="exit"
      />
    </div>
  );
}
