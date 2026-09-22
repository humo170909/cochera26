"use client";

import { useState, useTransition } from "react";
import { Field, Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toaster";
import { updateSubscriberPlanSettings } from "@/actions/tariff-actions";
import { formatCurrency } from "@/lib/format";
import type { SubscriberPlanSettings } from "@/types/domain";

export function SubscriberPlanEditor({ initial }: { initial: SubscriberPlanSettings }) {
  const { showToast } = useToast();
  const [form, setForm] = useState(initial);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const dirty = JSON.stringify(form) !== JSON.stringify(initial);

  const onConfirm = () => {
    setError(null);
    startTransition(async () => {
      const result = await updateSubscriberPlanSettings(form);
      if (result.error) {
        setError(result.error);
        setConfirming(false);
        return;
      }
      showToast("Configuración de abonados actualizada.", "success");
      setConfirming(false);
    });
  };

  return (
    <div className="p-5">
      <p className="mb-3 text-xs text-muted">
        Valores por defecto al registrar un abonado nuevo. No modifica abonados ya existentes.
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Precio mensual (S/)" htmlFor="abono-precio">
          <Input
            id="abono-precio"
            type="number"
            min="0.01"
            step="0.01"
            value={form.precioMensual}
            onChange={(e) => setForm((f) => ({ ...f, precioMensual: Number(e.target.value) }))}
          />
        </Field>
        <Field label="Hora límite de ingreso" htmlFor="abono-hora">
          <Input
            id="abono-hora"
            type="time"
            value={form.horaLimite}
            onChange={(e) => setForm((f) => ({ ...f, horaLimite: e.target.value }))}
          />
        </Field>
        <Field label="Duración del período (meses)" htmlFor="abono-periodo">
          <Input
            id="abono-periodo"
            type="number"
            min={1}
            max={24}
            value={form.periodoMeses}
            onChange={(e) => setForm((f) => ({ ...f, periodoMeses: Number(e.target.value) }))}
          />
        </Field>
        <Field label="Alertar cuando falten (días)" htmlFor="abono-alerta">
          <Input
            id="abono-alerta"
            type="number"
            min={0}
            max={60}
            value={form.diasAlertaVencimiento}
            onChange={(e) => setForm((f) => ({ ...f, diasAlertaVencimiento: Number(e.target.value) }))}
          />
        </Field>
      </div>
      <p className="mt-2 text-xs text-muted">
        Cada pago registrado extiende el vencimiento {form.periodoMeses}{" "}
        {form.periodoMeses === 1 ? "mes" : "meses"}. Un abonado aparece &ldquo;Por vencer&rdquo; cuando le quedan{" "}
        {form.diasAlertaVencimiento} días o menos.
      </p>

      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      <Button size="sm" className="mt-3" onClick={() => setConfirming(true)} disabled={!dirty || pending}>
        {pending ? "..." : "Guardar"}
      </Button>

      <ConfirmDialog
        open={confirming}
        title="¿Confirmar cambio de configuración de abonados?"
        description={`Precio: ${formatCurrency(initial.precioMensual)} → ${formatCurrency(form.precioMensual)}. Hora límite: ${initial.horaLimite} → ${form.horaLimite}. Período: ${initial.periodoMeses} → ${form.periodoMeses} mes(es).`}
        confirmLabel="Confirmar cambio"
        pending={pending}
        onConfirm={onConfirm}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}
