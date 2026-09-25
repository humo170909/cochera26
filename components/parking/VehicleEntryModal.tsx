"use client";

import { useRef, useState, useTransition } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Input";
import { Clock } from "@/components/layout/Clock";
import { useToast } from "@/components/ui/Toaster";
import { registerVehicleEntry } from "@/actions/vehicle-actions";
import { getEntryTicket } from "@/actions/ticket-actions";
import { usePlateStatusLookup } from "@/hooks/usePlateStatusLookup";
import { ClientTypeCard } from "@/components/parking/ClientTypeCard";
import { PrintTicketModal } from "@/components/tickets/PrintTicketModal";
import { isFlatRateEligibleNow } from "@/lib/tariffs";
import { formatCurrency } from "@/lib/format";
import { formatShortTimeLima } from "@/lib/datetime";
import type { FlatRatePeriod } from "@/types/database";
import type { EntryTicket, FlatRateCapacity, FlatRateSettings } from "@/types/domain";

type TariffMode = "HORA" | "PLANA";

/** Tipo por defecto de todo ingreso rápido — el colaborador ya no lo
 * selecciona acá; se corrige después con "✏️ Corregir datos" si hace falta
 * (ver CorrectEntryDataModal). Mismo valor por defecto que ya usaba el
 * <select> de tipo de vehículo. */
const DEFAULT_VEHICLE_TYPE = "AUTO" as const;

interface EntryResult {
  plate: string;
  spotCode: string;
  entryAt: string;
}

/**
 * Ingreso simplificado: el colaborador/admin solo escribe la PLACA y, si
 * corresponde, elige la modalidad de tarifa. El espacio lo asigna
 * automáticamente register_vehicle_entry() (ver 0027) — ya no hay que
 * tocar un estacionamiento en la grilla. El tipo de vehículo queda en
 * "Auto" por defecto y se corrige después si hace falta.
 */
