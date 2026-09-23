import "server-only";
import { createClient } from "@/lib/supabase/server";
import { businessDateLima } from "@/lib/datetime";
import { normalizePlate } from "@/lib/plate";
import type { PaymentMethod, SubscriberStatus, VehicleType } from "@/types/database";
import type { SubscriberDisplayStatus } from "@/types/domain";

export interface SubscriberRow {
  id: string;
  nombreCompleto: string;
  documento: string | null;
  telefono: string | null;
  plate: string;
  vehicleType: VehicleType;
  fechaInicio: string;
  fechaVencimiento: string;
  horaLimite: string;
  monto: number;
  estado: SubscriberStatus;
  observaciones: string | null;
  /** Estado real considerando la fecha de hoy y el umbral de alerta, sin depender de que el admin lo actualice manualmente. */
  effectiveStatus: SubscriberDisplayStatus;
  /** Negativo si ya venció. */
  diasRestantes: number;
  /** true si tiene un vehículo actualmente dentro de la cochera (bloquea eliminar). */
  hasActiveVehicle: boolean;
  assignedSpotId: string | null;
  /** null si no tiene espacio asignado ("Sin espacio asignado" en la UI). */
  assignedSpotCode: string | null;
}

interface RawSubscriberRow {
  id: string;
  nombre_completo: string;
  documento: string | null;
  telefono: string | null;
  plate: string;
  vehicle_type: VehicleType;
  fecha_inicio: string;
  fecha_vencimiento: string;
  hora_limite: string;
  monto: number;
  estado: SubscriberStatus;
  observaciones: string | null;
  assigned_spot_id: string | null;
  assigned_spot: { code: string } | null;
}

function daysBetween(today: string, target: string): number {
  const a = new Date(today + "T00:00:00Z").getTime();
  const b = new Date(target + "T00:00:00Z").getTime();
  return Math.round((b - a) / 86_400_000);
}

function computeEffectiveStatus(
  row: RawSubscriberRow,
  today: string,
  diasAlerta: number
): SubscriberDisplayStatus {
  if (row.estado === "SUSPENDIDO" || row.estado === "CANCELADO") return row.estado;
  if (row.fecha_vencimiento < today) return "VENCIDO";
  if (daysBetween(today, row.fecha_vencimiento) <= diasAlerta) return "POR_VENCER";
  return "ACTIVO";
}

const SUBSCRIBER_SELECT =
  "id, nombre_completo, documento, telefono, plate, vehicle_type, fecha_inicio, fecha_vencimiento, hora_limite, monto, estado, observaciones, assigned_spot_id, assigned_spot:parking_spots!subscribers_assigned_spot_id_fkey ( code )";

function mapSubscriber(
  s: RawSubscriberRow,
  today: string,
  diasAlerta: number,
  activeSubscriberIds: Set<string>
): SubscriberRow {
  return {
    id: s.id,
    nombreCompleto: s.nombre_completo,
    documento: s.documento,
    telefono: s.telefono,
    plate: s.plate,
    vehicleType: s.vehicle_type,
    fechaInicio: s.fecha_inicio,
    fechaVencimiento: s.fecha_vencimiento,
    horaLimite: s.hora_limite.slice(0, 5),
    monto: Number(s.monto),
    estado: s.estado,
    observaciones: s.observaciones,
    effectiveStatus: computeEffectiveStatus(s, today, diasAlerta),
    diasRestantes: daysBetween(today, s.fecha_vencimiento),
    hasActiveVehicle: activeSubscriberIds.has(s.id),
    assignedSpotId: s.assigned_spot_id,
    assignedSpotCode: s.assigned_spot?.code ?? null,
  };
}

export async function getSubscribers(diasAlertaVencimiento = 5): Promise<SubscriberRow[]> {
  const supabase = await createClient();
  const [{ data, error }, { data: activeEntries, error: activeError }] = await Promise.all([
    supabase.from("subscribers").select(SUBSCRIBER_SELECT).order("created_at", { ascending: false }).returns<RawSubscriberRow[]>(),
    supabase.from("vehicle_entries").select("subscriber_id").eq("status", "ACTIVO").not("subscriber_id", "is", null),
  ]);

  if (error) throw new Error(error.message);
  if (activeError) throw new Error(activeError.message);

  const activeSubscriberIds = new Set((activeEntries ?? []).map((e) => e.subscriber_id as string));
  const today = businessDateLima();
  return (data ?? []).map((s) => mapSubscriber(s, today, diasAlertaVencimiento, activeSubscriberIds));
}

export interface SubscriberPaymentRow {
  id: string;
  subscriberId: string;
  subscriberName: string;
  plate: string;
  paidAt: string;
  amount: number;
  paymentMethod: PaymentMethod;
  periodStart: string;
  periodEnd: string;
  registeredByName: string;
  observation: string | null;
  estado: string;
}

interface RawPaymentRow {
  id: string;
  subscriber_id: string;
  paid_at: string;
  amount: number;
  payment_method: PaymentMethod;
  period_start: string;
  period_end: string;
  observation: string | null;
  estado: string;
  subscriber: { nombre_completo: string; plate: string } | null;
  registrar: { nombre: string; apellido: string } | null;
}

export interface SubscriberPaymentFilters {
  dateFrom?: string;
  dateTo?: string;
  plate?: string;
  workerId?: string;
  paymentMethod?: PaymentMethod;
}

export async function getSubscriberPayments(
  filters: SubscriberPaymentFilters = {}
): Promise<SubscriberPaymentRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("subscriber_payments")
    .select(
      `id, subscriber_id, paid_at, amount, payment_method, period_start, period_end, observation, estado, registered_by,
       subscriber:subscribers!subscriber_payments_subscriber_id_fkey ( nombre_completo, plate ),
       registrar:profiles!subscriber_payments_registered_by_fkey ( nombre, apellido )`
    )
    .order("paid_at", { ascending: false })
    .limit(300);

  if (filters.dateFrom) query = query.gte("paid_at", `${filters.dateFrom}T00:00:00-05:00`);
  if (filters.dateTo) query = query.lte("paid_at", `${filters.dateTo}T23:59:59-05:00`);
  if (filters.workerId) query = query.eq("registered_by", filters.workerId);
  if (filters.paymentMethod) query = query.eq("payment_method", filters.paymentMethod);

  const { data, error } = await query.returns<RawPaymentRow[]>();
  if (error) throw new Error(error.message);

  let rows = (data ?? []).map((p) => ({
    id: p.id,
    subscriberId: p.subscriber_id,
    subscriberName: p.subscriber?.nombre_completo ?? "—",
    plate: p.subscriber?.plate ?? "—",
    paidAt: p.paid_at,
    amount: Number(p.amount),
    paymentMethod: p.payment_method,
    periodStart: p.period_start,
    periodEnd: p.period_end,
    registeredByName: `${p.registrar?.nombre ?? ""} ${p.registrar?.apellido ?? ""}`.trim(),
    observation: p.observation,
    estado: p.estado,
  }));

  if (filters.plate) {
    const needle = normalizePlate(filters.plate);
    rows = rows.filter((r) => normalizePlate(r.plate).includes(needle));
  }

  return rows;
}
