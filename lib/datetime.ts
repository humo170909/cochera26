// Utilidades centralizadas de fecha/hora en America/Lima.
// Regla del proyecto: la base de datos siempre guarda timestamptz (instante
// absoluto). Toda conversión a "hora de Perú" ocurre aquí, nunca hardcodeada.

export const TIME_ZONE = "America/Lima";

/** Fecha/hora actual formateada como HH:mm:ss en hora de Perú. */
export function formatTimeLima(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

/** Fecha actual formateada como dd/MM/yyyy en hora de Perú. */
export function formatDateLima(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

/** Fecha y hora combinadas, legibles, en hora de Perú. */
export function formatDateTimeLima(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

/** Solo la hora, sin segundos (para tablas/listados). */
export function formatShortTimeLima(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

/** Convierte minutos totales a "HH horas MM minutos" / "MM minutos". */
export function formatDurationMinutes(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes} min`;
  return `${hours}h ${minutes}min`;
}

/** Convierte una diferencia de tiempo en milisegundos a HH:MM:SS (cronómetro). */
export function formatElapsedClock(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

/**
 * Formatea una fecha DE CALENDARIO pura (columna `date` de Postgres, tipo
 * "2026-09-30", sin hora) como dd/MM/yyyy.
 *
 * A propósito NO usa `new Date(str)` + conversión de timezone: un `date` no
 * tiene hora ni zona horaria, así que reinterpretarlo como instante y
 * convertirlo a America/Lima puede correr la fecha un día si el servidor
 * corre en UTC (medianoche UTC = 19:00 del día anterior en Lima). Se
 * reordenan los componentes del string directamente.
 */
export function formatDateOnly(isoDate: string): string {
  const [year, month, day] = isoDate.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

/** Fecha de negocio (yyyy-MM-dd) según el calendario de Lima, para agrupar por "día". */
export function businessDateLima(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}`;
}
