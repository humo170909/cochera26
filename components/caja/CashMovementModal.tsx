"use client";

import { useRef, useState, useTransition } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toaster";
import { registerCashMovement } from "@/actions/cash-actions";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from "@/lib/constants";
import type { MovementType, PaymentMethod } from "@/types/database";

export function CashMovementModal({ cashRegisterId }: { cashRegisterId: string }) {
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<MovementType>("EGRESO");
  const [concept, setConcept] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("EFECTIVO");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const submittingRef = useRef(false);

  const close = () => {
    setOpen(false);
    setConcept("");
    setAmount("");
    setError(null);
    submittingRef.current = false;
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    setError(null);
    startTransition(async () => {
      try {
        const result = await registerCashMovement({
          cashRegisterId,
          type,
          concept,
          amount,
          paymentMethod: method,
        });
        if (result.error) {
          setError(result.error);
          return;
        }
        showToast("Movimiento registrado.", "success");
        close();
      } finally {
        submittingRef.current = false;
      }
    });
  };

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        + Movimiento manual
      </Button>

      <Modal open={open} onClose={close} maxWidth="max-w-md">
        <form onSubmit={onSubmit} className="p-6">
          <h3 className="text-lg font-bold text-foreground">Movimiento de caja</h3>

          <div className="mt-4 flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setType("INGRESO")}
                className={`h-11 rounded-xl border-2 text-sm font-bold ${type === "INGRESO" ? "border-success bg-success-bg text-success" : "border-border text-foreground"}`}
              >
                Ingreso
              </button>
              <button
                type="button"
                onClick={() => setType("EGRESO")}
                className={`h-11 rounded-xl border-2 text-sm font-bold ${type === "EGRESO" ? "border-danger bg-danger-bg text-danger" : "border-border text-foreground"}`}
              >
                Egreso
              </button>
            </div>

            <Field label="Concepto" htmlFor="concept">
              <Input
                id="concept"
                value={concept}
                onChange={(e) => setConcept(e.target.value)}
                placeholder="Ej: Compra de útiles de limpieza"
                required
              />
            </Field>

            <Field label="Monto (S/)" htmlFor="amount">
              <Input
                id="amount"
                type="number"
                inputMode="decimal"
                min="0.01"
                step="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </Field>

            <Field label="Método de pago" htmlFor="method">
              <Select id="method" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {PAYMENT_METHOD_LABELS[m]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {error && (
            <div className="mt-4 rounded-xl bg-danger-bg px-4 py-3 text-sm font-medium text-danger">
              {error}
            </div>
          )}

          <div className="mt-6 flex gap-3">
            <Button type="button" variant="secondary" fullWidth onClick={close} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" fullWidth disabled={pending}>
              {pending ? "Guardando..." : "Registrar"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
