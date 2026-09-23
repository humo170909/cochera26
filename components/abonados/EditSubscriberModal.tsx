"use client";

import { useState, useTransition } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toaster";
import { updateSubscriber } from "@/actions/subscriber-actions";
import { VEHICLE_TYPES, VEHICLE_TYPE_LABELS, SUBSCRIBER_STATUS_LABELS, SUBSCRIBER_EDITABLE_STATUSES } from "@/lib/constants";
import type { SubscriberRow } from "@/services/subscribers";
import type { SubscriberStatus, VehicleType } from "@/types/database";

export function EditSubscriberModal({
  subscriber,
  spots,
  fullWidth,
}: {
  subscriber: SubscriberRow;
  spots: { id: string; code: string }[];
  fullWidth?: boolean;
}) {
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    nombreCompleto: subscriber.nombreCompleto,
    documento: subscriber.documento ?? "",
    telefono: subscriber.telefono ?? "",
    plate: subscriber.plate,
    vehicleType: subscriber.vehicleType,
    fechaInicio: subscriber.fechaInicio,
    fechaVencimiento: subscriber.fechaVencimiento,
    horaLimite: subscriber.horaLimite,
    monto: String(subscriber.monto),
    estado: subscriber.estado,
    observaciones: subscriber.observaciones ?? "",
    assignedSpotId: subscriber.assignedSpotId ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await updateSubscriber({
        id: subscriber.id,
        ...form,
        assignedSpotId: form.assignedSpotId || null,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      showToast("Abonado actualizado.", "success");
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
          <h3 className="text-lg font-bold text-foreground">Editar abonado</h3>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Nombre completo" htmlFor="e-nombre">
              <Input
                id="e-nombre"
                value={form.nombreCompleto}
                onChange={(e) => setForm((f) => ({ ...f, nombreCompleto: e.target.value }))}
                required
              />
            </Field>
            <Field label="DNI/RUC (opcional)" htmlFor="e-doc">
              <Input id="e-doc" value={form.documento} onChange={(e) => setForm((f) => ({ ...f, documento: e.target.value }))} />
            </Field>
            <Field label="Teléfono" htmlFor="e-tel">
              <Input id="e-tel" value={form.telefono} onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))} />
            </Field>
            <Field label="Placa" htmlFor="e-placa">
              <Input
                id="e-placa"
                value={form.plate}
                onChange={(e) => setForm((f) => ({ ...f, plate: e.target.value.toUpperCase() }))}
                required
              />
            </Field>
            <Field label="Tipo de vehículo" htmlFor="e-tipo">
              <Select
                id="e-tipo"
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
            <Field label="Espacio asignado (opcional)" htmlFor="e-espacio">
              <Select
                id="e-espacio"
                value={form.assignedSpotId}
                onChange={(e) => setForm((f) => ({ ...f, assignedSpotId: e.target.value }))}
              >
                <option value="">Sin espacio asignado</option>
                {spots.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Monto (S/)" htmlFor="e-monto">
              <Input
                id="e-monto"
                type="number"
                min="0.01"
                step="0.01"
                value={form.monto}
                onChange={(e) => setForm((f) => ({ ...f, monto: e.target.value }))}
                required
              />
            </Field>
            <Field label="Fecha de inicio" htmlFor="e-inicio">
              <Input
                id="e-inicio"
                type="date"
                value={form.fechaInicio}
                onChange={(e) => setForm((f) => ({ ...f, fechaInicio: e.target.value }))}
                required
              />
            </Field>
            <Field label="Fecha de vencimiento" htmlFor="e-fin">
              <Input
                id="e-fin"
                type="date"
                value={form.fechaVencimiento}
                onChange={(e) => setForm((f) => ({ ...f, fechaVencimiento: e.target.value }))}
                required
              />
            </Field>
            <Field label="Hora límite de ingreso" htmlFor="e-hora">
              <Input
                id="e-hora"
                type="time"
                value={form.horaLimite}
                onChange={(e) => setForm((f) => ({ ...f, horaLimite: e.target.value }))}
                required
              />
            </Field>
            <Field label="Estado" htmlFor="e-estado">
              <Select
                id="e-estado"
                value={form.estado}
                onChange={(e) => setForm((f) => ({ ...f, estado: e.target.value as SubscriberStatus }))}
              >
                {SUBSCRIBER_EDITABLE_STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {SUBSCRIBER_STATUS_LABELS[value]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="mt-4">
            <Field label="Observaciones (opcional)" htmlFor="e-obs">
              <Input
                id="e-obs"
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
