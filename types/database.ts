// Tipos de dominio que reflejan los ENUMs y columnas de
// supabase/migrations/0001_init.sql. Los clientes de Supabase se crean SIN
// el genérico Database<> de supabase-js (ver lib/supabase/*.ts): cada
// función de services/actions tipa su propio resultado con interfaces
// locales y `.returns<T>()`, lo cual es más simple de mantener que sincronizar
// a mano la forma exacta que exige @supabase/postgrest-js.

export type UserRole = "ADMIN" | "TRABAJADOR";

export type VehicleType =
  | "AUTO"
  | "CAMIONETA"
  | "VAN"
  | "MOTO"
  | "FURGONETA"
  | "CAMIONCITO"
  | "OTRO";

export type SpotStatus = "LIBRE" | "OCUPADO";

export type EntryStatus = "ACTIVO" | "FINALIZADO";

export type PaymentMethod = "EFECTIVO" | "YAPE" | "PLIN" | "TRANSFERENCIA";

export type MovementType = "INGRESO" | "EGRESO";

export type MovementSource = "VEHICULO" | "BANO" | "OTRO";

export type RegisterStatus = "ABIERTA" | "CERRADA";

/** "PLANA" se conserva solo por filas históricas anteriores a la
 * distinción día/noche — todo código nuevo usa PLANA_DIA/PLANA_NOCHE. */
export type TariffType = "HORA" | "ABONADO" | "PLANA" | "PLANA_DIA" | "PLANA_NOCHE" | "AUTORIZADO";

/** Las dos modalidades que un colaborador puede elegir al ingreso. */
export type FlatRatePeriod = "PLANA_DIA" | "PLANA_NOCHE";

export type SubscriberStatus = "ACTIVO" | "VENCIDO" | "SUSPENDIDO" | "CANCELADO";

export type AuthorizedVehicleStatus = "ACTIVO" | "INACTIVO";

export type TicketStatus = "ACTIVE" | "USED" | "CANCELLED" | "VOID";

/** "PLANA" se conserva solo por tickets históricos anteriores a la
 * distinción día/noche. */
export type TicketTariffType = "HORA" | "PLANA" | "PLANA_DIA" | "PLANA_NOCHE";

export interface CashRegisterSummary {
  efectivo: number;
  yape: number;
  plin: number;
  transferencia: number;
  total_ingresos: number;
  total_egresos: number;
}

export interface DashboardSnapshot {
  total_espacios: number;
  disponibles: number;
  ocupados: number;
  autorizados_ocupados: number;
  vehiculos_dia: number;
  banos_dia: number;
  ingresos_dia: number;
  egresos_dia: number;
  caja_abierta: boolean;
  caja_actual: number;
}
