"use client";

import { useState, useTransition } from "react";
import { Field, Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toaster";
import { updateFlatRateSettings } from "@/actions/tariff-actions";
import { formatCurrency } from "@/lib/format";
import type { FlatRateCapacity, FlatRateSettings } from "@/types/domain";

const DAYS = [
  { value: 1, label: "Lun" },
  { value: 2, label: "Mar" },
  { value: 3, label: "Mié" },
  { value: 4, label: "Jue" },
  { value: 5, label: "Vie" },
  { value: 6, label: "Sáb" },
  { value: 0, label: "Dom" },
];

export function FlatRateEditor({ initial, capacity }: { initial: FlatRateSettings; capacity: FlatRateCapacity }) {
  const { showToast } = useToast();
  const [form, setForm] = useState(initial);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const dirty = JSON.stringify(form) !== JSON.stringify(initial);

  const toggleDay = (day: number) => {
    setForm((f) => ({
      ...f,
      diasAplicacion: f.diasAplicacion.includes(day)
        ? f.diasAplicacion.filter((d) => d !== day)
        : [...f.diasAplicacion, day].sort(),
    }));
  };

  const onConfirm = () => {
    setError(null);
    startTransition(async () => {
      const result = await updateFlatRateSettings(form);
      if (result.error) {
        setError(result.error);
        setConfirming(false);
        return;
      }
      showToast("Tarifa plana actualizada.", "success");
      setConfirming(false);
    });
  };

  return (
    <div className="p-5">
      <div className="mb-4 rounded-xl bg-surface-2 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Cupos en uso ahora mismo</p>
        <p className="text-lg font-bold text-foreground">
          {capacity.activos} / {capacity.cupoMaximo}{" "}
          {capacity.disponibles === 0 && <span className="text-danger">— completo</span>}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Precio (S/)" htmlFor="plana-precio">
          <Input
            id="plana-precio"
            type="number"
            min="0.01"
            step="0.01"
            value={form.precio}
            onChange={(e) => setForm((f) => ({ ...f, precio: Number(e.target.value) }))}
          />
        </Field>
        <Field label="Hora límite (sale antes de)" htmlFor="plana-hora">
          <Input
            id="plana-hora"
            type="time"
            value={form.horaLimite}
            onChange={(e) => setForm((f) => ({ ...f, horaLimite: e.target.value }))}
          />
        </Field>
        <Field label="Cupo máximo (vehículos)" htmlFor="plana-cupo">
          <Input
            id="plana-cupo"
            type="number"
            min={1}
            max={999}
            value={form.cupoMaximo}
            onChange={(e) => setForm((f) => ({ ...f, cupoMaximo: Number(e.target.value) }))}
          />
        </Field>
      </div>

      <div className="mt-4">
        <p className="mb-1.5 text-sm font-medium text-foreground">Días de aplicación</p>
        <div className="flex flex-wrap gap-2">
          {DAYS.map((d) => (
            <button
              key={d.value}
              type="button"
              onClick={() => toggleDay(d.value)}
              className={`h-9 rounded-lg border px-3 text-sm font-semibold ${
                form.diasAplicacion.includes(d.value)
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-foreground hover:bg-surface-2"
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      <label className="mt-4 flex items-center gap-2 text-sm font-medium text-foreground">
        <input
          type="checkbox"
          checked={form.activo}
          onChange={(e) => setForm((f) => ({ ...f, activo: e.target.checked }))}
          className="h-4 w-4 rounded border-border"
        />
        Tarifa plana activa
      </label>

      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      <Button size="sm" className="mt-3" onClick={() => setConfirming(true)} disabled={!dirty || pending}>
        {pending ? "..." : "Guardar"}
      </Button>

      <ConfirmDialog
        open={confirming}
        title="¿Confirmar cambio de tarifa plana?"
        description={`Precio: ${formatCurrency(initial.precio)} → ${formatCurrency(form.precio)}. Hora límite: ${initial.horaLimite} → ${form.horaLimite}. Cupo máximo: ${initial.cupoMaximo} → ${form.cupoMaximo}.`}
        confirmLabel="Confirmar cambio"
        pending={pending}
        onConfirm={onConfirm}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}
