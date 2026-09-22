/**
 * Única función de normalización de placas del proyecto (frontend). Debe
 * usarse en cualquier comparación/búsqueda de placas hecha en el cliente.
 * La comparación real de identidad (ingreso, salida, abonados, vehículos
 * autorizados) vive en Postgres como public.normalize_plate() — esta es su
 * contraparte en TypeScript, con la misma regla: trim + mayúsculas + sin
 * guiones/espacios. BSX277 y BSX-277 deben producir el mismo valor.
 */
export function normalizePlate(plate: string): string {
  return plate.trim().toUpperCase().replace(/[\s-]/g, "");
}
