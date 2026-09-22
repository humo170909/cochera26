"use client";

import { useState, useTransition } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useElapsedTime } from "@/hooks/useElapsedTime";
import { calculateHourlyFee } from "@/lib/tariffs";
import { formatCurrency } from "@/lib/format";
import { formatShortTimeLima } from "@/lib/datetime";
import { registerVehicleExit } from "@/actions/vehicle-actions";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS, VEHICLE_TYPE_LABELS } from "@/lib/constants";
import type { PaymentMethod, TariffType, VehicleType } from "@/types/database";
import type { FlatRateSettings, ToleranceSettings } from "@/types/domain";

export interface ExitTarget {
  entryId: string;
  plate: string;
  spotCode: string;
  entryAt: string;
  pricePerHour: number;
  vehicleType: VehicleType;
  coveredBySubscription: boolean;
  subscriberName: string | null;
  flatRateReserved: boolean;
  flatRatePriceSnapshot: number | null;
  isAuthorized: boolean;
  authorizedOwnerName: string | null;
}

export function PaymentModal({
  target,
  tolerance,
  flatRate,
  onClose,
}: {
  target: ExitTarget | null;
  tolerance: ToleranceSettings;
  flatRate: FlatRateSettings;
  onClose: () => void;
}) {
  const [method, setMethod] = useState<PaymentMethod>("EFECTIVO");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{
    amount: number;
    method: PaymentMethod | null;
    tariffType: TariffType;
  } | null>(null);

  const elapsed = useElapsedTime(target?.entryAt ?? new Date().toISOString());

  const hourlyFee = target
    ? calculateHourlyFee(target.pricePerHour, elapsed.elapsedMinutes, tolerance)
    : null;

  // La tarifa plana, una vez reservada al ingreso, queda fija para toda la
  // visita: no se vuelve a evaluar elegibilidad ni se recalcula nada al
  // salir. Se usa la fotografía del precio tomada al ingreso, nunca el
  // precio configurado actualmente (que pudo haber cambiado mientras tanto).
  const isAuthorized = !!target?.isAuthorized;
  const isSubscription = !isAuthorized && !!target?.coveredBySubscription;
  const noCharge = isAuthorized || isSubscription;
  const willUseFlatRate = !noCharge && !!target?.flatRateReserved;
  const flatRateAmount = target?.flatRatePriceSnapshot ?? flatRate.precio;
  const total = noCharge ? 0 : willUseFlatRate ? flatRateAmount : (hourlyFee?.amount ?? 0);

  const close = () => {
    setError(null);
    setResult(null);
    setMethod("EFECTIVO");
    onClose();
  };

  const onConfirm = () => {
    if (!target) return;
    setError(null);
    startTransition(async () => {
      const res = await registerVehicleExit({
        entryId: target.entryId,
        paymentMethod: noCharge ? null : method,
        tariffType: "HORA",
      });
      if (res.error || !res.data) {
        setError(res.error ?? "No se pudo procesar el pago.");
        return;
      }
      setResult({ amount: res.data.amount, method: res.data.paymentMethod, tariffType: res.data.tariffType });
    });
  };

  return (
    <Modal open={!!target} onClose={close} maxWidth="max-w-lg">
      {target && !result && (
        <div className="p-6 sm:p-8">
          <p className="text-center text-sm font-bold uppercase tracking-[0.3em] text-muted">Cobro</p>
          <h3 className="mt-1 text-center text-2xl font-extrabold text-foreground">
            {target.plate}
            <span className="ml-2 font-normal text-muted">· {target.spotCode}</span>
          </h3>

          <div className="mt-4 grid grid-cols-2 gap-3 text-center text-sm">
            <InfoBox label="Tipo" value={VEHICLE_TYPE_LABELS[target.vehicleType]} />
            <InfoBox label="Ingreso" value={formatShortTimeLima(target.entryAt)} />
          </div>

          <div className="mt-3 rounded-2xl bg-surface-2 p-4 text-center">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Tiempo</p>
            <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-foreground">
              {elapsed.elapsedLabel}
            </p>
          </div>

          {isAuthorized ? (
            <div className="mt-4 rounded-2xl border border-purple/30 bg-purple-bg p-4 text-center">
              <p className="font-bold text-purple">
                🟣 VEHÍCULO AUTORIZADO{target.authorizedOwnerName ? ` · ${target.authorizedOwnerName}` : ""}
              </p>
              <p className="mt-1 text-sm text-purple">Esta salida no genera cobro ni movimiento de caja.</p>
            </div>
          ) : isSubscription ? (
            <div className="mt-4 rounded-2xl border border-info/30 bg-info-bg p-4 text-center">
              <p className="font-bold text-info">ABONADO ACTIVO{target.subscriberName ? ` · ${target.subscriberName}` : ""}</p>
              <p className="mt-1 text-sm text-info">Esta salida no requiere cobro.</p>
            </div>
          ) : willUseFlatRate ? (
            <p className="mt-3 text-center text-xs font-semibold text-muted">
              Tarifa plana reservada al ingreso — {formatCurrency(flatRateAmount)}
            </p>
          ) : (
            hourlyFee && (
              <p className="mt-2 text-center text-xs text-muted">
                {formatCurrency(target.pricePerHour)}/hora · tolerancia {hourlyFee.toleranceApplied} min ·{" "}
                {hourlyFee.billedHours} {hourlyFee.billedHours === 1 ? "hora facturada" : "horas facturadas"}
              </p>
            )
          )}

          <div className="mt-4 rounded-2xl border-4 border-primary bg-primary p-6 text-center text-primary-foreground">
            <p className="text-sm font-bold uppercase tracking-[0.3em] opacity-90">Total a pagar</p>
            <p className="mt-2 text-5xl font-black tabular-nums break-all sm:text-6xl md:text-7xl">
              {formatCurrency(total)}
            </p>
          </div>

          {!noCharge && (
            <div className="mt-6">
              <p className="mb-2 text-sm font-semibold text-foreground">Forma de pago</p>
              <div className="grid grid-cols-2 gap-3">
                {PAYMENT_METHODS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMethod(m)}
                    className={`h-14 rounded-xl border-2 text-base font-bold transition-colors ${
                      method === m
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-surface text-foreground hover:bg-surface-2"
                    }`}
                  >
                    {PAYMENT_METHOD_LABELS[m]}
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="mt-4 rounded-xl bg-danger-bg px-4 py-3 text-center text-sm font-medium text-danger">
              {error}
            </div>
          )}

          <div className="mt-6 flex gap-3">
            <Button variant="secondary" size="xl" fullWidth onClick={close} disabled={pending}>
              Cancelar
            </Button>
            <Button variant="success" size="xl" fullWidth onClick={onConfirm} disabled={pending}>
              {pending ? "Procesando..." : noCharge ? "Confirmar salida" : "Confirmar cobro"}
            </Button>
          </div>
        </div>
      )}

      {result && (
        <div className="flex flex-col items-center gap-4 p-8 text-center sm:p-10">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success-bg text-4xl text-success">
            ✓
          </div>
          <p className="text-lg font-semibold text-foreground">
            {result.tariffType === "ABONADO" || result.tariffType === "AUTORIZADO"
              ? "Salida registrada"
              : "Cobro registrado"}
          </p>
          <p className="text-5xl font-black tabular-nums text-success">{formatCurrency(result.amount)}</p>
          <p className="text-sm font-medium text-muted">
            {result.method
              ? PAYMENT_METHOD_LABELS[result.method]
              : result.tariffType === "AUTORIZADO"
                ? "Vehículo autorizado"
                : "Cubierto por abono"}{" "}
            · Estacionamiento liberado
          </p>
          <Button size="lg" fullWidth onClick={close}>
            Listo
          </Button>
        </div>
      )}
    </Modal>
  );
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="text-sm font-bold text-foreground">{value}</p>
    </div>
  );
}
