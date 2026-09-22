import "server-only";
import { getVehicleHistory } from "@/services/history";
import { getRestroomUsesInRange } from "@/services/restroom";
import { VEHICLE_TYPES, PAYMENT_METHODS } from "@/lib/constants";
import type { PaymentMethod, VehicleType } from "@/types/database";

export interface ReportFilters {
  dateFrom: string;
  dateTo: string;
}

export interface ReportData {
  totalVehiculos: number;
  totalIngresosVehiculos: number;
  totalBanos: number;
  totalIngresosBanos: number;
  totalIngresos: number;
  porTipoVehiculo: { tipo: VehicleType; cantidad: number; monto: number }[];
  porMetodoPago: { metodo: PaymentMethod; cantidad: number; monto: number }[];
  porDia: { fecha: string; vehiculos: number; monto: number }[];
  porTrabajador: { trabajador: string; vehiculos: number; monto: number }[];
}

export async function getReportData(filters: ReportFilters): Promise<ReportData> {
  const [history, restroom] = await Promise.all([
    getVehicleHistory({ dateFrom: filters.dateFrom, dateTo: filters.dateTo }),
    getRestroomUsesInRange(filters.dateFrom, filters.dateTo),
  ]);

  const totalIngresosVehiculos = history.reduce((sum, r) => sum + r.amount, 0);
  const totalIngresosBanos = restroom.reduce((sum, r) => sum + r.amount, 0);

  const porTipoVehiculo = VEHICLE_TYPES.map((tipo) => {
    const rows = history.filter((r) => r.vehicleType === tipo);
    return { tipo, cantidad: rows.length, monto: rows.reduce((s, r) => s + r.amount, 0) };
  }).filter((r) => r.cantidad > 0);

  const porMetodoPago = PAYMENT_METHODS.map((metodo) => {
    const vehiculoRows = history.filter((r) => r.paymentMethod === metodo);
    const banoRows = restroom.filter((r) => r.paymentMethod === metodo);
    return {
      metodo,
      cantidad: vehiculoRows.length + banoRows.length,
      monto: vehiculoRows.reduce((s, r) => s + r.amount, 0) + banoRows.reduce((s, r) => s + r.amount, 0),
    };
  }).filter((r) => r.cantidad > 0);

  const dayMap = new Map<string, { vehiculos: number; monto: number }>();
  for (const r of history) {
    const day = r.exitAt.slice(0, 10);
    const current = dayMap.get(day) ?? { vehiculos: 0, monto: 0 };
    current.vehiculos += 1;
    current.monto += r.amount;
    dayMap.set(day, current);
  }
  const porDia = Array.from(dayMap.entries())
    .map(([fecha, v]) => ({ fecha, ...v }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));

  const workerMap = new Map<string, { vehiculos: number; monto: number }>();
  for (const r of history) {
    const current = workerMap.get(r.workerName || "—") ?? { vehiculos: 0, monto: 0 };
    current.vehiculos += 1;
    current.monto += r.amount;
    workerMap.set(r.workerName || "—", current);
  }
  const porTrabajador = Array.from(workerMap.entries())
    .map(([trabajador, v]) => ({ trabajador, ...v }))
    .sort((a, b) => b.monto - a.monto);

  return {
    totalVehiculos: history.length,
    totalIngresosVehiculos,
    totalBanos: restroom.length,
    totalIngresosBanos,
    totalIngresos: totalIngresosVehiculos + totalIngresosBanos,
    porTipoVehiculo,
    porMetodoPago,
    porDia,
    porTrabajador,
  };
}
