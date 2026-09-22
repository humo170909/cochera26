import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth/dal";
import { getWorkerActivityToday } from "@/services/workers";
import { Card, CardHeader, Badge } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

export const metadata: Metadata = { title: "Trabajadores" };

export default async function TrabajadoresPage() {
  await requireRole("ADMIN");
  const workers = await getWorkerActivityToday();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Trabajadores</h1>
          <p className="text-sm text-muted">Actividad de hoy por trabajador.</p>
        </div>
        <Link href="/usuarios">
          <Button variant="secondary">Administrar cuentas</Button>
        </Link>
      </div>

      <Card>
        <CardHeader title={`${workers.length} trabajadores`} />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-5 py-3">Nombre</th>
                <th className="px-5 py-3">Correo</th>
                <th className="px-5 py-3">Estado</th>
                <th className="px-5 py-3">Ingresos hoy</th>
                <th className="px-5 py-3">Salidas hoy</th>
                <th className="px-5 py-3">Baños hoy</th>
              </tr>
            </thead>
            <tbody>
              {workers.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-muted">
                    No hay trabajadores registrados.
                  </td>
                </tr>
              )}
              {workers.map((w) => (
                <tr key={w.id} className="border-b border-border last:border-0">
                  <td className="px-5 py-3 font-semibold text-foreground">{w.nombre} {w.apellido}</td>
                  <td className="px-5 py-3 text-foreground">{w.email}</td>
                  <td className="px-5 py-3">
                    <Badge tone={w.activo ? "success" : "neutral"}>{w.activo ? "Activo" : "Inactivo"}</Badge>
                  </td>
                  <td className="px-5 py-3 text-foreground">{w.ingresosHoy}</td>
                  <td className="px-5 py-3 text-foreground">{w.salidasHoy}</td>
                  <td className="px-5 py-3 text-foreground">{w.banosHoy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
