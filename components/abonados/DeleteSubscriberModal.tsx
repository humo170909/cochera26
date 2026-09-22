"use client";

import { useState, useTransition } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toaster";
import { deleteSubscriber } from "@/actions/subscriber-actions";
import { formatCurrency } from "@/lib/format";
import { formatDateOnly } from "@/lib/datetime";
import { VEHICLE_TYPE_LABELS } from "@/lib/constants";
import type { SubscriberRow } from "@/services/subscribers";

type Step = "details" | "confirm";

export function DeleteSubscriberModal({
  subscriber,
  fullWidth,
}: {
  subscriber: SubscriberRow;
  fullWidth?: boolean;
}) {
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("details");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const close = () => {
    setOpen(false);
    setStep("details");
    setError(null);
  };

  const onConfirm = () => {
    setError(null);
    startTransition(async () => {
      const result = await deleteSubscriber({ subscriberId: subscriber.id });
      if (result.error) {
        setError(result.error);
        setStep("details");
        return;
      }
      showToast("Abonado eliminado.", "success");
      close();
    });
  };

  return (
    <>
      <Button size="sm" variant="danger" fullWidth={fullWidth} onClick={() => setOpen(true)}>
        🗑 Eliminar
      </Button>

      <Modal open={open} onClose={close} maxWidth="max-w-md">
        <div className="p-6">
          {step === "details" && (
            <>
              <h3 className="text-lg font-bold text-foreground">¿Eliminar abonado?</h3>

              <dl className="mt-4 flex flex-col gap-2 rounded-xl bg-surface-2 p-4 text-sm">
                <Row label="Cliente" value={subscriber.nombreCompleto} />
                <Row label="Placa" value={subscriber.plate} />
                <Row label="Vehículo" value={VEHICLE_TYPE_LABELS[subscriber.vehicleType]} />
                <Row label="Monto" value={formatCurrency(subscriber.monto)} />
                <Row label="Vencimiento" value={formatDateOnly(subscriber.fechaVencimiento)} />
              </dl>

              {subscriber.hasActiveVehicle ? (
                <div className="mt-4 rounded-xl bg-danger-bg px-4 py-3 text-sm font-semibold text-danger">
                  Este abonado tiene un vehículo actualmente dentro de la cochera. Registra su salida antes
                  de eliminarlo.
                </div>
              ) : (
                <div className="mt-4 rounded-xl bg-warning-bg px-4 py-3 text-sm font-semibold text-warning">
                  ⚠️ ADVERTENCIA: esta acción desactivará al abonado. Sus pagos, caja e historial se
                  conservan, pero dejará de considerarse abonado activo.
                </div>
              )}

              {error && (
                <div className="mt-4 rounded-xl bg-danger-bg px-4 py-3 text-sm font-medium text-danger">
                  {error}
                </div>
              )}

              <div className="mt-6 flex gap-3">
                <Button variant="secondary" fullWidth onClick={close}>
                  Cancelar
                </Button>
                <Button
                  variant="danger"
                  fullWidth
                  onClick={() => setStep("confirm")}
                  disabled={subscriber.hasActiveVehicle}
                >
                  Eliminar abonado
                </Button>
              </div>
            </>
          )}

          {step === "confirm" && (
            <>
              <h3 className="text-lg font-bold text-foreground">
                ¿Está seguro de que desea eliminar este abonado?
              </h3>
              <p className="mt-2 text-sm text-muted">
                Esta acción requiere permisos de administrador. {subscriber.nombreCompleto} ({subscriber.plate})
                dejará de aparecer como abonado activo — el trabajador lo verá como cliente normal.
              </p>

              {error && (
                <div className="mt-4 rounded-xl bg-danger-bg px-4 py-3 text-sm font-medium text-danger">
                  {error}
                </div>
              )}

              <div className="mt-6 flex gap-3">
                <Button variant="secondary" fullWidth onClick={() => setStep("details")} disabled={pending}>
                  Cancelar
                </Button>
                <Button variant="danger" fullWidth onClick={onConfirm} disabled={pending}>
                  {pending ? "Eliminando..." : "Confirmar eliminación"}
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="font-semibold text-foreground">{value}</dd>
    </div>
  );
}
