"use client";

import { formatDateOnly } from "@/lib/datetime";
import type { PlateStatusResult } from "@/types/domain";

const SUBSCRIBER_STATUS_CLASSES: Record<string, string> = {
  ACTIVO: "border-success/30 bg-success-bg text-success",
  VENCIDO: "border-danger/30 bg-danger-bg text-danger",
  SUSPENDIDO: "border-warning/30 bg-warning-bg text-warning",
  CANCELADO: "border-border bg-surface-2 text-muted",
};

const SUBSCRIBER_STATUS_LABELS: Record<string, string> = {
  ACTIVO: "🟢 ABONADO ACTIVO",
  VENCIDO: "🔴 ABONADO VENCIDO",
  SUSPENDIDO: "🟠 ABONADO SUSPENDIDO",
  CANCELADO: "⚪ ABONADO CANCELADO",
};

/**
 * Tarjeta "TIPO DE CLIENTE". El estado viene 100% de la respuesta real de
 * Supabase (usePlateStatusLookup) — nunca de un valor por defecto ni de un
 * checkbox editable a mano. Prioridad ya resuelta por el servidor:
 * AUTORIZADO > ABONADO > cliente normal.
 */
export function ClientTypeCard({
  plateEntered,
  loading,
  result,
}: {
  plateEntered: boolean;
  loading: boolean;
  result: PlateStatusResult | null;
}) {
  if (!plateEntered) return null;

  if (loading || !result) {
    return (
      <div className="rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm text-muted">
        Verificando placa...
      </div>
    );
  }

  if (result.kind === null) {
    return (
      <div className="rounded-xl border border-info/30 bg-info-bg px-4 py-3">
        <p className="text-sm font-extrabold text-info">🔵 CLIENTE NORMAL</p>
      </div>
    );
  }

  if (result.kind === "AUTORIZADO") {
    return (
      <div className="rounded-xl border border-purple/30 bg-purple-bg px-4 py-3">
        <p className="text-sm font-extrabold text-purple">🟣 VEHÍCULO AUTORIZADO</p>
        {result.nombre && <p className="mt-0.5 text-sm text-purple">Propietario: {result.nombre}</p>}
        <p className="mt-0.5 text-xs text-purple opacity-80">No se cobrará esta visita.</p>
      </div>
    );
  }

  // ABONADO
  const status = result.displayStatus ?? "ACTIVO";
  return (
    <div className={`rounded-xl border px-4 py-3 ${SUBSCRIBER_STATUS_CLASSES[status]}`}>
      <p className="text-sm font-extrabold">{SUBSCRIBER_STATUS_LABELS[status]}</p>
      {result.nombre && (
        <p className="mt-0.5 text-sm">
          {result.nombre}
          {result.fechaVencimiento && <> · vence {formatDateOnly(result.fechaVencimiento)}</>}
        </p>
      )}
      {status !== "ACTIVO" && (
        <p className="mt-0.5 text-xs opacity-80">No se aplicará el beneficio de abono a este ingreso.</p>
      )}
    </div>
  );
}
