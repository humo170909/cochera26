import { requireAuth } from "@/lib/auth/dal";
import { AppShell } from "@/components/layout/AppShell";
import { getNavForRole } from "@/lib/nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireAuth();
  const navItems = getNavForRole(profile.rol);

  return (
    <AppShell
      navItems={navItems}
      profile={{ nombre: profile.nombre, apellido: profile.apellido, rol: profile.rol }}
    >
      {children}
    </AppShell>
  );
}
