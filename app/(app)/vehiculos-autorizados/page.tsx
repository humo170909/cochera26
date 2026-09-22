import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/dal";
import { getAuthorizedVehicles } from "@/services/authorized-vehicles";
import { Card, CardHeader, Badge } from "@/components/ui/Card";
import { NewAuthorizedVehicleModal } from "@/components/vehiculos-autorizados/NewAuthorizedVehicleModal";
import { EditAuthorizedVehicleModal } from "@/components/vehiculos-autorizados/EditAuthorizedVehicleModal";
import { VEHICLE_TYPE_LABELS, AUTHORIZED_VEHICLE_STATUS_LABELS } from "@/lib/constants";

export const metadata: Metadata = { title: "Vehículos Autorizados" };

export default async function VehiculosAutorizadosPage() {
  await requireRole("ADMIN");
  const vehicles = await getAuthorizedVehicles();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Vehículos Autorizados</h1>
          <p className="text-sm text-muted">
            🟣 Placas que ingresan y ocupan espacio sin generar cobro ni movimiento de caja. No es un abonado.
          </p>
        </div>
        <NewAuthorizedVehicleModal />
      </div>

      <Card>
        <CardHeader title={`${vehicles.length} vehículos autorizados`} />

        {vehicles.length === 0 && (
          <p className="px-5 py-10 text-center text-muted">Aún no hay vehículos autorizados registrados.</p>
        )}

        {vehicles.length > 0 && (
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-5 py-3">Propietario</th>
                  <th className="px-5 py-3">Placa</th>
                  <th className="px-5 py-3">Vehículo</th>
                  <th className="px-5 py-3">Teléfono</th>
                  <th className="px-5 py-3">Estado</th>
                  <th className="px-5 py-3">Observación</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {vehicles.map((v) => (
                  <tr key={v.id} className="border-b border-border last:border-0">
                    <td className="px-5 py-3 font-semibold text-foreground">{v.propietario}</td>
                    <td className="px-5 py-3 font-semibold text-foreground">{v.plate}</td>
                    <td className="px-5 py-3 text-foreground">{VEHICLE_TYPE_LABELS[v.vehicleType]}</td>
                    <td className="px-5 py-3 text-foreground">{v.telefono || "—"}</td>
                    <td className="px-5 py-3">
                      <Badge tone={v.estado === "ACTIVO" ? "purple" : "neutral"}>
                        {AUTHORIZED_VEHICLE_STATUS_LABELS[v.estado]}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 text-muted">{v.observaciones || "—"}</td>
                    <td className="px-5 py-3 text-right">
                      <EditAuthorizedVehicleModal vehicle={v} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {vehicles.length > 0 && (
          <div className="flex flex-col gap-3 p-4 md:hidden">
            {vehicles.map((v) => (
              <div key={v.id} className="rounded-2xl border border-border bg-surface-2 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-foreground">{v.propietario}</p>
                    <p className="text-xs text-muted">{v.telefono || "—"}</p>
                  </div>
                  <Badge tone={v.estado === "ACTIVO" ? "purple" : "neutral"}>
                    {AUTHORIZED_VEHICLE_STATUS_LABELS[v.estado]}
                  </Badge>
                </div>

                <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
                  <div className="flex flex-col">
                    <dt className="text-xs text-muted">Placa</dt>
                    <dd className="font-medium text-foreground">{v.plate}</dd>
                  </div>
                  <div className="flex flex-col">
                    <dt className="text-xs text-muted">Vehículo</dt>
                    <dd className="font-medium text-foreground">{VEHICLE_TYPE_LABELS[v.vehicleType]}</dd>
                  </div>
                  {v.observaciones && (
                    <div className="col-span-2 flex flex-col">
                      <dt className="text-xs text-muted">Observación</dt>
                      <dd className="font-medium text-foreground">{v.observaciones}</dd>
                    </div>
                  )}
                </dl>

                <div className="mt-3">
                  <EditAuthorizedVehicleModal vehicle={v} fullWidth />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
