"use client";

import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toaster";
import { deleteVehicleVisit } from "@/actions/history-actions";

export function DeleteVisitButton({ exitId }: { exitId: string }) {
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const confirmingRef = useRef(false);

  const onConfirm = () => {
    if (confirmingRef.current) return;
    confirmingRef.current = true;
    startTransition(async () => {
      try {
        const result = await deleteVehicleVisit({ exitId });
        if (result.error) {
          showToast(result.error, "danger");
          setOpen(false);
          return;
        }
        showToast("Registro eliminado correctamente.", "success");
        setOpen(false);
      } finally {
        confirmingRef.current = false;
      }
    });
  };

  return (
    <>
      <Button variant="danger" size="sm" onClick={() => setOpen(true)}>
        Eliminar
      </Button>

      <ConfirmDialog
        open={open}
        title="¿Estás seguro de eliminar este registro?"
        description="Esta acción quedará registrada en la auditoría."
        confirmLabel="Eliminar registro"
        danger
        pending={pending}
        onConfirm={onConfirm}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}
