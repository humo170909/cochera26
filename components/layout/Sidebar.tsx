import { Logo } from "@/components/layout/Logo";
import { NavLinks } from "@/components/layout/NavLinks";
import type { NavItem } from "@/lib/nav";

export function Sidebar({ items }: { items: NavItem[] }) {
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-surface p-4 lg:flex">
      <div className="px-2 py-2">
        <Logo />
      </div>
      <div className="mt-6 flex-1 overflow-y-auto">
        <NavLinks items={items} />
      </div>
      <p className="px-2 pt-4 text-xs text-muted">v1.0 · Parking Admin</p>
    </aside>
  );
}
