"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/Card";
import { Input, Select } from "@/components/ui/Input";
import { EditSubscriberModal } from "@/components/abonados/EditSubscriberModal";
import { RegisterPaymentModal } from "@/components/abonados/RegisterPaymentModal";
import { DeleteSubscriberModal } from "@/components/abonados/DeleteSubscriberModal";
import { ReactivateSubscriberButton } from "@/components/abonados/ReactivateSubscriberButton";
import { formatCurrency } from "@/lib/format";
import { formatDateOnly } from "@/lib/datetime";
import { normalizePlate } from "@/lib/plate";
import { VEHICLE_TYPE_LABELS, SUBSCRIBER_STATUS_LABELS, SUBSCRIBER_STATUS_TONE } from "@/lib/constants";
import type { SubscriberRow } from "@/services/subscribers";
import type { UserRole } from "@/types/database";
import type { SubscriberDisplayStatus } from "@/types/domain";

const ESTADO_FILTER_OPTIONS: SubscriberDisplayStatus[] = ["ACTIVO", "POR_VENCER", "VENCIDO", "SUSPENDIDO", "CANCELADO"];

export function SubscribersTable({
  subscribers,
  role,
}: {
  subscribers: SubscriberRow[];
  role: UserRole;
}) {
  const [search, setSearch] = useState("");
  const [estadoFilter, setEstadoFilter] = useState<"" | "TODOS" | SubscriberDisplayStatus>("");
  const isAdmin = role === "ADMIN";

  const filtered = useMemo(() => {
    let rows = subscribers;

    // Por defecto (y siempre para el trabajador), los abonados eliminados
    // (CANCELADO) no aparecen en la lista principal.
    if (!isAdmin || estadoFilter === "") {
      rows = rows.filter((s) => s.effectiveStatus !== "CANCELADO");
    } else if (estadoFilter !== "TODOS") {
      rows = rows.filter((s) => s.effectiveStatus === estadoFilter);
    }

    const q = search.trim().toUpperCase();
    if (q) {
      const qNorm = normalizePlate(q);
      rows = rows.filter(
        (s) => normalizePlate(s.plate).includes(qNorm) || s.nombreCompleto.toUpperCase().includes(q)
      );
    }
    return rows;
  }, [subscribers, search, estadoFilter, isAdmin]);

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3 border-b border-border p-4">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por placa o nombre..."
          className="max-w-sm"
        />
        {isAdmin && (
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted">Estado</label>
            <Select
              value={estadoFilter}
              onChange={(e) => setEstadoFilter(e.target.value as typeof estadoFilter)}
              className="w-44"
            >
              <option value="">Activos (por defecto)</option>
              <option value="TODOS">Todos</option>
              {ESTADO_FILTER_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {SUBSCRIBER_STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
          </div>
        )}
      </div>
      {filtered.length === 0 && (
        <p className="px-5 py-10 text-center text-muted">No se encontraron abonados.</p>
      )}

      {/* Desktop / tablet: tabla */}
      {filtered.length > 0 && (
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-5 py-3">Cliente</th>
                <th className="px-5 py-3">Placa</th>
                {isAdmin && <th className="px-5 py-3">Vehículo</th>}
                {isAdmin && <th className="px-5 py-3">Hora límite</th>}
                <th className="px-5 py-3">Vencimiento</th>
                <th className="px-5 py-3">Días restantes</th>
                {isAdmin && <th className="px-5 py-3">Monto</th>}
                <th className="px-5 py-3">Estado</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => {
                const isCancelled = s.effectiveStatus === "CANCELADO";
                return (
                  <tr key={s.id} className="border-b border-border last:border-0">
                    <td className="px-5 py-3">
                      <p className="font-semibold text-foreground">{s.nombreCompleto}</p>
                      {s.telefono && <p className="text-xs text-muted">{s.telefono}</p>}
                    </td>
                    <td className="px-5 py-3 font-semibold text-foreground">{s.plate}</td>
                    {isAdmin && <td className="px-5 py-3 text-foreground">{VEHICLE_TYPE_LABELS[s.vehicleType]}</td>}
                    {isAdmin && <td className="px-5 py-3 text-foreground">{s.horaLimite}</td>}
                    <td className="px-5 py-3 text-foreground">{formatDateOnly(s.fechaVencimiento)}</td>
                    <td className="px-5 py-3 text-foreground">
                      {s.diasRestantes >= 0 ? `${s.diasRestantes} días` : `Venció hace ${Math.abs(s.diasRestantes)} días`}
                    </td>
                    {isAdmin && <td className="px-5 py-3 font-semibold text-foreground">{formatCurrency(s.monto)}</td>}
                    <td className="px-5 py-3">
                      <Badge tone={SUBSCRIBER_STATUS_TONE[s.effectiveStatus]}>
                        {SUBSCRIBER_STATUS_LABELS[s.effectiveStatus]}
                      </Badge>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap justify-end gap-2">
                        {!isCancelled && <RegisterPaymentModal subscriber={s} />}
                        {isAdmin && !isCancelled && <EditSubscriberModal subscriber={s} />}
                        {isAdmin && !isCancelled && <DeleteSubscriberModal subscriber={s} />}
                        {isAdmin && isCancelled && <ReactivateSubscriberButton subscriber={s} />}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Mobile: tarjetas */}
      {filtered.length > 0 && (
        <div className="flex flex-col gap-3 p-4 md:hidden">
          {filtered.map((s) => {
            const isCancelled = s.effectiveStatus === "CANCELADO";
            return (
              <div key={s.id} className="rounded-2xl border border-border bg-surface-2 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-foreground">{s.nombreCompleto}</p>
                    {s.telefono && <p className="text-xs text-muted">{s.telefono}</p>}
                  </div>
                  <Badge tone={SUBSCRIBER_STATUS_TONE[s.effectiveStatus]}>
                    {SUBSCRIBER_STATUS_LABELS[s.effectiveStatus]}
                  </Badge>
                </div>

                <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
                  <Row label="Placa" value={s.plate} />
                  {isAdmin && <Row label="Vehículo" value={VEHICLE_TYPE_LABELS[s.vehicleType]} />}
                  {isAdmin && <Row label="Hora límite" value={s.horaLimite} />}
                  <Row label="Vence" value={formatDateOnly(s.fechaVencimiento)} />
                  <Row
                    label="Días"
                    value={s.diasRestantes >= 0 ? `${s.diasRestantes} días` : `Venció hace ${Math.abs(s.diasRestantes)}d`}
                  />
                  {isAdmin && <Row label="Monto" value={formatCurrency(s.monto)} />}
                </dl>

                <div className="mt-3 flex flex-col gap-2">
                  {!isCancelled && (
                    <div className="grid grid-cols-2 gap-2">
                      <RegisterPaymentModal subscriber={s} fullWidth />
                      {isAdmin && <EditSubscriberModal subscriber={s} fullWidth />}
                    </div>
                  )}
                  {isAdmin && !isCancelled && (
                    <div className="grid grid-cols-1">
                      <DeleteSubscriberModal subscriber={s} fullWidth />
                    </div>
                  )}
                  {isAdmin && isCancelled && <ReactivateSubscriberButton subscriber={s} fullWidth />}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="font-medium text-foreground">{value}</dd>
    </div>
  );
}
