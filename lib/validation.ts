import { z } from "zod";

/** Placas peruanas: letras/números con guion opcional, ej. ABC-123, F1A-234, AB-1234. */
const PLATE_REGEX = /^[A-Z0-9]{2,3}-?[A-Z0-9]{3,4}$/;

export const plateSchema = z
  .string()
  .trim()
  .toUpperCase()
  .min(5, "La placa debe tener al menos 5 caracteres.")
  .max(9, "La placa no es válida.")
  .regex(PLATE_REGEX, "Formato de placa no válido (ej: ABC-123).");

const MONEY_ERROR = "Ingresa un monto válido mayor a S/ 0.00 y con máximo 2 decimales.";

/**
 * Acepta enteros o decimales de hasta 2 posiciones (1, 1.5, 1.50, 110.91, ...)
 * y los convierte a número sin el redondeo binario de parseFloat/Number en
 * cadena, preservando los centavos exactos.
 */
export const moneyAmountSchema = z.preprocess((val) => {
  if (typeof val === "number") return val;
  if (typeof val !== "string") return val;
  const trimmed = val.trim().replace(",", ".");
  if (trimmed === "" || !/^\d+(\.\d{1,2})?$/.test(trimmed)) return NaN;
  return Number(trimmed);
}, z.number(MONEY_ERROR).min(0.01, MONEY_ERROR));

export const loginSchema = z.object({
  email: z.email("Ingresa un correo válido."),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres."),
});

export const vehicleTypeSchema = z.enum([
  "AUTO",
  "CAMIONETA",
  "VAN",
  "MOTO",
  "FURGONETA",
  "CAMIONCITO",
  "OTRO",
]);

export const paymentMethodSchema = z.enum([
  "EFECTIVO",
  "YAPE",
  "PLIN",
  "TRANSFERENCIA",
]);

export const flatRatePeriodSchema = z.enum(["PLANA_DIA", "PLANA_NOCHE"]);

export const vehicleEntrySchema = z.object({
  plate: plateSchema,
  vehicleType: vehicleTypeSchema,
  // Opcional: si se omite, register_vehicle_entry() asigna automáticamente
  // el primer espacio libre (ver 0027). Se mantiene para el caso admin/
  // compatibilidad de elegir un espacio explícito.
  spotId: z.uuid("Selecciona un estacionamiento válido.").optional(),
  useFlatRate: z.boolean().default(false),
  flatRatePeriod: flatRatePeriodSchema.optional().nullable(),
});

/** Corrección de placa y tipo de un ingreso ACTIVO (colaborador o admin)
 * — ver update_active_entry_details(). No incluye espacio, fechas, tarifa
 * ni pago a propósito: esta función nunca los toca. Reutiliza plateSchema
 * (misma validación/normalización que register_vehicle_entry). */
export const updateEntryDetailsSchema = z.object({
  entryId: z.uuid(),
  plate: plateSchema,
  vehicleType: vehicleTypeSchema,
});

export const tariffTypeSchema = z.enum(["HORA", "ABONADO", "PLANA"]);

export const vehicleExitSchema = z.object({
  entryId: z.uuid(),
  paymentMethod: paymentMethodSchema.nullable(),
  tariffType: tariffTypeSchema.default("HORA"),
  ticketCode: z.string().trim().min(1).optional().nullable(),
});

export const validateTicketSchema = z.object({
  code: z.string().trim().min(1, "Ingresa el código del ticket."),
  expectedEntryId: z.uuid().optional().nullable(),
});

/** Exclusivo ADMIN — corrección de un ingreso/salida ya finalizado (ver
 * admin_update_vehicle_visit). Los datetime-local llegan como
 * "yyyy-MM-ddTHH:mm" (sin zona); se validan como string no vacío acá, la
 * conversión a instante absoluto (America/Lima) ocurre en el server action. */
export const updateVehicleVisitSchema = z.object({
  exitId: z.uuid(),
  plate: plateSchema,
  vehicleType: vehicleTypeSchema,
  spotId: z.uuid("Selecciona un estacionamiento válido."),
  entryAt: z.string().min(1, "Indica la fecha/hora de ingreso."),
  exitAt: z.string().min(1, "Indica la fecha/hora de salida."),
  paymentMethod: paymentMethodSchema.nullable(),
  amount: z.coerce.number().min(0, "El importe no puede ser negativo."),
});

export const deleteVehicleVisitSchema = z.object({
  exitId: z.uuid(),
});

export const restroomUseSchema = z.object({
  paymentMethod: paymentMethodSchema,
  observation: z.string().max(280).optional().nullable(),
});

