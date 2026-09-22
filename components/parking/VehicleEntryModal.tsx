"use client";

import { useState, useTransition } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Input";
import { Clock } from "@/components/layout/Clock";
import { useToast } from "@/components/ui/Toaster";
import { registerVehicleEntry } from "@/actions/vehicle-actions";
import { usePlateStatusLookup } from "@/hooks/usePlateStatusLookup";
import { ClientTypeCard } from "@/components/parking/ClientTypeCard";
import { isFlatRateEligibleNow } from "@/lib/tariffs";
import { formatCurrency } from "@/lib/format";
import { VEHICLE_TYPES, VEHICLE_TYPE_LABELS } from "@/lib/constants";
import type { VehicleType } from "@/types/database";
import type { FlatRateCapacity, FlatRateSettings } from "@/types/domain";

interface FreeSpotOption {
  id: string;
  code: string;
}

export function VehicleEntryModal({
  open,
  onClose,
  fixedSpot,
  freeSpots,
  flatRateSettings,
  flatRateCapacity,
}: {
  open: boolean;
  onClose: () => void;
  fixedSpot?: FreeSpotOption;
  freeSpots: FreeSpotOption[];
  flatRateSettings: FlatRateSettings;
  flatRateCapacity: FlatRateCapacity;
}) {
  const { showToast } = useToast();
  const [plate, setPlate] = useState("");
  const [vehicleType, setVehicleType] = useState<VehicleType>("AUTO");
  const [spotId, setSpotId] = useState(fixedSpot?.id ?? freeSpots[0]?.id ?? "");
  const [useFlatRate, setUseFlatRate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { result: plateStatus, loading: lookupLoading } = usePlateStatusLookup(plate);

  const isFreeEntry =
    plateStatus?.kind === "AUTORIZADO" || (plateStatus?.kind === "ABONADO" && plateStatus.displayStatus === "ACTIVO");
  const flatRateEligibleNow =
    flatRateSettings.activo && isFlatRateEligibleNow(flatRateSettings.horaLimite, flatRateSettings.diasAplicacion, new Date());
  const flatRateHasCapacity = flatRateCapacity.disponibles > 0;
  const flatRateOfferable = flatRateEligibleNow && !isFreeEntry;

  const close = () => {
    setPlate("");
    setUseFlatRate(false);
    setError(null);
    onClose();
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const targetSpotId = fixedSpot?.id ?? spotId;

    if (!targetSpotId) {
      setError("Selecciona un estacionamiento.");
      return;
    }

    startTransition(async () => {
      const result = await registerVehicleEntry({
        plate,
        vehicleType,
        spotId: targetSpotId,
        useFlatRate: useFlatRate && flatRateOfferable && flatRateHasCapacity,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      showToast(`Ingreso registrado en ${fixedSpot?.code ?? "el estacionamiento"}.`, "success");
      close();
    });
  };

  return (
    <Modal open={open} onClose={close} maxWidth="max-w-md">
      <form onSubmit={onSubmit} className="p-6">
        <div className="mb-5 flex items-start justify-between">
          <div>
            <h3 className="text-xl font-bold text-foreground">Registrar ingreso</h3>
            {fixedSpot && (
              <p className="text-sm text-muted">
                Estacionamiento <span className="font-semibold text-foreground">{fixedSpot.code}</span>
              </p>
            )}
          </div>
          <Clock />
        </div>

        <div className="flex flex-col gap-4">
          <Field label="Placa" htmlFor="plate">
            <Input
              id="plate"
              autoFocus
              value={plate}
              onChange={(e) => setPlate(e.target.value.toUpperCase())}
              placeholder="ABC-123"
              required
              className="text-lg font-bold tracking-wider"
            />
          </Field>

          <Field label="Tipo de vehículo" htmlFor="vehicleType">
            <Select
              id="vehicleType"
              value={vehicleType}
              onChange={(e) => setVehicleType(e.target.value as VehicleType)}
            >
              {VEHICLE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {VEHICLE_TYPE_LABELS[type]}
                </option>
              ))}
            </Select>
          </Field>

          <ClientTypeCard plateEntered={plate.trim().length >= 5} loading={lookupLoading} result={plateStatus} />

          {flatRateOfferable && (
            <label
              className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 ${
                flatRateHasCapacity
                  ? "border-border bg-surface cursor-pointer"
                  : "border-danger/30 bg-danger-bg cursor-not-allowed"
              }`}
            >
              <span>
                {flatRateHasCapacity ? (
                  <>
                    <span className="block text-sm font-bold text-foreground">
                      Usar tarifa plana ({formatCurrency(flatRateSettings.precio)})
                    </span>
                    <span className="block text-xs text-muted">
                      Cupos: {flatRateCapacity.activos} / {flatRateCapacity.cupoMaximo}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="block text-sm font-bold text-danger">
                      🔴 TARIFA PLANA COMPLETA
                    </span>
                    <span className="block text-xs text-danger">
                      {flatRateCapacity.activos} / {flatRateCapacity.cupoMaximo} vehículos — sin cupos disponibles
                    </span>
                  </>
                )}
              </span>
              <input
                type="checkbox"
                checked={useFlatRate && flatRateHasCapacity}
                disabled={!flatRateHasCapacity}
                onChange={(e) => setUseFlatRate(e.target.checked)}
                className="h-5 w-5 shrink-0 rounded border-border"
              />
            </label>
          )}

          {!fixedSpot && (
            <Field label="Estacionamiento" htmlFor="spotId">
              <Select id="spotId" value={spotId} onChange={(e) => setSpotId(e.target.value)} required>
                <option value="" disabled>
                  Selecciona un espacio libre
                </option>
                {freeSpots.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>

        {error && (
          <div className="mt-4 rounded-xl bg-danger-bg px-4 py-3 text-sm font-medium text-danger">
            {error}
          </div>
        )}

        <div className="mt-6 flex gap-3">
          <Button type="button" variant="secondary" fullWidth onClick={close} disabled={pending}>
            Cancelar
          </Button>
          <Button type="submit" fullWidth disabled={pending}>
            {pending ? "Registrando..." : "Registrar ingreso"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
