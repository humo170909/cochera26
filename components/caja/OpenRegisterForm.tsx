"use client";

import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Input";
import { Card, CardHeader } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toaster";
import { openCashRegister } from "@/actions/cash-actions";

export function OpenRegisterForm() {
  const { showToast } = useToast();
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Guardia síncrona contra doble clic/doble Enter (mismo patrón que
  // CashMovementModal): open_cash_register() ya rechaza una segunda
  // apertura por business_date UNIQUE, esto solo evita el toast de error
  // innecesario de un envío duplicado por accidente.
  const submittingRef = useRef(false);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    setError(null);
    startTransition(async () => {
      try {
        const result = await openCashRegister({ openingAmount: amount });
        if (result.error) {
          setError(result.error);
          return;
        }
        showToast("Caja aperturada correctamente.", "success");
      } finally {
        submittingRef.current = false;
      }
    });
  };

  return (
    <Card>
      <CardHeader title="Apertura de caja" subtitle="La caja del día aún no ha sido aperturada." />
      <form onSubmit={onSubmit} className="flex flex-col gap-4 p-5 sm:max-w-sm">
        <Field label="Monto inicial (S/)" htmlFor="openingAmount">
          <Input
            id="openingAmount"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="100.00"
            required
          />
        </Field>
        {error && (
          <div className="rounded-xl bg-danger-bg px-4 py-3 text-sm font-medium text-danger">{error}</div>
        )}
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Aperturando..." : "Aperturar caja"}
        </Button>
      </form>
    </Card>
  );
}
