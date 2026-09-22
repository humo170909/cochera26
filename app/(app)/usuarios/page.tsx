import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/dal";
import { getProfiles } from "@/services/users";
import { Card, CardHeader, Badge } from "@/components/ui/Card";
import { CreateUserModal } from "@/components/usuarios/CreateUserModal";
import { EditUserModal } from "@/components/usuarios/EditUserModal";
import { ROLE_LABELS } from "@/lib/constants";
import { formatDateLima } from "@/lib/datetime";

export const metadata: Metadata = { title: "Usuarios" };

export default async function UsuariosPage() {
  await requireRole("ADMIN");
  const profiles = await getProfiles();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Usuarios</h1>
          <p className="text-sm text-muted">Administra las cuentas de acceso al sistema.</p>
        </div>
        <CreateUserModal />
      </div>

      <Card>
        <CardHeader title={`${profiles.length} usuarios`} />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-5 py-3">Nombre</th>
                <th className="px-5 py-3">Correo</th>
                <th className="px-5 py-3">Rol</th>
                <th className="px-5 py-3">Estado</th>
                <th className="px-5 py-3">Alta</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {profiles.map((p) => (
                <tr key={p.id} className="border-b border-border last:border-0">
                  <td className="px-5 py-3 font-semibold text-foreground">{p.nombre} {p.apellido}</td>
                  <td className="px-5 py-3 text-foreground">{p.email}</td>
                  <td className="px-5 py-3 text-foreground">{ROLE_LABELS[p.rol]}</td>
                  <td className="px-5 py-3">
                    <Badge tone={p.activo ? "success" : "neutral"}>{p.activo ? "Activo" : "Inactivo"}</Badge>
                  </td>
                  <td className="px-5 py-3 text-muted">{formatDateLima(new Date(p.createdAt))}</td>
                  <td className="px-5 py-3 text-right">
                    <EditUserModal user={p} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
