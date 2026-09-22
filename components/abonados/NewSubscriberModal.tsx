"use client";

import { useState, useTransition } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toaster";
import { createSubscriber } from "@/actions/subscriber-actions";
import { businessDateLima } from "@/lib/datetime";
import { VEHICLE_TYPES, VEHICLE_TYPE_LABELS } from "@/lib/constants";
import type { VehicleType } from "@/types/database";
import type { SubscriberPlanSettings } from "@/types/domain";

function addOneMonth(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0, 10);
}

export function NewSubscriberModal({ defaults }: { defaults: SubscriberPlanSettings }) {
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const today = businessDateLima();
  const [form, setForm] = useState({
    nombreCompleto: "",
    documento: "",
    telefono: "",
    plate: "",
    vehicleType: "AUTO" as VehicleType,
    fechaInicio: today,
    fechaVencimiento: addOneMonth(today),
    horaLimite: defaults.horaLimite,
    monto: String(defaults.precioMensual),
    observaciones: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const close = () => setOpen(false);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createSubscriber({ ...form, estado: "ACTIVO" });
      if (result.error) {
        setError(result.error);
        return;
      }
      showToast("Abonado registrado.", "success");
      close();
    });
  };

  return (
    <>
      <Button onClick={() => setOpen(true)}>+ Nuevo abonado</Button>

      <Modal open={open} onClose={close} maxWidth="max-w-lg">
        <form onSubmit={onSubmit} className="p-6">
          <h3 className="text-lg font-bold text-foreground">Nuevo abonado</h3>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Nombre completo" htmlFor="s-nombre">
              <Input
                id="s-nombre"
                value={form.nombreCompleto}
                onChange={(e) => setForm((f) => ({ ...f, nombreCompleto: e.target.value }))}
                required
              />
            </Field>
            <Field label="DNI/RUC (opcional)" htmlFor="s-doc">
              <Input id="s-doc" value={form.documento} onChange={(e) => setForm((f) => ({ ...f, documento: e.target.value }))} />
            </Field>
            <Field label="Teléfono" htmlFor="s-tel">
              <Input id="s-tel" value={form.telefono} onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))} />
            </Field>
            <Field label="Placa" htmlFor="s-placa">
              <Input
                id="s-placa"
                value={form.plate}
                onChange={(e) => setForm((f) => ({ ...f, plate: e.target.value.toUpperCase() }))}
                placeholder="ABC-123"
                required
              />
            </Field>
            <Field label="Tipo de vehículo" htmlFor="s-tipo">
              <Select
                id="s-tipo"
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
            <Field label="Monto (S/)" htmlFor="s-monto">
              <Input
                id="s-monto"
                type="number"
                min="0.01"
                step="0.01"
                value={form.monto}
                onChange={(e) => setForm((f) => ({ ...f, monto: e.target.value }))}
                required
              />
            </Field>
            <Field label="Fecha de inicio" htmlFor="s-inicio">
              <Input
                id="s-inicio"
                type="date"
                value={form.fechaInicio}
                onChange={(e) => setForm((f) => ({ ...f, fechaInicio: e.target.value }))}
                required
              />
            </Field>
            <Field label="Fecha de vencimiento" htmlFor="s-fin">
              <Input
                id="s-fin"
                type="date"
                value={form.fechaVencimiento}
                onChange={(e) => setForm((f) => ({ ...f, fechaVencimiento: e.target.value }))}
                required
              />
            </Field>
            <Field label="Hora límite de ingreso" htmlFor="s-hora">
              <Input
                id="s-hora"
                type="time"
                value={form.horaLimite}
                onChange={(e) => setForm((f) => ({ ...f, horaLimite: e.target.value }))}
                required
              />
            </Field>
          </div>

          <div className="mt-4">
            <Field label="Observaciones (opcional)" htmlFor="s-obs">
              <Input id="s-obs" value={form.observaciones} onChange={(e) => setForm((f) => ({ ...f, observaciones: e.target.value }))} />
            </Field>
          </div>

          {error && (
            <div className="mt-4 rounded-xl bg-danger-bg px-4 py-3 text-sm font-medium text-danger">{error}</div>
          )}

          <div className="mt-6 flex gap-3">
            <Button type="button" variant="secondary" fullWidth onClick={close} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" fullWidth disabled={pending}>
              {pending ? "Guardando..." : "Registrar abonado"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
