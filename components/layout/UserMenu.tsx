"use client";

import { useState, useRef, useEffect } from "react";
import { logout } from "@/actions/auth-actions";
import { Icons } from "@/components/layout/Icons";
import type { UserRole } from "@/types/database";

// Etiqueta propia de este encabezado (no ROLE_LABELS de lib/constants):
// esa constante también alimenta el selector de rol en /usuarios al crear
// o editar cuentas, donde "Trabajador" sigue siendo el nombre correcto del
// rol interno. Acá, de cara al propio colaborador, se pidió mostrar
// "Colaborador" en su lugar — un cambio solo de este saludo, no del rol.
const TOPBAR_ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: "Administrador",
  TRABAJADOR: "Colaborador",
};

export function UserMenu({
  nombre,
  apellido,
  rol,
}: {
  nombre: string;
  apellido: string;
  rol: UserRole;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const initials = `${nombre.charAt(0)}${apellido.charAt(0)}`.toUpperCase() || "U";

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-xl border border-border bg-surface py-1.5 pl-1.5 pr-3 hover:bg-surface-2"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
          {initials}
        </span>
        <span className="hidden text-left sm:block">
          <span className="block text-sm font-semibold leading-tight text-foreground">
            {nombre} {apellido}
          </span>
          <span className="block text-xs leading-tight text-muted">{TOPBAR_ROLE_LABELS[rol]}</span>
        </span>
        <Icons.chevronDown className="text-muted" />
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-48 overflow-hidden rounded-xl border border-border bg-surface shadow-lg">
          <form action={logout}>
            <button
              type="submit"
              className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium text-danger hover:bg-danger-bg"
            >
              <Icons.logout />
              Cerrar sesión
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
