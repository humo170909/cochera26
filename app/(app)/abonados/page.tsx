import type { Metadata } from "next";
import Link from "next/link";
import { requireAuth } from "@/lib/auth/dal";
import { getSubscribers } from "@/services/subscribers";
import { getSubscriberPlanSettings } from "@/services/tariffs";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { NewSubscriberModal } from "@/components/abonados/NewSubscriberModal";
import { SubscribersTable } from "@/components/abonados/SubscribersTable";
import { ExpiryAlertBanner } from "@/components/abonados/ExpiryAlertBanner";
import { formatCurrency } from "@/lib/format";

export const metadata: Metadata = { title: "Abonados" };

export default async function AbonadosPage() {
  const profile = await requireAuth();
  const planDefaults = await getSubscriberPlanSettings();
  const subscribers = await getSubscribers(planDefaults.diasAlertaVencimiento);
  const isAdmin = profile.rol === "ADMIN";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Abonados</h1>
          <p className="text-sm text-muted">
            {isAdmin
              ? `Por defecto: ${formatCurrency(planDefaults.precioMensual)} · hasta las ${planDefaults.horaLimite}.`
              : "Consulta el estado de los abonados y registra sus pagos."}
          </p>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <Link href="/abonados/pagos">
              <Button variant="secondary">Ver pagos</Button>
            </Link>
            <NewSubscriberModal defaults={planDefaults} />
          </div>
        )}
      </div>

      <ExpiryAlertBanner subscribers={subscribers} />

      <Card>
        <CardHeader title={`${subscribers.length} abonados`} />
        <SubscribersTable subscribers={subscribers} role={profile.rol} />
      </Card>
    </div>
  );
}
