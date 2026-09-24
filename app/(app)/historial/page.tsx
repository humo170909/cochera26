import type { Metadata } from "next";
import { requireAuth } from "@/lib/auth/dal";
import { getVehicleHistory } from "@/services/history";
import { getActiveWorkers } from "@/services/users";
import { getParkingSpots } from "@/services/parking";
import { VisitRowActions } from "@/components/historial/VisitRowActions";
import { Card, CardHeader } from "@/components/ui/Card";
import { Select, Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { formatCurrency } from "@/lib/format";
import { formatDurationMinutes, formatDateTimeLima, formatShortTimeLima } from "@/lib/datetime";
import {
  VEHICLE_TYPES,
  VEHICLE_TYPE_LABELS,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  TARIFF_TYPES,
  TARIFF_TYPE_LABELS,
} from "@/lib/constants";
import type { PaymentMethod, TariffType, VehicleType } from "@/types/database";

export const metadata: Metadata = { title: "Historial" };

interface SearchParams {
  dateFrom?: string;
  dateTo?: string;
  plate?: string;
  vehicleType?: string;
  workerId?: string;
  paymentMethod?: string;
  tariffType?: string;
}

export default async function HistorialPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const profile = await requireAuth();
  const isAdmin = profile.rol === "ADMIN";

  const params = await searchParams;
  const [rows, workers, spots] = await Promise.all([
    getVehicleHistory({
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
      plate: params.plate,
      vehicleType: params.vehicleType as VehicleType | undefined,
      workerId: params.workerId,
      paymentMethod: params.paymentMethod as PaymentMethod | undefined,
      tariffType: params.tariffType as TariffType | undefined,
    }),
    getActiveWorkers(),
    isAdmin ? getParkingSpots() : Promise.resolve([]),
  ]);
  const spotOptions = spots.map((s) => ({ id: s.id, code: s.code }));

  const totalAmount = rows.reduce((sum, r) => sum + r.amount, 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-foreground">Historial de operaciones</h1>
        <p className="text-sm text-muted">{rows.length} registros · Total {formatCurrency(totalAmount)}</p>
      </div>

      <Card>
        <CardHeader title="Filtros" />
        <form method="get" className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-3 lg:grid-cols-7">
          <LabeledInput label="Desde" name="dateFrom" type="date" defaultValue={params.dateFrom} />
          <LabeledInput label="Hasta" name="dateTo" type="date" defaultValue={params.dateTo} />
          <LabeledInput label="Placa" name="plate" placeholder="ABC-123" defaultValue={params.plate} />

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-foreground">Tipo</label>
            <Select name="vehicleType" defaultValue={params.vehicleType ?? ""}>
              <option value="">Todos</option>
              {VEHICLE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {VEHICLE_TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-foreground">Tipo de operación</label>
            <Select name="tariffType" defaultValue={params.tariffType ?? ""}>
              <option value="">Todos</option>
              {TARIFF_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TARIFF_TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-foreground">Método de pago</label>
            <Select name="paymentMethod" defaultValue={params.paymentMethod ?? ""}>
              <option value="">Todos</option>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_METHOD_LABELS[m]}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-foreground">Trabajador</label>
            <Select name="workerId" defaultValue={params.workerId ?? ""}>
              <option value="">Todos</option>
              {workers.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.nombre} {w.apellido}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex items-end gap-2 sm:col-span-3 lg:col-span-7">
            <Button type="submit">Filtrar</Button>
            <a href="/historial">
              <Button type="button" variant="secondary">
                Limpiar
              </Button>
            </a>
          </div>
        </form>
      </Card>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-5 py-3">Placa</th>
                <th className="px-5 py-3">Espacio</th>
                <th className="px-5 py-3">Ingreso</th>
                <th className="px-5 py-3">Salida</th>
                <th className="px-5 py-3">Tiempo</th>
                <th className="px-5 py-3">Tarifa</th>
                <th className="px-5 py-3">Total</th>
                <th className="px-5 py-3">Método</th>
                <th className="px-5 py-3">Trabajador</th>
                {isAdmin && <th className="px-5 py-3">Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={isAdmin ? 10 : 9} className="px-5 py-10 text-center text-muted">
                    No hay operaciones con los filtros seleccionados.
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.exitId} className="border-b border-border last:border-0">
                  <td className="px-5 py-3 font-semibold text-foreground">{r.plate}</td>
                  <td className="px-5 py-3 text-foreground">{r.spotCode}</td>
                  <td className="px-5 py-3 text-foreground">{formatDateTimeLima(new Date(r.entryAt))}</td>
                  <td className="px-5 py-3 text-foreground">{formatShortTimeLima(r.exitAt)}</td>
                  <td className="px-5 py-3 text-foreground">{formatDurationMinutes(r.durationMinutes)}</td>
                  <td className="px-5 py-3 text-foreground">
                    {TARIFF_TYPE_LABELS[r.tariffType]}
                    {r.toleranceMinutesApplied !== null && (
                      <span className="block text-xs text-muted">tolerancia {r.toleranceMinutesApplied} min</span>
                    )}
                  </td>
                  <td className="px-5 py-3 font-semibold text-foreground">{formatCurrency(r.amount)}</td>
                  <td className="px-5 py-3 text-foreground">
                    {r.paymentMethod ? PAYMENT_METHOD_LABELS[r.paymentMethod] : "—"}
                  </td>
                  <td className="px-5 py-3 text-muted">{r.workerName || "—"}</td>
                  {isAdmin && (
                    <td className="px-5 py-3">
                      <VisitRowActions row={r} spots={spotOptions} />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function LabeledInput({
  label,
  name,
  type = "text",
  placeholder,
  defaultValue,
}: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  defaultValue?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-foreground">{label}</label>
      <Input name={name} type={type} placeholder={placeholder} defaultValue={defaultValue} />
    </div>
  );
}
