import "server-only";
import { createClient } from "@/lib/supabase/server";
import { normalizePlate } from "@/lib/plate";
import type { PaymentMethod, TariffType, VehicleType } from "@/types/database";

export interface HistoryFilters {
  dateFrom?: string;
  dateTo?: string;
  plate?: string;
  vehicleType?: VehicleType;
  workerId?: string;
  paymentMethod?: PaymentMethod;
  spotCode?: string;
  tariffType?: TariffType;
}

export interface HistoryRow {
  exitId: string;
  plate: string;
  spotCode: string;
  vehicleType: VehicleType;
  entryAt: string;
  exitAt: string;
  durationMinutes: number;
  tariffApplied: number;
  tariffType: TariffType;
  toleranceMinutesApplied: number | null;
  amount: number;
  paymentMethod: PaymentMethod | null;
  workerId: string;
  workerName: string;
}

interface RawHistoryRow {
  exit_id: string;
  plate: string;
  spot_code: string;
  vehicle_type: VehicleType;
  entry_at: string;
  exit_at: string;
  duration_minutes: number;
  tariff_applied: number;
  tariff_type: TariffType;
  tolerance_minutes_applied: number | null;
  amount: number;
  payment_method: PaymentMethod | null;
  worker_id: string;
  worker_name: string;
}

export async function getVehicleHistory(filters: HistoryFilters = {}): Promise<HistoryRow[]> {
  const supabase = await createClient();
  let query = supabase.from("v_vehicle_history").select("*").order("exit_at", { ascending: false }).limit(200);

  if (filters.dateFrom) query = query.gte("exit_at", `${filters.dateFrom}T00:00:00-05:00`);
  if (filters.dateTo) query = query.lte("exit_at", `${filters.dateTo}T23:59:59-05:00`);
  if (filters.plate) query = query.ilike("plate_normalizada", `%${normalizePlate(filters.plate)}%`);
  if (filters.vehicleType) query = query.eq("vehicle_type", filters.vehicleType);
  if (filters.workerId) query = query.eq("worker_id", filters.workerId);
  if (filters.paymentMethod) query = query.eq("payment_method", filters.paymentMethod);
  if (filters.spotCode) query = query.eq("spot_code", filters.spotCode);
  if (filters.tariffType) query = query.eq("tariff_type", filters.tariffType);

  const { data, error } = await query.returns<RawHistoryRow[]>();
  if (error) throw new Error(error.message);

  return (data ?? []).map((r) => ({
    exitId: r.exit_id,
    plate: r.plate,
    spotCode: r.spot_code,
    vehicleType: r.vehicle_type,
    entryAt: r.entry_at,
    exitAt: r.exit_at,
    durationMinutes: r.duration_minutes,
    tariffApplied: Number(r.tariff_applied),
    tariffType: r.tariff_type,
    toleranceMinutesApplied: r.tolerance_minutes_applied,
    amount: Number(r.amount),
    paymentMethod: r.payment_method,
    workerId: r.worker_id,
    workerName: r.worker_name,
  }));
}
