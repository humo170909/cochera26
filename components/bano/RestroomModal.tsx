"use client";

import { useRef, useState, useTransition } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toaster";
import { registerRestroomUse } from "@/actions/restroom-actions";
import { formatCurrency } from "@/lib/format";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from "@/lib/constants";
import type { PaymentMethod } from "@/types/database";

export function RestroomModal({ price }: { price: number }) {
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>("EFECTIVO");
  const [observation, setObservation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const confirmingRef = useRef(false);

  const close = () => {
    setOpen(false);
    setObservation("");
    setError(null);
    confirmingRef.current = false;
  };

  const onConfirm = () => {
    if (confirmingRef.current) return;
    confirmingRef.current = true;
    startTransition(async () => {
      try {
        const result = await registerRestroomUse({ paymentMethod: method, observation: observation || null });
        if (result.error) {
          setError(result.error);
          return;
        }
        showToast(`Uso de baño registrado: ${formatCurrency(price)}`, "success");
        close();
      } finally {
        confirmingRef.current = false;
      }
    });
  };

  return (
    <>
      <Button size="xl" onClick={() => setOpen(true)} fullWidth className="sm:w-auto sm:px-14">
        Registrar uso
      </Button>

      <Modal open={open} onClose={close} maxWidth="max-w-sm">
        <div className="p-6 text-center">
          <p className="text-sm font-bold uppercase tracking-[0.3em] text-muted">Baño</p>
          <p className="mt-2 text-6xl font-black tabular-nums text-foreground">
            {formatCurrency(price)}
          </p>

          <div className="mt-6 grid grid-cols-2 gap-3">
            {PAYMENT_METHODS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMethod(m)}
                className={`h-12 rounded-xl border-2 text-sm font-bold transition-colors ${
                  method === m
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-surface text-foreground hover:bg-surface-2"
                }`}
              >
                {PAYMENT_METHOD_LABELS[m]}
              </button>
            ))}
          </div>

          <textarea
            value={observation}
            onChange={(e) => setObservation(e.target.value)}
            placeholder="Observación (opcional)"
            rows={2}
            className="mt-4 w-full resize-none rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
          />

          {error && (
            <div className="mt-3 rounded-xl bg-danger-bg px-4 py-3 text-sm font-medium text-danger">
              {error}
            </div>
          )}

          <div className="mt-5 flex gap-3">
            <Button variant="secondary" fullWidth onClick={close} disabled={pending}>
              Cancelar
            </Button>
            <Button variant="success" fullWidth onClick={onConfirm} disabled={pending}>
              {pending ? "Guardando..." : "Confirmar"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
