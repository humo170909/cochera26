import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/dal";
import { getReportData } from "@/services/reports";
import { businessDateLima } from "@/lib/datetime";
import { Card, CardHeader } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { formatCurrency } from "@/lib/format";
import { VEHICLE_TYPE_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/constants";

export const metadata: Metadata = { title: "Reportes" };

interface SearchParams {
  dateFrom?: string;
  dateTo?: string;
}

function firstDayOfMonthLima(): string {
  const today = businessDateLima();
  return `${today.slice(0, 7)}-01`;
}

export default async function ReportesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireRole("ADMIN");
  const params = await searchParams;
  const dateFrom = params.dateFrom || firstDayOfMonthLima();
  const dateTo = params.dateTo || businessDateLima();

  const report = await getReportData({ dateFrom, dateTo });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Reportes</h1>
          <p className="text-sm text-muted">Del {dateFrom} al {dateTo}</p>
        </div>
        <Button variant="secondary" disabled title="Próximamente">
          Exportar (próximamente)
        </Button>
      </div>

      <Card>
        <form method="get" className="flex flex-wrap items-end gap-4 p-5">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-foreground">Desde</label>
            <Input type="date" name="dateFrom" defaultValue={dateFrom} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-foreground">Hasta</label>
            <Input type="date" name="dateTo" defaultValue={dateTo} />
          </div>
          <Button type="submit">Generar</Button>
        </form>
      </Card>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Metric label="Vehículos atendidos" value={String(report.totalVehiculos)} />
        <Metric label="Ingresos por vehículos" value={formatCurrency(report.totalIngresosVehiculos)} />
        <Metric label="Usos de baño" value={String(report.totalBanos)} />
        <Metric label="Ingresos totales" value={formatCurrency(report.totalIngresos)} tone="success" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Por tipo de vehículo" />
          <SimpleTable
            rows={report.porTipoVehiculo.map((r) => [
              VEHICLE_TYPE_LABELS[r.tipo],
              String(r.cantidad),
              formatCurrency(r.monto),
            ])}
            headers={["Tipo", "Cantidad", "Monto"]}
          />
        </Card>

        <Card>
          <CardHeader title="Por método de pago" />
          <SimpleTable
            rows={report.porMetodoPago.map((r) => [
              PAYMENT_METHOD_LABELS[r.metodo],
              String(r.cantidad),
              formatCurrency(r.monto),
            ])}
            headers={["Método", "Cantidad", "Monto"]}
          />
        </Card>

        <Card>
          <CardHeader title="Ingresos por día" />
          <SimpleTable
            rows={report.porDia.map((r) => [r.fecha, String(r.vehiculos), formatCurrency(r.monto)])}
            headers={["Fecha", "Vehículos", "Monto"]}
          />
        </Card>

        <Card>
          <CardHeader title="Por trabajador" />
          <SimpleTable
            rows={report.porTrabajador.map((r) => [r.trabajador, String(r.vehiculos), formatCurrency(r.monto)])}
            headers={["Trabajador", "Vehículos", "Monto"]}
          />
        </Card>
      </div>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "success" }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <p className="text-sm font-medium text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${tone === "success" ? "text-success" : "text-foreground"}`}>
        {value}
      </p>
    </div>
  );
}

function SimpleTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
            {headers.map((h) => (
              <th key={h} className="px-5 py-3">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={headers.length} className="px-5 py-8 text-center text-muted">
                Sin datos en el período.
              </td>
            </tr>
          )}
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-border last:border-0">
              {row.map((cell, j) => (
                <td key={j} className={`px-5 py-3 ${j === 0 ? "font-semibold text-foreground" : "text-foreground"}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
