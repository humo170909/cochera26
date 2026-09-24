"use client";

import { useRef, useState, useTransition } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toaster";
import { useElapsedTime } from "@/hooks/useElapsedTime";
import { calculateHourlyFee } from "@/lib/tariffs";
import { formatCurrency } from "@/lib/format";
import { formatShortTimeLima } from "@/lib/datetime";
import { VEHICLE_TYPES, VEHICLE_TYPE_LABELS } from "@/lib/constants";
import { getEntryTicket } from "@/actions/ticket-actions";
import { updateEntryVehicleType } from "@/actions/vehicle-actions";
import { PrintTicketModal } from "@/components/tickets/PrintTicketModal";
import type { ParkingSpotWithEntry, FlatRateSettings, ToleranceSettings, EntryTicket } from "@/types/domain";
import type { VehicleType } from "@/types/database";

export function SpotDetailsModal({
  spot,
  pricePerHour,
  tolerance,
  flatRate,
  onClose,
}: {
  spot: ParkingSpotWithEntry | null;
  pricePerHour: number;
  tolerance: ToleranceSettings;
  flatRate: FlatRateSettings;
  onClose: () => void;
}) {
  const { showToast } = useToast();
  const [ticketToPrint, setTicketToPrint] = useState<EntryTicket | null>(null);
  const [reprintError, setReprintError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Corrección de tipo de vehículo (colaborador o admin) — ver
  // update_active_entry_vehicle_type(). Solo toca vehicle_type, nunca
  // placa/espacio/fecha/tarifa/pago.
  const [editingType, setEditingType] = useState(false);
  const [newType, setNewType] = useState<VehicleType>("AUTO");
  const [typeError, setTypeError] = useState<string | null>(null);
  const [savingType, startSavingType] = useTransition();
  const savingTypeRef = useRef(false);

  const entry = spot?.activeEntry ?? null;
  const elapsed = useElapsedTime(entry?.entryAt ?? new Date().toISOString());
  const fee = calculateHourlyFee(pricePerHour, elapsed.elapsedMinutes, tolerance);
  // La tarifa plana queda fija al ingreso: se muestra la fotografía
  // (flatRatePriceSnapshot), nunca el precio configurado actualmente.
  const estimatedAmount = entry?.isAuthorized
    ? 0
    : entry?.flatRateReserved
      ? (entry.flatRatePriceSnapshot ?? flatRate.precio)
      : fee.amount;

  // Solo HORA/PLANA tuvieron ticket al ingresar (misma regla que el backend).
  const mayHaveTicket = !!entry && !entry.isAuthorized && !entry.coveredBySubscription;

  const onReprint = () => {
    if (!entry) return;
    setReprintError(null);
    startTransition(async () => {
      const res = await getEntryTicket(entry.id);
      if (res.error || !res.data) {
        setReprintError(res.error ?? "Este ingreso no tiene un ticket asociado.");
        return;
      }
      setTicketToPrint(res.data);
    });
  };

  const close = () => {
    setEditingType(false);
    setTypeError(null);
    onClose();
  };

  const startEditType = () => {
    if (!entry) return;
    setNewType(entry.vehicleType);
    setTypeError(null);
    setEditingType(true);
  };

  const onSaveType = () => {
    if (!entry || savingTypeRef.current) return;
    savingTypeRef.current = true;
    setTypeError(null);
    startSavingType(async () => {
      try {
        const result = await updateEntryVehicleType({ entryId: entry.id, vehicleType: newType });
        if (result.error) {
          setTypeError(result.error);
          return;
        }
        showToast("Tipo de vehículo actualizado.", "success");
        setEditingType(false);
      } finally {
        savingTypeRef.current = false;
      }
    });
  };

  return (
    <>
    <Modal open={!!spot && !!entry} onClose={close} maxWidth="max-w-sm">
      {spot && entry && (
        <div className="p-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold text-foreground">{spot.code}</h3>
            <Badge tone="danger">Ocupado</Badge>
          </div>

          {entry.isAuthorized && (
            <div className="mt-3 rounded-xl bg-purple-bg px-3 py-2 text-center text-sm font-bold text-purple">
              🟣 VEHÍCULO AUTORIZADO{entry.authorizedOwnerName ? ` · ${entry.authorizedOwnerName}` : ""}
            </div>
          )}
          {!entry.isAuthorized && entry.coveredBySubscription && (
            <div className="mt-3 rounded-xl bg-info-bg px-3 py-2 text-center text-sm font-bold text-info">
              ABONADO ACTIVO{entry.subscriberName ? ` · ${entry.subscriberName}` : ""}
            </div>
          )}
          {!entry.isAuthorized && !entry.coveredBySubscription && entry.flatRateReserved && (
            <div className="mt-3 rounded-xl bg-surface-2 px-3 py-2 text-center text-sm font-bold text-foreground">
              {entry.flatRatePeriod === "PLANA_NOCHE" ? "TARIFA PLANA NOCHE RESERVADA" : "TARIFA PLANA DÍA RESERVADA"}
            </div>
          )}

          <dl className="mt-4 flex flex-col gap-3 text-sm">
            <Row label="Placa" value={entry.plate} big />
            {editingType ? (
              <div className="flex items-center justify-between gap-3">
                <dt className="shrink-0 text-muted">Tipo de vehículo</dt>
                <dd className="flex items-center gap-2">
                  <Select
                    value={newType}
                    onChange={(e) => setNewType(e.target.value as VehicleType)}
                    className="h-9 w-36 text-sm"
                    disabled={savingType}
                  >
                    {VEHICLE_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {VEHICLE_TYPE_LABELS[t]}
                      </option>
                    ))}
                  </Select>
                </dd>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted">Tipo de vehículo</dt>
                <dd className="flex items-center gap-2 font-semibold text-foreground">
                  {VEHICLE_TYPE_LABELS[entry.vehicleType]}
                  <button
                    type="button"
                    onClick={startEditType}
                    className="text-xs font-semibold text-accent underline-offset-2 hover:underline"
                  >
                    Corregir
                  </button>
                </dd>
              </div>
            )}
            <Row label="Hora de ingreso" value={formatShortTimeLima(entry.entryAt)} />
            <Row label="Tiempo transcurrido" value={elapsed.elapsedLabel} mono />
            {entry.isAuthorized ? (
              <Row label="Importe" value="Sin cobro" big />
            ) : entry.coveredBySubscription ? (
              <Row label="Importe" value="Cubierto por abono" big />
            ) : (
              <Row label="Importe estimado" value={formatCurrency(estimatedAmount)} big />
            )}
            <Row label="Registrado por" value={entry.registeredByName || "—"} />
          </dl>

          {editingType && (
            <div className="mt-3 flex flex-col gap-2">
              {typeError && <p className="text-xs font-medium text-danger">{typeError}</p>}
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  fullWidth
                  onClick={() => setEditingType(false)}
                  disabled={savingType}
                >
                  Cancelar
                </Button>
                <Button size="sm" fullWidth onClick={onSaveType} disabled={savingType}>
                  {savingType ? "Guardando..." : "Guardar tipo"}
                </Button>
              </div>
            </div>
          )}

          <p className="mt-4 text-center text-xs text-muted">
            Para registrar la salida, ve a la sección Salidas.
          </p>

          {reprintError && (
            <p className="mt-2 text-center text-xs font-medium text-danger">{reprintError}</p>
          )}

          <div className="mt-4 flex flex-col gap-3">
            {mayHaveTicket && (
              <Button variant="secondary" fullWidth onClick={onReprint} disabled={pending}>
                {pending ? "Buscando ticket..." : "Reimprimir ticket"}
              </Button>
            )}
            <Button variant="secondary" fullWidth onClick={close}>
              Cerrar
            </Button>
          </div>
        </div>
      )}
    </Modal>

    <PrintTicketModal ticket={ticketToPrint} onClose={() => setTicketToPrint(null)} />
    </>
  );
}

function Row({ label, value, big, mono }: { label: string; value: string; big?: boolean; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd
        className={`text-right font-semibold text-foreground ${big ? "text-lg" : ""} ${mono ? "font-mono tabular-nums" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}
