"use client";

import { useState, useTransition } from "react";
import { Field, Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toaster";
import { updateToleranceSettings } from "@/actions/tariff-actions";
import type { ToleranceSettings } from "@/types/domain";

export function ToleranceEditor({ initial }: { initial: ToleranceSettings }) {
  const { showToast } = useToast();
  const [form, setForm] = useState(initial);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const dirty = JSON.stringify(form) !== JSON.stringify(initial);

  const onConfirm = () => {
    setError(null);
    startTransition(async () => {
      const result = await updateToleranceSettings(form);
      if (result.error) {
        setError(result.error);
        setConfirming(false);
        return;
      }
      showToast("Tolerancias actualizadas.", "success");
      setConfirming(false);
    });
  };

  return (
    <div className="p-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Tolerancia corta (min)" htmlFor="tol-corta">
          <Input
            id="tol-corta"
            type="number"
            min={0}
            max={59}
            value={form.tolerCortaMinutos}
            onChange={(e) => setForm((f) => ({ ...f, tolerCortaMinutos: Number(e.target.value) }))}
          />
        </Field>
        <Field label="Tolerancia larga (min)" htmlFor="tol-larga">
          <Input
            id="tol-larga"
            type="number"
            min={0}
            max={59}
            value={form.tolerLargaMinutos}
            onChange={(e) => setForm((f) => ({ ...f, tolerLargaMinutos: Number(e.target.value) }))}
          />
        </Field>
        <Field label="Umbral tarifa larga (horas)" htmlFor="tol-umbral">
          <Input
            id="tol-umbral"
            type="number"
            min={1}
            max={24}
            value={form.umbralLargaHoras}
            onChange={(e) => setForm((f) => ({ ...f, umbralLargaHoras: Number(e.target.value) }))}
          />
        </Field>
      </div>
      <p className="mt-2 text-xs text-muted">
        Estadías de menos de {form.umbralLargaHoras} horas completas usan la tolerancia corta; de{" "}
        {form.umbralLargaHoras} horas completas en adelante, usan la tolerancia larga.
      </p>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      <Button size="sm" className="mt-3" onClick={() => setConfirming(true)} disabled={!dirty || pending}>
        {pending ? "..." : "Guardar"}
      </Button>

      <ConfirmDialog
        open={confirming}
        title="¿Confirmar cambio de tolerancias?"
        description={`Corta: ${initial.tolerCortaMinutos} → ${form.tolerCortaMinutos} min. Larga: ${initial.tolerLargaMinutos} → ${form.tolerLargaMinutos} min. Umbral: ${initial.umbralLargaHoras} → ${form.umbralLargaHoras} h.`}
        confirmLabel="Confirmar cambio"
        pending={pending}
        onConfirm={onConfirm}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}
