import type {
  MovementType,
  PaymentMethod,
  SubscriberStatus,
  TariffType,
  UserRole,
  VehicleType,
} from "@/types/database";
import type { SubscriberDisplayStatus } from "@/types/domain";

export const VEHICLE_TYPES: VehicleType[] = [
  "AUTO",
  "CAMIONETA",
  "VAN",
  "MOTO",
  "FURGONETA",
  "CAMIONCITO",
  "OTRO",
];

export const VEHICLE_TYPE_LABELS: Record<VehicleType, string> = {
  AUTO: "Auto",
  CAMIONETA: "Camioneta",
  VAN: "Van",
  MOTO: "Moto",
  FURGONETA: "Furgoneta",
  CAMIONCITO: "Camioncito",
  OTRO: "Otro",
};

export const PAYMENT_METHODS: PaymentMethod[] = [
  "EFECTIVO",
  "YAPE",
  "PLIN",
  "TRANSFERENCIA",
];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  EFECTIVO: "Efectivo",
  YAPE: "Yape",
  PLIN: "Plin",
  TRANSFERENCIA: "Transferencia",
};

export const MOVEMENT_TYPE_LABELS: Record<MovementType, string> = {
  INGRESO: "Ingreso",
  EGRESO: "Egreso",
};

export const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: "Administrador",
  TRABAJADOR: "Trabajador",
};

export const TOTAL_PARKING_SPOTS = 31;

export const SUBSCRIBER_STATUS_LABELS: Record<SubscriberDisplayStatus, string> = {
  ACTIVO: "Activo",
  POR_VENCER: "Por vencer",
  VENCIDO: "Vencido",
  SUSPENDIDO: "Suspendido",
  CANCELADO: "Cancelado",
};

export const SUBSCRIBER_STATUS_TONE: Record<
  SubscriberDisplayStatus,
  "success" | "danger" | "warning" | "neutral"
> = {
  ACTIVO: "success",
  POR_VENCER: "warning",
  VENCIDO: "danger",
  SUSPENDIDO: "warning",
  CANCELADO: "neutral",
};

/** Solo los estados que el admin puede elegir a mano en el formulario de
 * edición. POR_VENCER nunca es una opción: se calcula, no se guarda. */
export const SUBSCRIBER_EDITABLE_STATUSES: SubscriberStatus[] = [
  "ACTIVO",
  "VENCIDO",
  "SUSPENDIDO",
  "CANCELADO",
];

export const TARIFF_TYPES: TariffType[] = ["HORA", "PLANA_DIA", "PLANA_NOCHE", "ABONADO", "AUTORIZADO"];

export const TARIFF_TYPE_LABELS: Record<TariffType, string> = {
  HORA: "Por hora",
  ABONADO: "Abonado",
  PLANA: "Tarifa plana",
  PLANA_DIA: "Tarifa plana día",
  PLANA_NOCHE: "Tarifa plana noche",
  AUTORIZADO: "Vehículo autorizado",
};

export const AUTHORIZED_VEHICLE_STATUS_LABELS = {
  ACTIVO: "Activo",
  INACTIVO: "Inactivo",
} as const;
