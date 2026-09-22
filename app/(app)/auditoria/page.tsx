import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/dal";
import { getAuditLog, getDistinctAuditActions } from "@/services/audit";
import { getActiveWorkers } from "@/services/users";
import { Card, CardHeader } from "@/components/ui/Card";
import { Select } from "@/components/ui/Input";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { formatDateTimeLima } from "@/lib/datetime";

export const metadata: Metadata = { title: "Auditoría" };

interface SearchParams {
  dateFrom?: string;
  dateTo?: string;
  userId?: string;
  action?: string;
}

export default async function AuditoriaPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireRole("ADMIN");
  const params = await searchParams;

  const [rows, actions, users] = await Promise.all([
    getAuditLog(params),
    getDistinctAuditActions(),
    getActiveWorkers(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-foreground">Auditoría</h1>
        <p className="text-sm text-muted">Registro inmutable de acciones sensibles del sistema.</p>
      </div>

      <Card>
        <CardHeader title="Filtros" />
        <form method="get" className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-foreground">Desde</label>
            <Input type="date" name="dateFrom" defaultValue={params.dateFrom} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-foreground">Hasta</label>
            <Input type="date" name="dateTo" defaultValue={params.dateTo} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-foreground">Usuario</label>
            <Select name="userId" defaultValue={params.userId ?? ""}>
              <option value="">Todos</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nombre} {u.apellido}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-foreground">Acción</label>
            <Select name="action" defaultValue={params.action ?? ""}>
              <option value="">Todas</option>
              {actions.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
            <Button type="submit">Filtrar</Button>
            <a href="/auditoria">
              <Button type="button" variant="secondary">Limpiar</Button>
            </a>
          </div>
        </form>
      </Card>

      <Card>
        {rows.length === 0 && (
          <p className="px-5 py-10 text-center text-muted">No hay eventos con los filtros seleccionados.</p>
        )}

        {rows.length > 0 && (
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-5 py-3">Fecha y hora</th>
                  <th className="px-5 py-3">Usuario</th>
                  <th className="px-5 py-3">Acción</th>
                  <th className="px-5 py-3">Entidad</th>
                  <th className="px-5 py-3">Detalles</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-border align-top last:border-0">
                    <td className="whitespace-nowrap px-5 py-3 text-foreground">
                      {formatDateTimeLima(new Date(r.createdAt))}
                    </td>
                    <td className="px-5 py-3 text-foreground">{r.userName}</td>
                    <td className="px-5 py-3 font-semibold text-foreground">{r.action}</td>
                    <td className="px-5 py-3 text-muted">{r.entityType}{r.entityId ? ` · ${r.entityId.slice(0, 8)}` : ""}</td>
                    <td className="max-w-xs truncate px-5 py-3 font-mono text-xs text-muted" title={JSON.stringify(r.details)}>
                      {JSON.stringify(r.details)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {rows.length > 0 && (
          <div className="flex flex-col gap-3 p-4 md:hidden">
            {rows.map((r) => (
              <div key={r.id} className="rounded-2xl border border-border bg-surface-2 p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-semibold text-foreground">{r.action}</p>
                  <p className="whitespace-nowrap text-xs text-muted">{formatDateTimeLima(new Date(r.createdAt))}</p>
                </div>
                <p className="mt-1 text-sm text-foreground">{r.userName}</p>
                <p className="mt-1 text-sm text-muted">
                  {r.entityType}
                  {r.entityId ? ` · ${r.entityId.slice(0, 8)}` : ""}
                </p>
                <p className="mt-2 truncate font-mono text-xs text-muted" title={JSON.stringify(r.details)}>
                  {JSON.stringify(r.details)}
                </p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
