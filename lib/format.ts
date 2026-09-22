/** Formatea un monto en Soles peruanos, ej: S/ 7.00 */
export function formatCurrency(amount: number): string {
  return `S/ ${amount.toFixed(2)}`;
}
