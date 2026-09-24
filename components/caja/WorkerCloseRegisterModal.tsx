"use client";

import { useRef, useState, useTransition } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toaster";
import { closeCashRegister } from "@/actions/cash-actions";
import { formatCurrency } from "@/lib/format";
import type { CashRegisterSummary } from "@/types/database";

/**
 * Cierre de caja para COLABORADOR/TRABAJADOR: un único resumen de solo
 * lectura por método de pago (nada editable, nada administrativo como
 * "saldo esperado"/"diferencia") y una sola confirmación final. El ADMIN
 * sigue usando CloseRegisterModal (con la conciliación manual de efectivo
 * contado) sin ningún cambio.
 *
 * Reutiliza tal cual closeCashRegister()/close_cash_register(): el monto
 * declarado que se envía es exactamente el efectivo esperado (mismos datos
 * ya calculados por get_cash_register_summary), así que no hay ningún
 * cálculo nuevo ni paralelo — el colaborador nunca escribe un importe a
 * mano, nunca ve ni edita efectivo/Yape/Plin/transferencia/diferencia.
 */
export function WorkerCloseRegisterModal({
  cashRegisterId,
  openingAmount,
  summary,
}: {
  cashRegisterId: string;
  openingAmount: number;
  summary: CashRegisterSummary;
}) {
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const confirmingRef = useRef(false);

  const efectivo = openingAmount + summary.efectivo;
  const totalDia = efectivo + summary.yape + summary.plin + summary.transferencia;

  const close = () => {
    setOpen(false);
    setError(null);
  };

  const onConfirm = () => {
    if (confirmingRef.current) return;
    confirmingRef.current = true;
    setError(null);
    startTransition(async () => {
      try {
        const result = await closeCashRegister({
          cashRegisterId,
          declaredAmount: efectivo,
          notes: null,
        });
        if (result.error) {
          setError(result.error);
          return;
        }
        showToast("Caja cerrada correctamente.", "success");
        close();
      } finally {
        confirmingRef.current = false;
      }
    });
  };

  return (
    <>
      <Button variant="danger" onClick={() => setOpen(true)}>
        Cerrar caja
      </Button>

      <Modal open={open} onClose={close} maxWidth="max-w-md">
        <div className="p-6">
          <h3 className="text-center text-lg font-bold uppercase tracking-wide text-foreground">
            Cierre de caja
          </h3>

          <dl className="mt-4 flex flex-col gap-3 rounded-xl bg-surface-2 p-4 text-sm">
            <Row label="EFECTIVO" value={efectivo} />
            <Row label="YAPE" value={summary.yape} />
            <Row label="PLIN" value={summary.plin} />
            <Row label="TRANSFERENCIA" value={summary.transferencia} />
            <div className="flex items-center justify-between border-t border-border pt-3">
              <dt className="text-sm font-bold text-foreground">TOTAL DEL DÍA</dt>
              <dd className="text-xl font-extrabold text-foreground">{formatCurrency(totalDia)}</dd>
            </div>
          </dl>

          <p className="mt-4 text-center text-sm font-semibold text-foreground">
            ¿Estás conforme con la caja del día?
          </p>

          {error && (
            <div className="mt-4 rounded-xl bg-danger-bg px-4 py-3 text-sm font-medium text-danger">{error}</div>
          )}

          <div className="mt-4 flex gap-3">
            <Button variant="secondary" fullWidth onClick={close} disabled={pending}>
              NO, REVISAR
            </Button>
            <Button variant="danger" fullWidth onClick={onConfirm} disabled={pending}>
              {pending ? "Cerrando..." : "Sí, cerrar caja"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-xs font-bold uppercase tracking-wide text-foreground">{label}</dt>
      <dd className="text-lg font-bold tabular-nums text-foreground">{formatCurrency(value)}</dd>
    </div>
  );
}
