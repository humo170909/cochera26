"use client";

import { useRealtimeRefresh } from "@/hooks/useRealtimeRefresh";

const WATCHED_TABLES = [
  "parking_spots",
  "vehicle_exits",
  "restroom_uses",
  "cash_movements",
  "cash_registers",
];

/** Componente invisible: mantiene el dashboard sincronizado entre terminales. */
export function DashboardRealtimeRefresher() {
  useRealtimeRefresh(WATCHED_TABLES);
  return null;
}
