import type { ToleranceSettings } from "@/types/domain";

/**
 * MOTOR DE TARIFAS — espejo en TypeScript de calculate_hourly_fee() en
 * supabase/migrations/0003_tariff_modalities.sql.
 *
 * Única fuente de verdad autoritativa: la función SQL, ejecutada dentro de
 * register_vehicle_exit() en el servidor. Este espejo existe SOLO para
 * mostrar un estimado en vivo mientras el cronómetro corre en el cliente,
 * sin golpear Supabase cada segundo. El monto que realmente se cobra y se
 * persiste SIEMPRE lo calcula la base de datos — si algún día cambias la
 * fórmula, cámbiala en ambos lugares.
 *
 * Fórmula (documentada explícitamente, no es una suposición):
 *   minutos = ceil(segundos_transcurridos / 60)
 *   horasCompletas = floor(minutos / 60)
 *   resto = minutos - horasCompletas*60
 *   tolerancia = horasCompletas >= umbralLargaHoras ? tolerLargaMinutos : tolerCortaMinutos
 *   horasFacturadas = resto <= tolerancia ? horasCompletas : horasCompletas + 1
 *   horasFacturadas = max(horasFacturadas, 1)   // piso mínimo de 1 hora
 *   importe = horasFacturadas * precioPorHora
 */
export interface HourlyFeeResult {
  minutes: number;
  hoursCompleted: number;
  toleranceApplied: number;
  billedHours: number;
  amount: number;
}

export function calculateHourlyFee(
  pricePerHour: number,
  elapsedMinutes: number,
  tolerance: ToleranceSettings
): HourlyFeeResult {
  const minutes = Math.max(0, Math.ceil(elapsedMinutes));
  const hoursCompleted = Math.floor(minutes / 60);
  const remainder = minutes - hoursCompleted * 60;

  const toleranceApplied =
    hoursCompleted >= tolerance.umbralLargaHoras
      ? tolerance.tolerLargaMinutos
      : tolerance.tolerCortaMinutos;

  let billedHours = remainder <= toleranceApplied ? hoursCompleted : hoursCompleted + 1;
  billedHours = Math.max(billedHours, 1);

  const amount = Math.round(pricePerHour * billedHours * 100) / 100;

  return { minutes, hoursCompleted, toleranceApplied, billedHours, amount };
}

/** ¿La tarifa plana está disponible ahora mismo, dado su horario configurado? */
export function isFlatRateEligibleNow(horaLimite: string, diasAplicacion: number[], now: Date): boolean {
  const limaParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Lima",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  }).formatToParts(now);

  const map = Object.fromEntries(limaParts.map((p) => [p.type, p.value]));
  const currentTime = `${map.hour}:${map.minute}`;
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const currentDow = weekdayMap[map.weekday] ?? now.getUTCDay();

  return currentTime <= horaLimite.slice(0, 5) && diasAplicacion.includes(currentDow);
}
