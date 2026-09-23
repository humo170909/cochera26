"use client";

import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toaster";
import { reopenCashRegister } from "@/actions/cash-actions";

/** Solo se renderiza para ADMIN (ver app/(app)/caja/page.tsx) — el
 * colaborador nunca ve este botón. La restricción real igual vive en el
 * backend (admin_reopen_cash_register exige is_admin()), así que aunque
 * alguien manipulara la interfaz no podría ejecutar la reapertura. */
export function ReopenRegisterButton({ cashRegisterId }: { cashRegisterId: string }) {
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const confirmingRef = useRef(false);

  const onConfirm = () => {
    if (confirmingRef.current) return;
    confirmingRef.current = true;
    startTransition(async () => {
      try {
        const result = await reopenCashRegister({ cashRegisterId });
        if (result.error) {
          showToast(result.error, "danger");
          setOpen(false);
          return;
        }
        showToast("Caja reabierta correctamente.", "success");
        setOpen(false);
      } finally {
        confirmingRef.current = false;
      }
    });
  };

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Reabrir caja del día
      </Button>

      <ConfirmDialog
        open={open}
        title="¿Reabrir la caja de hoy?"
        description="La caja de hoy ya fue cerrada. ¿Deseas reabrirla para continuar trabajando?"
        confirmLabel="Reabrir caja"
        pending={pending}
        onConfirm={onConfirm}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}
