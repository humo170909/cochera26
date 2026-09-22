import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/dal";
import {
  getTariffs,
  getRestroomPrice,
  getToleranceSettings,
  getFlatRateSettings,
  getFlatRateCapacity,
  getSubscriberPlanSettings,
} from "@/services/tariffs";
import { Card, CardHeader } from "@/components/ui/Card";
import { TariffEditor } from "@/components/tarifas/TariffEditor";
import { RestroomPriceEditor } from "@/components/tarifas/RestroomPriceEditor";
import { ToleranceEditor } from "@/components/tarifas/ToleranceEditor";
import { FlatRateEditor } from "@/components/tarifas/FlatRateEditor";
import { SubscriberPlanEditor } from "@/components/tarifas/SubscriberPlanEditor";

export const metadata: Metadata = { title: "Tarifas" };

export default async function TarifasPage() {
  await requireRole("ADMIN");
  const [tariffs, restroomPrice, tolerance, flatRate, flatRateCapacity, subscriberPlan] = await Promise.all([
    getTariffs(),
    getRestroomPrice(),
    getToleranceSettings(),
    getFlatRateSettings(),
    getFlatRateCapacity(),
    getSubscriberPlanSettings(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-foreground">Configuración de tarifas</h1>
        <p className="text-sm text-muted">
          Solo administradores. Todos los cambios quedan auditados y no afectan cobros ya realizados.
        </p>
      </div>

      <Card>
        <CardHeader
          title="Tarifa por hora"
          subtitle="Precio por tipo de vehículo, fracción hacia arriba con tolerancia"
        />
        <div>
          {tariffs.map((t) => (
            <TariffEditor key={t.id} vehicleType={t.vehicleType} initialPrice={t.pricePerHour} />
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader title="Tolerancia" subtitle="Aplica a la tarifa por hora, para todos los tipos de vehículo" />
        <ToleranceEditor initial={tolerance} />
      </Card>

      <Card>
        <CardHeader title="Abonados" subtitle="Valores por defecto para nuevos abonados" />
        <SubscriberPlanEditor initial={subscriberPlan} />
      </Card>

      <Card>
        <CardHeader title="Tarifa plana" subtitle="Monto fijo si la salida ocurre antes de la hora límite" />
        <FlatRateEditor initial={flatRate} capacity={flatRateCapacity} />
      </Card>

      <Card>
        <CardHeader title="Baño" />
        <RestroomPriceEditor initialPrice={restroomPrice} />
      </Card>
    </div>
  );
}
