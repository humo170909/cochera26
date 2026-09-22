import Link from "next/link";
import type { Metadata } from "next";
import { requireAuth } from "@/lib/auth/dal";
import { getDashboardSnapshot } from "@/services/dashboard";
import { getRestroomPrice } from "@/services/tariffs";
import { DashboardCard } from "@/components/dashboard/DashboardCard";
import { DashboardRealtimeRefresher } from "@/components/dashboard/DashboardRealtimeRefresher";
import { WorkerPanel } from "@/components/dashboard/WorkerPanel";
import { formatCurrency } from "@/lib/format";
import { Button } from "@/components/ui/Button";

export const metadata: Metadata = { title: "Dashboard" };

interface SearchParams {
  unauthorized?: string;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const profile = await requireAuth();
  const [snapshot, params, restroomPrice] = await Promise.all([
    getDashboardSnapshot(),
    searchParams,
    getRestroomPrice(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <DashboardRealtimeRefresher />

      {params.unauthorized === "1" && (
        <div className="rounded-2xl border border-danger/30 bg-danger-bg p-4 text-sm font-semibold text-danger">
          No tienes permisos para acceder a esa sección.
        </div>
      )}

      {profile.rol === "TRABAJADOR" ? (
        <WorkerPanel nombre={profile.nombre} snapshot={snapshot} restroomPrice={restroomPrice} />
      ) : (
        <AdminDashboard nombre={profile.nombre} snapshot={snapshot} />
      )}
    </div>
  );
}

function AdminDashboard({
  nombre,
  snapshot,
}: {
  nombre: string;
  snapshot: Awaited<ReturnType<typeof getDashboardSnapshot>>;
}) {
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-foreground">Hola, {nombre}</h1>
        <p className="text-sm text-muted">
          Resumen del día — cochera con {snapshot.total_espacios} estacionamientos.
        </p>
      </div>

      {!snapshot.caja_abierta && (
        <div className="flex flex-col items-start gap-3 rounded-2xl border border-warning/30 bg-warning-bg p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-semibold text-warning">
            La caja del día aún no ha sido aperturada. No podrás registrar cobros hasta abrirla.
          </p>
          <Link href="/caja">
            <Button size="sm" variant="secondary">Ir a Caja</Button>
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <DashboardCard label="Estacionamientos" value={String(snapshot.total_espacios)} icon="parking" tone="neutral" />
        <DashboardCard label="Disponibles" value={String(snapshot.disponibles)} icon="entry" tone="success" />
        <DashboardCard label="Ocupados" value={String(snapshot.ocupados)} icon="exit" tone="danger" />
        <DashboardCard label="Autorizados" value={String(snapshot.autorizados_ocupados)} icon="key" tone="purple" />
        <DashboardCard label="Vehículos del día" value={String(snapshot.vehiculos_dia)} icon="history" tone="info" />
        <DashboardCard label="Ingresos del día" value={formatCurrency(snapshot.ingresos_dia)} icon="cash" tone="success" />
        <DashboardCard label="Egresos del día" value={formatCurrency(snapshot.egresos_dia)} icon="report" tone="warning" />
        <DashboardCard label="Caja actual" value={formatCurrency(snapshot.caja_actual)} icon="cash" tone="neutral" />
        <DashboardCard label="Baños del día" value={String(snapshot.banos_dia)} icon="restroom" tone="info" />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <QuickAction href="/ingreso" label="Registrar ingreso" />
        <QuickAction href="/salida" label="Registrar salida" />
        <QuickAction href="/bano" label="Registrar baño" />
        <QuickAction href="/estacionamientos" label="Ver mapa" />
      </div>
    </>
  );
}

function QuickAction({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href}>
      <Button variant="secondary" fullWidth size="lg">
        {label}
      </Button>
    </Link>
  );
}
