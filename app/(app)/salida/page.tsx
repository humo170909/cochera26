import type { Metadata } from "next";
import { getParkingSpots } from "@/services/parking";
import { getTariffMap, getToleranceSettings, getFlatRateSettings } from "@/services/tariffs";
import { SalidaWorkspace } from "@/components/parking/SalidaWorkspace";

export const metadata: Metadata = { title: "Registrar salida" };

export default async function SalidaPage() {
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
        <h1 className="text-2xl font-bold text-foreground">Registrar salida</h1>
        <p className="text-sm text-muted">
          Busca el vehículo por su placa para registrar la salida. Hay {occupied}{" "}
          {occupied === 1 ? "vehículo dentro" : "vehículos dentro"}.
        </p>
      </div>

      <SalidaWorkspace spots={spots} tariffMap={tariffMap} tolerance={tolerance} flatRate={flatRate} />
    </div>
  );
}
