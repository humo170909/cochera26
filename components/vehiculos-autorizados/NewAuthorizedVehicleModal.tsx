"use client";

import { useEffect, useState, useTransition } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toaster";
import { createAuthorizedVehicle } from "@/actions/authorized-vehicle-actions";
import { createClient } from "@/lib/supabase/client";
import { VEHICLE_TYPES, VEHICLE_TYPE_LABELS } from "@/lib/constants";
import type { VehicleType } from "@/types/database";

const EMPTY_FORM = {
  plate: "",
  propietario: "",
  vehicleType: "AUTO" as VehicleType,
  telefono: "",
  observaciones: "",
};

/** true si la placa ya tiene un abono ACTIVO (advertencia no bloqueante). */
function useSubscriberConflictWarning(plate: string) {
  const [hasActiveSubscriber, setHasActiveSubscriber] = useState(false);

  useEffect(() => {
    const trimmed = plate.trim();
    const supabase = createClient();
    const timeout = setTimeout(async () => {
      if (trimmed.length < 5) {
        setHasActiveSubscriber(false);
        return;
      }
      const { data } = await supabase
        .rpc("lookup_subscriber_by_plate", { p_plate: trimmed })
        .maybeSingle()
        .returns<{ display_status: string } | null>();
      setHasActiveSubscriber(data?.display_status === "ACTIVO");
    }, 400);
    return () => clearTimeout(timeout);
  }, [plate]);

  return hasActiveSubscriber;
}

export function NewAuthorizedVehicleModal() {
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const hasConflict = useSubscriberConflictWarning(form.plate);

  const close = () => {
    setOpen(false);
    setForm(EMPTY_FORM);
    setError(null);
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createAuthorizedVehicle({ ...form, estado: "ACTIVO" });
      if (result.error) {
        setError(result.error);
        return;
      }
      showToast("Vehículo autorizado registrado.", "success");
      close();
    });
  };

  return (
    <>
      <Button onClick={() => setOpen(true)}>+ Nuevo vehículo autorizado</Button>

      <Modal open={open} onClose={close} maxWidth="max-w-lg">
        <form onSubmit={onSubmit} className="p-6">
          <h3 className="text-lg font-bold text-foreground">Nuevo vehículo autorizado</h3>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Placa" htmlFor="av-placa">
              <Input
                id="av-placa"
                value={form.plate}
                onChange={(e) => setForm((f) => ({ ...f, plate: e.target.value.toUpperCase() }))}
                placeholder="ABC-123"
                required
              />
            </Field>
            <Field label="Propietario" htmlFor="av-propietario">
              <Input
                id="av-propietario"
                value={form.propietario}
                onChange={(e) => setForm((f) => ({ ...f, propietario: e.target.value }))}
                required
              />
            </Field>
            <Field label="Tipo de vehículo" htmlFor="av-tipo">
              <Select
                id="av-tipo"
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
            <Field label="Teléfono (opcional)" htmlFor="av-tel">
              <Input id="av-tel" value={form.telefono} onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))} />
            </Field>
          </div>

          <div className="mt-4">
            <Field label="Observación (opcional)" htmlFor="av-obs">
              <Input
                id="av-obs"
                value={form.observaciones}
                onChange={(e) => setForm((f) => ({ ...f, observaciones: e.target.value }))}
              />
            </Field>
          </div>

          {hasConflict && (
            <div className="mt-4 rounded-xl bg-warning-bg px-4 py-3 text-sm font-medium text-warning">
              ⚠️ Esta placa ya tiene un abono ACTIVO. Si la autorizas, tendrá prioridad sobre el abono: esta
              placa dejará de cobrarse y de consumir su abono mientras la autorización esté activa.
            </div>
          )}

          {error && (
            <div className="mt-4 rounded-xl bg-danger-bg px-4 py-3 text-sm font-medium text-danger">{error}</div>
          )}

          <div className="mt-6 flex gap-3">
            <Button type="button" variant="secondary" fullWidth onClick={close} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" fullWidth disabled={pending}>
              {pending ? "Guardando..." : "Registrar"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
