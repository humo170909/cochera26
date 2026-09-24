"use client";

import { useRef, useState, useTransition } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Input";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toaster";
import { updateVehicleVisit } from "@/actions/history-actions";
import { toLimaInputValue } from "@/lib/datetime";
import { VEHICLE_TYPES, VEHICLE_TYPE_LABELS, PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from "@/lib/constants";
import type { HistoryRow } from "@/services/history";
import type { PaymentMethod, VehicleType } from "@/types/database";

interface SpotOption {
  id: string;
  code: string;
}

export function EditVisitModal({
  row,
  spots,
  open,
  onClose,
}: {
  row: HistoryRow;
  spots: SpotOption[];
  open: boolean;
  onClose: () => void;
}) {
  const { showToast } = useToast();
  const noCharge = row.tariffType === "ABONADO" || row.tariffType === "AUTORIZADO";

  const [plate, setPlate] = useState(row.plate);
  const [vehicleType, setVehicleType] = useState<VehicleType>(row.vehicleType);
  const [spotId, setSpotId] = useState(spots.find((s) => s.code === row.spotCode)?.id ?? "");
  const [entryAt, setEntryAt] = useState(toLimaInputValue(row.entryAt));
  const [exitAt, setExitAt] = useState(toLimaInputValue(row.exitAt));
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(row.paymentMethod ?? "EFECTIVO");
  const [amount, setAmount] = useState(String(row.amount));
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const submittingRef = useRef(false);

  const onSave = () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setError(null);
    startTransition(async () => {
      try {
        const result = await updateVehicleVisit({
          exitId: row.exitId,
          plate,
          vehicleType,
          spotId,
          entryAt,
          exitAt,
          paymentMethod: noCharge ? null : paymentMethod,
          amount: noCharge ? 0 : Number(amount),
        });
        if (result.error) {
          setError(result.error);
          setConfirming(false);
          return;
        }
        showToast("Registro actualizado correctamente.", "success");
        setConfirming(false);
        onClose();
      } finally {
        submittingRef.current = false;
      }
    });
  };

  return (
    <>
      <Modal open={open} onClose={onClose} maxWidth="max-w-lg">
        <div className="p-6">
          <h3 className="text-lg font-bold text-foreground">Editar registro</h3>
          <p className="mt-1 text-sm text-muted">Corrección administrativa de ingreso/salida.</p>

          <div className="mt-4 flex flex-col gap-4">
            <Field label="Placa" htmlFor="edit-plate">
              <Input
                id="edit-plate"
                value={plate}
                onChange={(e) => setPlate(e.target.value.toUpperCase())}
                className="font-bold tracking-wider"
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Tipo de vehículo" htmlFor="edit-vehicle-type">
                <Select
                  id="edit-vehicle-type"
                  value={vehicleType}
                  onChange={(e) => setVehicleType(e.target.value as VehicleType)}
                >
                  {VEHICLE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {VEHICLE_TYPE_LABELS[t]}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Espacio" htmlFor="edit-spot">
                <Select id="edit-spot" value={spotId} onChange={(e) => setSpotId(e.target.value)}>
                  {spots.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Fecha/hora de ingreso" htmlFor="edit-entry-at">
                <Input
                  id="edit-entry-at"
                  type="datetime-local"
                  value={entryAt}
                  onChange={(e) => setEntryAt(e.target.value)}
                />
              </Field>
              <Field label="Fecha/hora de salida" htmlFor="edit-exit-at">
                <Input
                  id="edit-exit-at"
                  type="datetime-local"
                  value={exitAt}
                  onChange={(e) => setExitAt(e.target.value)}
                />
              </Field>
            </div>

            {noCharge ? (
              <p className="rounded-xl bg-surface-2 px-4 py-3 text-sm text-muted">
                Este registro es <strong>{row.tariffType}</strong> — no admite método de pago ni importe.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Método de pago" htmlFor="edit-payment-method">
                  <Select
                    id="edit-payment-method"
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                  >
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {PAYMENT_METHOD_LABELS[m]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Importe cobrado (S/)" htmlFor="edit-amount">
                  <Input
                    id="edit-amount"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </Field>
              </div>
            )}
          </div>

          {error && (
            <div className="mt-4 rounded-xl bg-danger-bg px-4 py-3 text-sm font-medium text-danger">{error}</div>
          )}

          <div className="mt-6 flex gap-3">
            <Button variant="secondary" fullWidth onClick={onClose} disabled={pending}>
              Cancelar
            </Button>
            <Button fullWidth onClick={() => setConfirming(true)} disabled={pending}>
              Guardar cambios
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirming}
        title="¿Deseas guardar los cambios realizados en este registro?"
        confirmLabel="Guardar cambios"
        pending={pending}
        onConfirm={onSave}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
}
