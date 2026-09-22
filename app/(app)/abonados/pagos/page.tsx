import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/dal";
import { getSubscriberPayments } from "@/services/subscribers";
import { getActiveWorkers } from "@/services/users";
import { Card, CardHeader } from "@/components/ui/Card";
import { Input, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { formatCurrency } from "@/lib/format";
import { formatDateOnly, formatDateTimeLima } from "@/lib/datetime";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from "@/lib/constants";
import type { PaymentMethod } from "@/types/database";

export const metadata: Metadata = { title: "Pagos de abonados" };

interface SearchParams {
  dateFrom?: string;
  dateTo?: string;
  plate?: string;
  workerId?: string;
  paymentMethod?: string;
}

export default async function PagosAbonadosPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireRole("ADMIN");
  const params = await searchParams;

  const [payments, workers] = await Promise.all([
    getSubscriberPayments({
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
      plate: params.plate,
      workerId: params.workerId,
      paymentMethod: params.paymentMethod as PaymentMethod | undefined,
    }),
    getActiveWorkers(),
  ]);

  const total = payments.reduce((sum, p) => sum + p.amount, 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-foreground">Pagos de abonados</h1>
        <p className="text-sm text-muted">{payments.length} pagos · Total {formatCurrency(total)}</p>
      </div>

      <Card>
        <CardHeader title="Filtros" />
        <form method="get" className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-3 lg:grid-cols-5">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-foreground">Desde</label>
            <Input type="date" name="dateFrom" defaultValue={params.dateFrom} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-foreground">Hasta</label>
            <Input type="date" name="dateTo" defaultValue={params.dateTo} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-foreground">Placa</label>
            <Input name="plate" placeholder="ABC-123" defaultValue={params.plate} />
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
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-foreground">Método</label>
            <Select name="paymentMethod" defaultValue={params.paymentMethod ?? ""}>
              <option value="">Todos</option>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_METHOD_LABELS[m]}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex items-end gap-2 sm:col-span-3 lg:col-span-5">
            <Button type="submit">Filtrar</Button>
            <a href="/abonados/pagos">
              <Button type="button" variant="secondary">Limpiar</Button>
            </a>
          </div>
        </form>
      </Card>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-5 py-3">Fecha</th>
                <th className="px-5 py-3">Cliente</th>
                <th className="px-5 py-3">Placa</th>
                <th className="px-5 py-3">Monto</th>
                <th className="px-5 py-3">Método</th>
                <th className="px-5 py-3">Período</th>
                <th className="px-5 py-3">Registrado por</th>
              </tr>
            </thead>
            <tbody>
              {payments.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-muted">
                    No hay pagos con los filtros seleccionados.
                  </td>
                </tr>
              )}
              {payments.map((p) => (
                <tr key={p.id} className="border-b border-border last:border-0">
                  <td className="px-5 py-3 text-foreground">{formatDateTimeLima(new Date(p.paidAt))}</td>
                  <td className="px-5 py-3 font-semibold text-foreground">{p.subscriberName}</td>
                  <td className="px-5 py-3 text-foreground">{p.plate}</td>
                  <td className="px-5 py-3 font-semibold text-foreground">{formatCurrency(p.amount)}</td>
                  <td className="px-5 py-3 text-foreground">{PAYMENT_METHOD_LABELS[p.paymentMethod]}</td>
                  <td className="px-5 py-3 text-foreground">
                    {formatDateOnly(p.periodStart)} – {formatDateOnly(p.periodEnd)}
                  </td>
                  <td className="px-5 py-3 text-muted">{p.registeredByName || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
