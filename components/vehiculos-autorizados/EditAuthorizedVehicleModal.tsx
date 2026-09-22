"use client";

import { useState, useTransition } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toaster";
import { updateAuthorizedVehicle } from "@/actions/authorized-vehicle-actions";
import { VEHICLE_TYPES, VEHICLE_TYPE_LABELS, AUTHORIZED_VEHICLE_STATUS_LABELS } from "@/lib/constants";
import type { AuthorizedVehicleRow } from "@/services/authorized-vehicles";
import type { AuthorizedVehicleStatus, VehicleType } from "@/types/database";

export function EditAuthorizedVehicleModal({
  vehicle,
  fullWidth,
}: {
  vehicle: AuthorizedVehicleRow;
  fullWidth?: boolean;
}) {
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    plate: vehicle.plate,
    propietario: vehicle.propietario,
    vehicleType: vehicle.vehicleType,
    telefono: vehicle.telefono ?? "",
    estado: vehicle.estado,
    observaciones: vehicle.observaciones ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await updateAuthorizedVehicle({ id: vehicle.id, ...form });
      if (result.error) {
        setError(result.error);
        return;
      }
      showToast("Vehículo autorizado actualizado.", "success");
      setOpen(false);
    });
  };

  return (
    <>
      <Button size="sm" variant="secondary" fullWidth={fullWidth} onClick={() => setOpen(true)}>
        Editar
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} maxWidth="max-w-lg">
        <form onSubmit={onSubmit} className="p-6">
          <h3 className="text-lg font-bold text-foreground">Editar vehículo autorizado</h3>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Placa" htmlFor="eav-placa">
              <Input
                id="eav-placa"
                value={form.plate}
                onChange={(e) => setForm((f) => ({ ...f, plate: e.target.value.toUpperCase() }))}
                required
              />
            </Field>
            <Field label="Propietario" htmlFor="eav-propietario">
              <Input
                id="eav-propietario"
                value={form.propietario}
                onChange={(e) => setForm((f) => ({ ...f, propietario: e.target.value }))}
                required
              />
            </Field>
            <Field label="Tipo de vehículo" htmlFor="eav-tipo">
              <Select
                id="eav-tipo"
                value={form.vehicleType}
                onChange={(e) => setForm((f) => ({ ...f, vehicleType: e.target.value as VehicleType }))}
              >
                {VEHICLE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {VEHICLE_TYPE_LABELS[t]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Teléfono (opcional)" htmlFor="eav-tel">
              <Input id="eav-tel" value={form.telefono} onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))} />
            </Field>
            <Field label="Estado" htmlFor="eav-estado">
              <Select
                id="eav-estado"
                value={form.estado}
                onChange={(e) => setForm((f) => ({ ...f, estado: e.target.value as AuthorizedVehicleStatus }))}
              >
                {Object.entries(AUTHORIZED_VEHICLE_STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="mt-4">
            <Field label="Observación (opcional)" htmlFor="eav-obs">
              <Input
                id="eav-obs"
                value={form.observaciones}
                onChange={(e) => setForm((f) => ({ ...f, observaciones: e.target.value }))}
              />
            </Field>
          </div>

          {error && (
            <div className="mt-4 rounded-xl bg-danger-bg px-4 py-3 text-sm font-medium text-danger">{error}</div>
          )}

          <div className="mt-6 flex gap-3">
            <Button type="button" variant="secondary" fullWidth onClick={() => setOpen(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" fullWidth disabled={pending}>
              {pending ? "Guardando..." : "Guardar cambios"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
