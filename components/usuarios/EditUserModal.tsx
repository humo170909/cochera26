"use client";

import { useState, useTransition } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toaster";
import { updateUser } from "@/actions/user-actions";
import { ROLE_LABELS } from "@/lib/constants";
import type { ProfileRow } from "@/services/users";
import type { UserRole } from "@/types/database";

export function EditUserModal({ user }: { user: ProfileRow }) {
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [nombre, setNombre] = useState(user.nombre);
  const [apellido, setApellido] = useState(user.apellido);
  const [rol, setRol] = useState<UserRole>(user.rol);
  const [activo, setActivo] = useState(user.activo);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await updateUser({ id: user.id, nombre, apellido, rol, activo });
      if (result.error) {
        setError(result.error);
        return;
      }
      showToast("Usuario actualizado.", "success");
      setOpen(false);
    });
  };

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        Editar
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} maxWidth="max-w-md">
        <form onSubmit={onSubmit} className="p-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-foreground">Editar usuario</h3>
            <Badge tone="neutral">{user.email}</Badge>
          </div>

          <div className="mt-4 flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Nombre" htmlFor="edit-nombre">
                <Input id="edit-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
              </Field>
              <Field label="Apellido" htmlFor="edit-apellido">
                <Input id="edit-apellido" value={apellido} onChange={(e) => setApellido(e.target.value)} required />
              </Field>
            </div>

            <Field label="Rol" htmlFor="edit-rol">
              <Select id="edit-rol" value={rol} onChange={(e) => setRol(e.target.value as UserRole)}>
                {Object.entries(ROLE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>

            <label className="flex items-center gap-2 text-sm font-medium text-foreground">
              <input
                type="checkbox"
                checked={activo}
                onChange={(e) => setActivo(e.target.checked)}
                className="h-4 w-4 rounded border-border"
              />
              Usuario activo
            </label>
          </div>

          {error && (
            <div className="mt-4 rounded-xl bg-danger-bg px-4 py-3 text-sm font-medium text-danger">
              {error}
            </div>
          )}

          <div className="mt-6 flex gap-3">
            <Button type="button" variant="secondary" fullWidth onClick={() => setOpen(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" fullWidth disabled={pending}>
              {pending ? "Guardando..." : "Guardar cambios"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
