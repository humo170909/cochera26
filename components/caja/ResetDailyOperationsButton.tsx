"use client";

import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toaster";
import { resetDailyCashOperations } from "@/actions/cash-actions";

/** Solo se renderiza para ADMIN (ver app/(app)/caja/page.tsx) — el
 * colaborador nunca ve este botón. La restricción real vive en el backend
 * (admin_reset_daily_cash_operations exige is_admin()), así que aunque
 * alguien manipulara la interfaz no podría ejecutar el reinicio. */
export function ResetDailyOperationsButton() {
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const confirmingRef = useRef(false);

  const onConfirm = () => {
    if (confirmingRef.current) return;
    confirmingRef.current = true;
    startTransition(async () => {
      try {
        const result = await resetDailyCashOperations();
        if (result.error) {
          showToast(result.error, "danger");
          setOpen(false);
          return;
        }
        showToast("Caja del día reiniciada. Todo listo para comenzar desde cero.", "success");
        setOpen(false);
      } finally {
        confirmingRef.current = false;
      }
    });
  };

  return (
    <>
      <Button variant="danger" onClick={() => setOpen(true)}>
        Reiniciar caja del día
      </Button>

      <ConfirmDialog
        open={open}
        title="¿Reiniciar la caja de hoy?"
        description="Esta acción eliminará los registros operativos y movimientos de prueba de la caja de hoy y dejará la caja lista para comenzar desde cero. ¿Deseas continuar?"
        confirmLabel="Reiniciar caja"
        pending={pending}
        onConfirm={onConfirm}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}
