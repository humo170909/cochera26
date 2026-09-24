"use client";

import { useRef, useState, useTransition } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Input";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toaster";
import { updateEntryDetails } from "@/actions/vehicle-actions";
import { VEHICLE_TYPES, VEHICLE_TYPE_LABELS } from "@/lib/constants";
import type { VehicleType } from "@/types/database";

/**
 * Corrección de placa + tipo de un ingreso ACTIVO — disponible para
 * COLABORADOR y ADMIN por igual (ver update_active_entry_details()). Solo
 * estos dos campos: nunca espacio, fecha/hora, tarifa, pago, usuario ni
 * estado. La restricción real vive en el RPC (is_active_staff() +
 * status='ACTIVO'), esto es solo la UI.
 */
export function CorrectEntryDataModal({
  open,
  entryId,
  currentPlate,
  currentVehicleType,
  onClose,
}: {
  open: boolean;
  entryId: string;
  currentPlate: string;
  currentVehicleType: VehicleType;
  onClose: () => void;
}) {
  const { showToast } = useToast();
  const [plate, setPlate] = useState(currentPlate);
  const [vehicleType, setVehicleType] = useState<VehicleType>(currentVehicleType);
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const submittingRef = useRef(false);

  const hasChanges = plate.trim().toUpperCase() !== currentPlate.toUpperCase() || vehicleType !== currentVehicleType;

  const close = () => {
    setPlate(currentPlate);
    setVehicleType(currentVehicleType);
    setConfirming(false);
    setNotice(null);
    setError(null);
    onClose();
  };

  const onRequestSave = () => {
    if (!hasChanges) {
      setNotice("No hay cambios para guardar.");
      return;
    }
    setNotice(null);
    setError(null);
    setConfirming(true);
  };

  const onConfirm = () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setError(null);
    startTransition(async () => {
      try {
        const result = await updateEntryDetails({ entryId, plate, vehicleType });
        if (result.error) {
          // No se cierra el modal en error: el usuario debe poder corregir y reintentar.
          setError(result.error);
          setConfirming(false);
          return;
        }
        showToast("Datos actualizados correctamente.", "success");
        setConfirming(false);
        onClose();
      } finally {
        submittingRef.current = false;
      }
    });
  };

  return (
    <>
      <Modal open={open} onClose={close} maxWidth="max-w-sm">
        <div className="p-6">
          <h3 className="text-lg font-bold text-foreground">✏️ Corregir datos del vehículo</h3>
          <p className="mt-1 text-xs text-muted">Solo placa y tipo de vehículo. Espacio, tarifa, pago y fecha no se modifican.</p>

          <div className="mt-4 flex flex-col gap-4">
            <Field label="Placa" htmlFor="correct-plate">
              <Input
                id="correct-plate"
                value={plate}
                onChange={(e) => setPlate(e.target.value.toUpperCase())}
                placeholder="ABC-123"
                className="text-lg font-bold tracking-wider"
                autoFocus
              />
            </Field>

            <Field label="Tipo de vehículo" htmlFor="correct-vehicle-type">
              <Select
                id="correct-vehicle-type"
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
          </div>

          {notice && (
            <div className="mt-4 rounded-xl bg-surface-2 px-4 py-3 text-sm font-medium text-muted">{notice}</div>
          )}
          {error && (
            <div className="mt-4 rounded-xl bg-danger-bg px-4 py-3 text-sm font-medium text-danger">{error}</div>
          )}

          <div className="mt-6 flex gap-3">
            <Button variant="secondary" fullWidth onClick={close} disabled={pending}>
              Cancelar
            </Button>
            <Button fullWidth onClick={onRequestSave} disabled={pending}>
              Guardar cambios
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirming}
        title="¿Deseas guardar los cambios?"
        confirmLabel={pending ? "Guardando..." : "Guardar cambios"}
        pending={pending}
        onConfirm={onConfirm}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
}
