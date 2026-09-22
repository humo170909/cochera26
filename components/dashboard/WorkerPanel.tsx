import Link from "next/link";
import { Icons } from "@/components/layout/Icons";
import { formatCurrency } from "@/lib/format";
import type { DashboardSnapshot } from "@/types/database";

interface BigActionProps {
  href: string;
  label: string;
  icon: keyof typeof Icons;
  tone: "success" | "danger" | "info" | "purple";
}

const TONE_CLASSES: Record<BigActionProps["tone"], string> = {
  success: "border-success/30 bg-success-bg text-success hover:bg-success/15",
  danger: "border-danger/30 bg-danger-bg text-danger hover:bg-danger/15",
  info: "border-info/30 bg-info-bg text-info hover:bg-info/15",
  purple: "border-purple/30 bg-purple-bg text-purple hover:bg-purple/15",
};

function BigAction({ href, label, icon, tone }: BigActionProps) {
  const Icon = Icons[icon];
  return (
    <Link
      href={href}
      className={`flex h-28 flex-col items-center justify-center gap-2 rounded-2xl border-2 text-lg font-extrabold uppercase tracking-wide transition-colors sm:h-32 sm:text-xl ${TONE_CLASSES[tone]}`}
    >
      <Icon width={28} height={28} />
      {label}
    </Link>
  );
}

/** Panel operativo del trabajador: pocos pasos, botones grandes, sin ruido administrativo. */
export function WorkerPanel({
  nombre,
  snapshot,
  restroomPrice,
}: {
  nombre: string;
  snapshot: DashboardSnapshot;
  restroomPrice: number;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Hola, {nombre}</h1>
        <p className="text-sm text-muted">
          {snapshot.ocupados} vehículos dentro · {snapshot.disponibles} espacios libres
        </p>
      </div>

      {!snapshot.caja_abierta && (
        <div className="flex flex-col items-start gap-3 rounded-2xl border border-warning/30 bg-warning-bg p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-semibold text-warning">
            La caja del día no está abierta. Ábrela antes de cobrar.
          </p>
          <Link
            href="/caja"
            className="rounded-xl bg-warning px-4 py-2 text-sm font-bold text-white"
          >
            Ir a Caja
          </Link>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <BigAction href="/ingreso" label="Registrar ingreso" icon="entry" tone="success" />
        <BigAction href="/salida" label="Registrar salida" icon="exit" tone="danger" />
        <BigAction href="/bano" label={`Baño ${formatCurrency(restroomPrice)}`} icon="restroom" tone="info" />
        <BigAction href="/estacionamientos" label="Estacionamientos" icon="parking" tone="info" />
        <BigAction href="/abonados" label="Abonados" icon="subscription" tone="purple" />
      </div>

      <Link
        href="/caja"
        className="flex items-center justify-between rounded-2xl border border-border bg-surface p-5"
      >
        <div>
          <p className="text-sm font-medium text-muted">Caja actual</p>
          <p className="text-2xl font-bold tabular-nums text-foreground">
            {formatCurrency(snapshot.caja_actual)}
          </p>
        </div>
        <Icons.cash className="text-muted" width={28} height={28} />
      </Link>
    </div>
  );
}
