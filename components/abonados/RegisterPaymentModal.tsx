"use client";

import { useState, useTransition } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toaster";
import { registerSubscriberPayment } from "@/actions/subscriber-actions";
import { formatCurrency } from "@/lib/format";
import { formatDateOnly } from "@/lib/datetime";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from "@/lib/constants";
import type { PaymentMethod } from "@/types/database";
import type { SubscriberRow } from "@/services/subscribers";

export function RegisterPaymentModal({
  subscriber,
  fullWidth,
}: {
  subscriber: SubscriberRow;
  fullWidth?: boolean;
}) {
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>("EFECTIVO");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ periodStart: string; periodEnd: string } | null>(null);

  const close = () => {
    setOpen(false);
    setResult(null);
    setError(null);
    setMethod("EFECTIVO");
  };

  const onConfirm = () => {
    setError(null);
    startTransition(async () => {
      const res = await registerSubscriberPayment({ subscriberId: subscriber.id, paymentMethod: method });
      if (res.error || !res.data) {
        setError(res.error ?? "No se pudo registrar el pago.");
        return;
      }
      showToast("Pago de abonado registrado.", "success");
      setResult({ periodStart: res.data.periodStart, periodEnd: res.data.periodEnd });
    });
  };

  return (
    <>
      <Button size="sm" fullWidth={fullWidth} onClick={() => setOpen(true)}>
        Registrar pago
      </Button>

      <Modal open={open} onClose={close} maxWidth="max-w-md">
        {!result && (
          <div className="p-6 sm:p-8">
            <p className="text-center text-sm font-bold uppercase tracking-[0.3em] text-muted">Pago de abonado</p>
            <h3 className="mt-1 text-center text-xl font-extrabold text-foreground">{subscriber.nombreCompleto}</h3>
            <p className="text-center text-sm text-muted">{subscriber.plate}</p>

            <div className="mt-4 rounded-2xl border-4 border-primary bg-primary p-6 text-center text-primary-foreground">
              <p className="text-sm font-bold uppercase tracking-[0.3em] opacity-90">Monto a pagar</p>
              <p className="mt-2 text-6xl font-black tabular-nums">{formatCurrency(subscriber.monto)}</p>
              <p className="mt-1 text-xs opacity-80">Monto fijo del plan — no editable</p>
            </div>

            <div className="mt-6">
              <p className="mb-2 text-sm font-semibold text-foreground">Método de pago</p>
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
                {pending ? "Procesando..." : "Confirmar pago"}
              </Button>
            </div>
          </div>
        )}

        {result && (
          <div className="flex flex-col items-center gap-4 p-8 text-center sm:p-10">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success-bg text-4xl text-success">
              ✓
            </div>
            <p className="text-lg font-semibold text-foreground">Pago registrado</p>
            <p className="text-5xl font-black tabular-nums text-success">{formatCurrency(subscriber.monto)}</p>
            <p className="text-sm font-medium text-muted">
              Vigente desde {formatDateOnly(result.periodStart)} hasta {formatDateOnly(result.periodEnd)}
            </p>
            <Button size="lg" fullWidth onClick={close}>
              Listo
            </Button>
          </div>
        )}
      </Modal>
    </>
  );
}