export const openCashRegisterSchema = z.object({
  openingAmount: z.coerce.number().min(0, "El monto inicial no puede ser negativo."),
});

export const cashMovementSchema = z.object({
  cashRegisterId: z.uuid(),
  type: z.enum(["INGRESO", "EGRESO"]),
  concept: z.string().trim().min(3, "Describe el concepto del movimiento."),
  amount: moneyAmountSchema,
  paymentMethod: paymentMethodSchema,
  observation: z.string().max(280).optional().nullable(),
});

export const closeCashRegisterSchema = z.object({
  cashRegisterId: z.uuid(),
  declaredAmount: z.coerce.number().min(0, "El monto declarado no puede ser negativo."),
  notes: z.string().max(500).optional().nullable(),
});

export const tariffUpdateSchema = z.object({
  vehicleType: vehicleTypeSchema,
  pricePerHour: z.coerce.number().positive("La tarifa debe ser mayor a cero."),
});

export const createUserSchema = z.object({
  nombre: z.string().trim().min(2, "El nombre es obligatorio."),
  apellido: z.string().trim().min(2, "El apellido es obligatorio."),
  email: z.email("Ingresa un correo válido."),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres."),
  rol: z.enum(["ADMIN", "TRABAJADOR"]),
});

export const updateUserSchema = z.object({
  id: z.uuid(),
  nombre: z.string().trim().min(2, "El nombre es obligatorio."),
  apellido: z.string().trim().min(2, "El apellido es obligatorio."),
  rol: z.enum(["ADMIN", "TRABAJADOR"]),
  activo: z.boolean(),
});

const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Formato de hora inválido (HH:MM).");

export const toleranceSettingsSchema = z.object({
  tolerCortaMinutos: z.coerce.number().int().min(0).max(59),
  tolerLargaMinutos: z.coerce.number().int().min(0).max(59),
  umbralLargaHoras: z.coerce.number().int().min(1).max(24),
});

export const flatRateSettingsSchema = z.object({
  precio: z.coerce.number().positive("El precio debe ser mayor a cero."),
  precioNoche: z.coerce.number().positive("El precio de noche debe ser mayor a cero."),
  horaLimite: timeSchema,
  diasAplicacion: z.array(z.number().int().min(0).max(6)).min(1, "Selecciona al menos un día."),
  activo: z.boolean(),
  cupoMaximo: z.coerce.number().int().min(1, "El cupo debe ser mayor a cero.").max(999),
});

export const subscriberPlanSettingsSchema = z.object({
  precioMensual: z.coerce.number().positive("El precio debe ser mayor a cero."),
  horaLimite: timeSchema,
  periodoMeses: z.coerce.number().int().min(1).max(24),
  diasAlertaVencimiento: z.coerce.number().int().min(0).max(60),
});

export const registerSubscriberPaymentSchema = z.object({
  subscriberId: z.uuid(),
  paymentMethod: paymentMethodSchema,
  observation: z.string().max(280).optional().nullable(),
});

export const subscriberStatusSchema = z.enum(["ACTIVO", "VENCIDO", "SUSPENDIDO", "CANCELADO"]);

export const createSubscriberSchema = z.object({
  nombreCompleto: z.string().trim().min(2, "El nombre es obligatorio."),
  documento: z.string().trim().max(20).optional().nullable(),
  telefono: z.string().trim().max(20).optional().nullable(),
  plate: plateSchema,
  vehicleType: vehicleTypeSchema,
  fechaInicio: z.string().min(1, "La fecha de inicio es obligatoria."),
  fechaVencimiento: z.string().min(1, "La fecha de vencimiento es obligatoria."),
  horaLimite: timeSchema,
  monto: z.coerce.number().positive("El monto debe ser mayor a cero."),
  estado: subscriberStatusSchema.default("ACTIVO"),
  observaciones: z.string().max(500).optional().nullable(),
  assignedSpotId: z.uuid().optional().nullable(),
});

export const updateSubscriberSchema = createSubscriberSchema.extend({
  id: z.uuid(),
});

export const authorizedVehicleStatusSchema = z.enum(["ACTIVO", "INACTIVO"]);

export const createAuthorizedVehicleSchema = z.object({
  plate: plateSchema,
  propietario: z.string().trim().min(2, "El propietario es obligatorio."),
  vehicleType: vehicleTypeSchema,
  telefono: z.string().trim().max(20).optional().nullable(),
  estado: authorizedVehicleStatusSchema.default("ACTIVO"),
  observaciones: z.string().max(500).optional().nullable(),
});

export const updateAuthorizedVehicleSchema = createAuthorizedVehicleSchema.extend({
  id: z.uuid(),
});
