"use client";

import { useState, useTransition } from "react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toaster";
import { updateTariff } from "@/actions/tariff-actions";
import { formatCurrency } from "@/lib/format";
import { VEHICLE_TYPE_LABELS } from "@/lib/constants";
import type { VehicleType } from "@/types/database";

export function TariffEditor({
  vehicleType,
  initialPrice,
}: {
  vehicleType: VehicleType;
  initialPrice: number;
}) {
  const { showToast } = useToast();
  const [price, setPrice] = useState(String(initialPrice));
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const dirty = price !== String(initialPrice);

  const onConfirm = () => {
    setError(null);
    startTransition(async () => {
      const result = await updateTariff({ vehicleType, pricePerHour: price });
      if (result.error) {
        setError(result.error);
        setConfirming(false);
        return;
      }
      showToast(`Tarifa de ${VEHICLE_TYPE_LABELS[vehicleType]} actualizada.`, "success");
      setConfirming(false);
    });
  };

  return (
    <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4 last:border-0">
      <div>
        <p className="font-semibold text-foreground">{VEHICLE_TYPE_LABELS[vehicleType]}</p>
        <p className="text-xs text-muted">S/ por hora, fracción hacia arriba</p>
        {error && <p className="mt-1 text-xs text-danger">{error}</p>}
      </div>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          min="0.10"
          step="0.10"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className="w-28"
        />
        <Button size="sm" onClick={() => setConfirming(true)} disabled={!dirty || pending}>
          {pending ? "..." : "Guardar"}
        </Button>
      </div>

      <ConfirmDialog
        open={confirming}
        title="¿Confirmar cambio de tarifa?"
        description={`${VEHICLE_TYPE_LABELS[vehicleType]}: tarifa anterior ${formatCurrency(initialPrice)} → nueva tarifa ${formatCurrency(Number(price || 0))}.`}
        confirmLabel="Confirmar cambio"
        pending={pending}
        onConfirm={onConfirm}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}
