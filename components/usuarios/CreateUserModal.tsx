"use client";

import { useState, useTransition } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toaster";
import { createUser } from "@/actions/user-actions";
import { ROLE_LABELS } from "@/lib/constants";
import type { UserRole } from "@/types/database";

const EMPTY_FORM = { nombre: "", apellido: "", email: "", password: "", rol: "TRABAJADOR" as UserRole };

export function CreateUserModal() {
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const close = () => {
    setOpen(false);
    setForm(EMPTY_FORM);
    setError(null);
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createUser(form);
      if (result.error) {
        setError(result.error);
        return;
      }
      showToast("Usuario creado correctamente.", "success");
      close();
    });
  };

  return (
    <>
      <Button onClick={() => setOpen(true)}>+ Nuevo usuario</Button>

      <Modal open={open} onClose={close} maxWidth="max-w-md">
        <form onSubmit={onSubmit} className="p-6">
          <h3 className="text-lg font-bold text-foreground">Nuevo usuario</h3>

          <div className="mt-4 flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Nombre" htmlFor="nombre">
                <Input
                  id="nombre"
                  value={form.nombre}
                  onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                  required
                />
              </Field>
              <Field label="Apellido" htmlFor="apellido">
                <Input
                  id="apellido"
                  value={form.apellido}
                  onChange={(e) => setForm((f) => ({ ...f, apellido: e.target.value }))}
                  required
                />
              </Field>
            </div>

            <Field label="Correo electrónico" htmlFor="email">
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                required
              />
            </Field>

            <Field label="Contraseña temporal" htmlFor="password">
              <Input
                id="password"
                type="text"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                placeholder="Mínimo 6 caracteres"
                required
              />
            </Field>

            <Field label="Rol" htmlFor="rol">
              <Select
                id="rol"
                value={form.rol}
                onChange={(e) => setForm((f) => ({ ...f, rol: e.target.value as UserRole }))}
              >
                {Object.entries(ROLE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {error && (
            <div className="mt-4 rounded-xl bg-danger-bg px-4 py-3 text-sm font-medium text-danger">
              {error}
            </div>
          )}

          <div className="mt-6 flex gap-3">
            <Button type="button" variant="secondary" fullWidth onClick={close} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" fullWidth disabled={pending}>
              {pending ? "Creando..." : "Crear usuario"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
