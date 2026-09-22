import type { Metadata } from "next";
import { getRestroomPrice } from "@/services/tariffs";
import { getTodayRestroomUses } from "@/services/restroom";
import { RestroomModal } from "@/components/bano/RestroomModal";
import { Card, CardHeader } from "@/components/ui/Card";
import { formatCurrency } from "@/lib/format";
import { formatDateTimeLima } from "@/lib/datetime";
import { PAYMENT_METHOD_LABELS } from "@/lib/constants";

export const metadata: Metadata = { title: "Baño" };

export default async function BanoPage() {
  const [price, uses] = await Promise.all([getRestroomPrice(), getTodayRestroomUses()]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-foreground">Baño</h1>
        <p className="text-sm text-muted">Registra cada uso del baño como un ingreso independiente.</p>
      </div>

      <Card className="flex flex-col items-center justify-center gap-4 p-8">
        <RestroomModal price={price} />
      </Card>

      <Card>
        <CardHeader title="Últimos registros" />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-5 py-3">Fecha y hora</th>
                <th className="px-5 py-3">Monto</th>
                <th className="px-5 py-3">Método</th>
                <th className="px-5 py-3">Registrado por</th>
                <th className="px-5 py-3">Observación</th>
              </tr>
            </thead>
            <tbody>
              {uses.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-muted">
                    Aún no hay registros de baño.
                  </td>
                </tr>
              )}
              {uses.map((u) => (
                <tr key={u.id} className="border-b border-border last:border-0">
                  <td className="px-5 py-3 text-foreground">{formatDateTimeLima(new Date(u.usedAt))}</td>
                  <td className="px-5 py-3 font-semibold text-foreground">{formatCurrency(u.amount)}</td>
                  <td className="px-5 py-3 text-foreground">{PAYMENT_METHOD_LABELS[u.paymentMethod]}</td>
                  <td className="px-5 py-3 text-foreground">{u.registeredByName || "—"}</td>
                  <td className="px-5 py-3 text-muted">{u.observation || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
