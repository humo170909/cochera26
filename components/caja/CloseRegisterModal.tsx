"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toaster";
import { closeCashRegister } from "@/actions/cash-actions";
import { formatCurrency } from "@/lib/format";

export function CloseRegisterModal({
  cashRegisterId,
  openingAmount,
  cashNet,
}: {
  cashRegisterId: string;
  openingAmount: number;
  cashNet: number;
}) {
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [declared, setDeclared] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Guardia síncrona contra doble clic/doble Enter (mismo patrón que
  // CashMovementModal): close_cash_register() ya rechaza un segundo cierre
  // (status <> 'ABIERTA'), esto solo evita el toast de error innecesario.
  const submittingRef = useRef(false);

  const expected = openingAmount + cashNet;
  const declaredNumber = Number(declared || 0);
  const difference = useMemo(() => Math.round((declaredNumber - expected) * 100) / 100, [declaredNumber, expected]);

  const close = () => {
    setOpen(false);
    setDeclared("");
    setNotes("");
    setError(null);
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    setError(null);
    startTransition(async () => {
      try {
        const result = await closeCashRegister({ cashRegisterId, declaredAmount: declared, notes: notes || null });
        if (result.error) {
          setError(result.error);
          return;
        }
        showToast("Caja cerrada correctamente.", "success");
        close();
      } finally {
        submittingRef.current = false;
      }
    });
  };

  return (
    <>
      <Button variant="danger" onClick={() => setOpen(true)}>
        Cerrar caja
      </Button>

      <Modal open={open} onClose={close} maxWidth="max-w-md">
        <form onSubmit={onSubmit} className="p-6">
          <h3 className="text-lg font-bold text-foreground">Cierre de caja</h3>
          <p className="mt-1 text-sm text-muted">Solo se concilia el efectivo físico.</p>

          <dl className="mt-4 flex flex-col gap-2 rounded-xl bg-surface-2 p-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">Caja inicial</dt>
              <dd className="font-semibold text-foreground">{formatCurrency(openingAmount)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Movimientos en efectivo</dt>
              <dd className="font-semibold text-foreground">{formatCurrency(cashNet)}</dd>
            </div>
            <div className="flex justify-between border-t border-border pt-2">
              <dt className="font-semibold text-foreground">Saldo esperado</dt>
              <dd className="font-bold text-foreground">{formatCurrency(expected)}</dd>
            </div>
          </dl>

          <div className="mt-4">
            <Field label="Efectivo real contado (S/)" htmlFor="declared">
              <Input
                id="declared"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={declared}
                onChange={(e) => setDeclared(e.target.value)}
                required
                autoFocus
              />
            </Field>
          </div>

          {declared !== "" && (
            <div
              className={`mt-3 rounded-xl px-4 py-3 text-center text-sm font-bold ${
                difference === 0
                  ? "bg-success-bg text-success"
                  : difference > 0
                    ? "bg-info-bg text-info"
                    : "bg-danger-bg text-danger"
              }`}
            >
              Diferencia: {difference >= 0 ? "+" : ""}
              {formatCurrency(difference)}
            </div>
          )}

          <div className="mt-4">
            <Field label="Notas (opcional)" htmlFor="notes">
              <Input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
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
            <Button type="submit" variant="danger" fullWidth disabled={pending}>
              {pending ? "Cerrando..." : "Confirmar cierre"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