export function VehicleEntryModal({
  open,
  onClose,
  flatRateSettings,
  flatRateCapacity,
}: {
  open: boolean;
  onClose: () => void;
  flatRateSettings: FlatRateSettings;
  flatRateCapacity: FlatRateCapacity;
}) {
  const { showToast } = useToast();
  const [plate, setPlate] = useState("");
  const [tariffMode, setTariffMode] = useState<TariffMode>("HORA");
  const [flatPeriod, setFlatPeriod] = useState<FlatRatePeriod>("PLANA_DIA");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<EntryResult | null>(null);
  const [pendingTicket, setPendingTicket] = useState<EntryTicket | null>(null);
  const [ticketToPrint, setTicketToPrint] = useState<EntryTicket | null>(null);
  const { result: plateStatus, loading: lookupLoading } = usePlateStatusLookup(plate);
  // Guardia síncrona contra doble/triple clic en "Registrar ingreso": actúa
  // desde el primer instante del submit, antes de que React re-renderice
  // con `pending`. La protección real contra duplicados vive en la base de
  // datos (índice único parcial sobre placa_normalizada activa + lock de
  // fila del estacionamiento en register_vehicle_entry) — esto es solo
  // para que el colaborador no vea un error de "ya ocupado" por su propio
  // doble clic.
  const submittingRef = useRef(false);

  const isFreeEntry =
    plateStatus?.kind === "AUTORIZADO" || (plateStatus?.kind === "ABONADO" && plateStatus.displayStatus === "ACTIVO");
  // DÍA conserva EXACTAMENTE la misma ventana horaria que ya tenía la
  // única tarifa plana que existía antes (ver 0023). NOCHE es nueva y no
  // depende de la hora actual — solo de que la tarifa plana esté activa.
  const dayEligibleNow = isFlatRateEligibleNow(flatRateSettings.horaLimite, flatRateSettings.diasAplicacion, new Date());
  const flatRateHasCapacity = flatRateCapacity.disponibles > 0;
  const flatRateOfferable = flatRateSettings.activo && !isFreeEntry;

  const close = () => {
    setPlate("");
    setTariffMode("HORA");
    setError(null);
    setResult(null);
    setPendingTicket(null);
    onClose();
  };

  const selectFlatRate = () => {
    setTariffMode("PLANA");
    setFlatPeriod(dayEligibleNow ? "PLANA_DIA" : "PLANA_NOCHE");
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current) return;
    setError(null);

    submittingRef.current = true;
    startTransition(async () => {
      try {
        const useFlatRate = tariffMode === "PLANA" && flatRateOfferable && flatRateHasCapacity;
        const res = await registerVehicleEntry({
          plate,
          vehicleType: DEFAULT_VEHICLE_TYPE,
          useFlatRate,
          flatRatePeriod: useFlatRate ? flatPeriod : null,
        });
        if (res.error || !res.data) {
          setError(res.error ?? "No se pudo registrar el ingreso.");
          return;
        }

        const { entryId, spotCode, entryAt } = res.data;
        setResult({ plate: plate.trim().toUpperCase(), spotCode: spotCode || "—", entryAt });

        // Ticket solo para HORA/PLANA: get_entry_ticket() devuelve null para
        // abonado/autorizado, que nunca deben mostrar el paso de impresión.
        const ticketResult = await getEntryTicket(entryId);
        if (ticketResult.data) {
          setPendingTicket(ticketResult.data);
        }
      } finally {
        submittingRef.current = false;
      }
    });
  };

  const onFinish = () => {
    if (pendingTicket) {
      setTicketToPrint(pendingTicket);
    } else {
      showToast("Ingreso registrado correctamente.", "success");
    }
    close();
  };

  return (
    <>
    <Modal open={open} onClose={close} maxWidth="max-w-md">
      {!result ? (
        <form onSubmit={onSubmit} className="p-6">
          <div className="mb-5 flex items-start justify-between">
            <h3 className="text-xl font-bold text-foreground">🚗 Registrar ingreso</h3>
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

            <ClientTypeCard plateEntered={plate.trim().length >= 5} loading={lookupLoading} result={plateStatus} />

            {!isFreeEntry && (
              <div>
                <p className="mb-1.5 text-sm font-medium text-foreground">Tarifa</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setTariffMode("HORA")}
                    className={`h-11 rounded-xl border-2 text-sm font-bold transition-colors ${
                      tariffMode === "HORA"
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-surface text-foreground hover:bg-surface-2"
                    }`}
                  >
                    Por hora
                  </button>
                  <button
                    type="button"
                    onClick={selectFlatRate}
                    disabled={!flatRateOfferable}
                    className={`h-11 rounded-xl border-2 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                      tariffMode === "PLANA"
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-surface text-foreground hover:bg-surface-2"
                    }`}
                  >
                    Tarifa plana
                  </button>
                </div>

                {tariffMode === "PLANA" && flatRateOfferable && (
                  <div className="mt-2">
                    {flatRateHasCapacity ? (
                      <>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setFlatPeriod("PLANA_DIA")}
                            disabled={!dayEligibleNow}
                            className={`h-11 rounded-xl border-2 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                              flatPeriod === "PLANA_DIA"
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-border bg-surface text-foreground hover:bg-surface-2"
                            }`}
                          >
                            ☀ Día
                          </button>
                          <button
                            type="button"
                            onClick={() => setFlatPeriod("PLANA_NOCHE")}
                            className={`h-11 rounded-xl border-2 text-sm font-bold transition-colors ${
                              flatPeriod === "PLANA_NOCHE"
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-border bg-surface text-foreground hover:bg-surface-2"
                            }`}
                          >
                            ☾ Noche
                          </button>
                        </div>
                        {!dayEligibleNow && (
                          <p className="mt-1.5 text-xs text-muted">
                            Tarifa plana día no disponible en este horario — se ofrece solo tarifa plana noche.
                          </p>
                        )}
                        <p className="mt-1.5 text-xs font-semibold text-foreground">
                          {formatCurrency(flatPeriod === "PLANA_NOCHE" ? flatRateSettings.precioNoche : flatRateSettings.precio)}
                          {" · "}Cupos: {flatRateCapacity.activos} / {flatRateCapacity.cupoMaximo}
                        </p>
                      </>
                    ) : (
                      <div className="rounded-xl border border-danger/30 bg-danger-bg px-4 py-3">
                        <p className="text-sm font-bold text-danger">🔴 TARIFA PLANA COMPLETA</p>
                        <p className="text-xs text-danger">
                          {flatRateCapacity.activos} / {flatRateCapacity.cupoMaximo} vehículos — sin cupos disponibles
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
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
      ) : (
        <div className="flex flex-col items-center gap-3 p-8 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-success-bg text-3xl text-success">
            ✓
          </div>
          <p className="text-lg font-bold text-foreground">Ingreso registrado correctamente</p>

          <dl className="mt-2 flex w-full flex-col gap-2 rounded-2xl bg-surface-2 p-4 text-left text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-muted">Placa</dt>
              <dd className="font-bold text-foreground">{result.plate}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted">Espacio asignado</dt>
              <dd className="font-bold text-foreground">{result.spotCode}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted">Hora</dt>
              <dd className="font-mono font-bold text-foreground">{formatShortTimeLima(result.entryAt)}</dd>
            </div>
          </dl>

          <Button size="lg" fullWidth className="mt-4" onClick={onFinish}>
            {pendingTicket ? "Continuar e imprimir ticket" : "Listo"}
          </Button>
        </div>
      )}
    </Modal>

    <PrintTicketModal ticket={ticketToPrint} onClose={() => setTicketToPrint(null)} />
    </>
  );
}
