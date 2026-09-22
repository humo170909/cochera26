import type { Metadata } from "next";
import { getTodayCashRegister, getCashRegisterSummary, getCashMovements } from "@/services/cash";
import { OpenRegisterForm } from "@/components/caja/OpenRegisterForm";
import { CashSummaryGrid } from "@/components/caja/CashSummaryGrid";
import { CashMovementModal } from "@/components/caja/CashMovementModal";
import { CloseRegisterModal } from "@/components/caja/CloseRegisterModal";
import { DashboardRealtimeRefresher } from "@/components/dashboard/DashboardRealtimeRefresher";
import { Card, CardHeader, Badge } from "@/components/ui/Card";
import { formatCurrency } from "@/lib/format";
import { formatDateTimeLima, formatShortTimeLima } from "@/lib/datetime";
import { PAYMENT_METHOD_LABELS, MOVEMENT_TYPE_LABELS } from "@/lib/constants";

export const metadata: Metadata = { title: "Caja" };

export default async function CajaPage() {
  const register = await getTodayCashRegister();

  return (
    <div className="flex flex-col gap-6">
      <DashboardRealtimeRefresher />
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-foreground">Caja del día</h1>
        <p className="text-sm text-muted">{formatDateTimeLima()}</p>
      </div>

      {!register && <OpenRegisterForm />}

      {register && <RegisterDetails cashRegisterId={register.id} register={register} />}
    </div>
  );
}

async function RegisterDetails({
  cashRegisterId,
  register,
}: {
  cashRegisterId: string;
  register: Awaited<ReturnType<typeof getTodayCashRegister>>;
}) {
  if (!register) return null;
  const [summary, movements] = await Promise.all([
    getCashRegisterSummary(cashRegisterId),
    getCashMovements(cashRegisterId),
  ]);

  return (
    <>
      <Card>
        <CardHeader
          title="Resumen de caja"
          subtitle={`Aperturada por ${register.openedByName || "—"} a las ${formatShortTimeLima(register.openedAt)} · Inicial ${formatCurrency(register.openingAmount)}`}
          action={
            register.status === "ABIERTA" ? (
              <Badge tone="success">Abierta</Badge>
            ) : (
              <Badge tone="neutral">Cerrada</Badge>
            )
          }
        />
        <div className="p-5">
          <CashSummaryGrid summary={summary} />
        </div>
      </Card>

      {register.status === "ABIERTA" && (
        <div className="flex flex-wrap gap-3">
          <CashMovementModal cashRegisterId={cashRegisterId} />
          <CloseRegisterModal
            cashRegisterId={cashRegisterId}
            openingAmount={register.openingAmount}
            cashNet={summary.efectivo}
          />
        </div>
      )}

      {register.status === "CERRADA" && (
        <Card>
          <CardHeader title="Cierre registrado" />
          <dl className="grid grid-cols-2 gap-4 p-5 text-sm sm:grid-cols-4">
            <Item label="Saldo esperado" value={formatCurrency(register.expectedAmount ?? 0)} />
            <Item label="Efectivo declarado" value={formatCurrency(register.declaredAmount ?? 0)} />
            <Item
              label="Diferencia"
              value={formatCurrency(register.difference ?? 0)}
              tone={
                !register.difference
                  ? "neutral"
                  : register.difference > 0
                    ? "info"
                    : "danger"
              }
            />
            <Item label="Cerrada por" value={register.closedByName || "—"} />
          </dl>
        </Card>
      )}

      <Card>
        <CardHeader title="Movimientos" subtitle={`${movements.length} registrados`} />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-5 py-3">Hora</th>
                <th className="px-5 py-3">Tipo</th>
                <th className="px-5 py-3">Concepto</th>
                <th className="px-5 py-3">Método</th>
                <th className="px-5 py-3">Monto</th>
                <th className="px-5 py-3">Usuario</th>
              </tr>
            </thead>
            <tbody>
              {movements.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-muted">
                    Sin movimientos todavía.
                  </td>
                </tr>
              )}
              {movements.map((m) => (
                <tr key={m.id} className="border-b border-border last:border-0">
                  <td className="px-5 py-3 text-foreground">{formatShortTimeLima(m.occurredAt)}</td>
                  <td className="px-5 py-3">
                    <Badge tone={m.type === "INGRESO" ? "success" : "danger"}>
                      {MOVEMENT_TYPE_LABELS[m.type]}
                    </Badge>
                  </td>
                  <td className="px-5 py-3 text-foreground">{m.concept}</td>
                  <td className="px-5 py-3 text-foreground">{PAYMENT_METHOD_LABELS[m.paymentMethod]}</td>
                  <td className="px-5 py-3 font-semibold text-foreground">{formatCurrency(m.amount)}</td>
                  <td className="px-5 py-3 text-muted">{m.registeredByName || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

function Item({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "info" | "danger";
}) {
  const toneClass = tone === "info" ? "text-info" : tone === "danger" ? "text-danger" : "text-foreground";
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</dt>
      <dd className={`mt-1 text-lg font-bold ${toneClass}`}>{value}</dd>
    </div>
  );
}
