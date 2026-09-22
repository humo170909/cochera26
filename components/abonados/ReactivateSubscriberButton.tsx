"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toaster";
import { reactivateSubscriber } from "@/actions/subscriber-actions";
import type { SubscriberRow } from "@/services/subscribers";

export function ReactivateSubscriberButton({
  subscriber,
  fullWidth,
}: {
  subscriber: SubscriberRow;
  fullWidth?: boolean;
}) {
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const onConfirm = () => {
    startTransition(async () => {
      const result = await reactivateSubscriber({ subscriberId: subscriber.id });
      if (result.error) {
        showToast(result.error, "danger");
        setOpen(false);
        return;
      }
      showToast("Abonado reactivado.", "success");
      setOpen(false);
    });
  };

  return (
    <>
      <Button size="sm" variant="success" fullWidth={fullWidth} onClick={() => setOpen(true)}>
        Reactivar
      </Button>

      <ConfirmDialog
        open={open}
        title="¿Reactivar abonado?"
        description={`${subscriber.nombreCompleto} (${subscriber.plate}) volverá a estado ACTIVO.`}
        confirmLabel="Reactivar"
        pending={pending}
        onConfirm={onConfirm}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}
