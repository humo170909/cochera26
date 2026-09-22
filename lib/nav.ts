import type { UserRole } from "@/types/database";
import type { Icons } from "@/components/layout/Icons";

export interface NavItem {
  href: string;
  label: string;
  icon: keyof typeof Icons;
}

export const ADMIN_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/estacionamientos", label: "Estacionamientos", icon: "parking" },
  { href: "/ingreso", label: "Ingresos", icon: "entry" },
  { href: "/salida", label: "Salidas", icon: "exit" },
  { href: "/caja", label: "Caja", icon: "cash" },
  { href: "/bano", label: "Baño", icon: "restroom" },
  { href: "/historial", label: "Historial", icon: "history" },
  { href: "/reportes", label: "Reportes", icon: "report" },
  { href: "/trabajadores", label: "Trabajadores", icon: "workers" },
  { href: "/usuarios", label: "Usuarios", icon: "user" },
  { href: "/tarifas", label: "Tarifas", icon: "tariff" },
  { href: "/abonados", label: "Abonados", icon: "subscription" },
  { href: "/vehiculos-autorizados", label: "Vehículos Autorizados", icon: "key" },
  { href: "/auditoria", label: "Auditoría", icon: "audit" },
  { href: "/configuracion", label: "Configuración", icon: "settings" },
];

export const WORKER_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/ingreso", label: "Ingreso", icon: "entry" },
  { href: "/salida", label: "Salida", icon: "exit" },
  { href: "/estacionamientos", label: "Estacionamientos", icon: "parking" },
  { href: "/bano", label: "Baño", icon: "restroom" },
  { href: "/abonados", label: "Abonados", icon: "subscription" },
  { href: "/caja", label: "Caja", icon: "cash" },
  { href: "/historial", label: "Historial", icon: "history" },
];

export function getNavForRole(role: UserRole): NavItem[] {
  return role === "ADMIN" ? ADMIN_NAV : WORKER_NAV;
}
