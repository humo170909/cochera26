import type {
  FlatRatePeriod,
  PaymentMethod,
  SpotStatus,
  TariffType,
  TicketStatus,
  TicketTariffType,
  VehicleType,
} from "@/types/database";

export interface ActiveEntryInfo {
  id: string;
  plate: string;
  vehicleType: VehicleType;
  entryAt: string;
  registeredByName: string;
  coveredBySubscription: boolean;
  subscriberName: string | null;
  flatRateReserved: boolean;
  /** Solo cuando flatRateReserved: cuál de las dos modalidades se eligió al ingreso. */
  flatRatePeriod: FlatRatePeriod | null;
  /** Precio de tarifa plana fotografiado al ingreso (null si no aplica). La salida SIEMPRE usa este valor. */
  flatRatePriceSnapshot: number | null;
  isAuthorized: boolean;
  authorizedOwnerName: string | null;
}

/** Espacio fijo reservado a un abonado activo — solo tiene sentido cuando
 * el espacio está LIBRE (si está OCUPADO ya se ve el dueño en activeEntry). */
export interface SpotReservation {
  plate: string;
  nombreCompleto: string;
}

export interface ParkingSpotWithEntry {
  id: string;
  code: string;
  status: SpotStatus;
  spotType: string;
  activeEntry: ActiveEntryInfo | null;
  reservedFor: SpotReservation | null;
}

export interface VehicleExitDetail {
  id: string;
  entryId: string;
  exitAt: string;
  amount: number;
  tariffApplied: number;
  durationMinutes: number;
  paymentMethod: PaymentMethod | null;
  tariffType: TariffType;
  toleranceMinutesApplied: number | null;
}

export interface ToleranceSettings {
  tolerCortaMinutos: number;
  tolerLargaMinutos: number;
  umbralLargaHoras: number;
}

export interface FlatRateSettings {
  /** Precio de la tarifa plana DÍA (sujeta a horaLimite/diasAplicacion). */
  precio: number;
  /** Precio de la tarifa plana NOCHE (sin restricción horaria). */
  precioNoche: number;
  horaLimite: string;
  diasAplicacion: number[];
  activo: boolean;
  cupoMaximo: number;
}

export interface FlatRateCapacity {
  cupoMaximo: number;
  activos: number;
  disponibles: number;
}

export interface SubscriberPlanSettings {
  precioMensual: number;
  horaLimite: string;
  periodoMeses: number;
  diasAlertaVencimiento: number;
}

/** ACTIVO/SUSPENDIDO/CANCELADO vienen de subscribers.estado; VENCIDO y
 * POR_VENCER se calculan a partir de fecha_vencimiento y nunca se guardan. */
export type SubscriberDisplayStatus = "ACTIVO" | "POR_VENCER" | "VENCIDO" | "SUSPENDIDO" | "CANCELADO";

/** ACTIVO/INACTIVO viene de authorized_vehicles.estado (los INACTIVO ni
 * siquiera se devuelven: lookup_plate_status() los filtra para que la
 * búsqueda pase a revisar abonado, igual que un abonado vencido cae a
 * cliente normal). */
export type AuthorizedDisplayStatus = "ACTIVO";

/** Resultado del lookup unificado (lookup_plate_status) usado en el
 * formulario de ingreso. Prioridad: AUTORIZADO > ABONADO > cliente normal
 * (kind = null). Nunca se re-implementa esta prioridad en el cliente: el
 * RPC ya la resuelve en un único round-trip. */
export type PlateStatusKind = "AUTORIZADO" | "ABONADO" | null;

export interface PlateStatusResult {
  kind: PlateStatusKind;
  id: string | null;
  nombre: string | null;
  /** Solo aplica cuando kind === 'ABONADO'. */
  fechaVencimiento: string | null;
  /** Para AUTORIZADO siempre 'ACTIVO'; para ABONADO: ACTIVO/VENCIDO/SUSPENDIDO/CANCELADO. */
  displayStatus: string | null;
}

/** Ticket de ingreso (solo existe para HORA/PLANA — get_entry_ticket()
 * devuelve null si el ingreso fue abonado/autorizado). validationToken es
 * el contenido crudo del QR; validationCode es el código corto para
 * respaldo manual. */
export interface EntryTicket {
  id: string;
  ticketCode: string;
  validationCode: string;
  validationToken: string;
  plate: string;
  vehicleType: VehicleType;
  spotCode: string;
  tariffType: TicketTariffType;
  tariffAmount: number;
  status: TicketStatus;
  issuedAt: string;
}

/** Ticket/recibo de salida — se arma en el cliente con datos que YA
 * devolvió register_vehicle_exit() (nunca se recalcula el monto ni la
 * tarifa). No existe una tabla propia: a diferencia del ticket de ingreso
 * (anticopia, controla el acceso), este es solo un comprobante impreso
 * después de que el cobro ya quedó registrado, sin implicancia de
 * seguridad — por eso no necesita persistirse ni tener un código único
 * verificable. `ticketCode` reutiliza el código del ticket de ingreso
 * cuando existió (HORA/PLANA), o cae a uno derivado del id de la salida
 * para abonado/autorizado (que nunca tuvieron ticket de ingreso). */
export interface ExitTicket {
  ticketCode: string;
  plate: string;
  spotCode: string;
  vehicleType: VehicleType;
  entryAt: string;
  exitAt: string;
  durationMinutes: number;
  tariffType: TariffType;
  tariffApplied: number;
  amount: number;
  paymentMethod: PaymentMethod | null;
}

export type TicketValidationOutcome =
  | "VALID"
  | "NOT_FOUND"
  | "ALREADY_USED"
  | "CANCELLED"
  | "WRONG_VEHICLE";

export interface TicketValidationResult {
  outcome: TicketValidationOutcome;
  ticketId: string | null;
  entryId: string | null;
  plate: string | null;
  spotCode: string | null;
  status: TicketStatus | null;
}
