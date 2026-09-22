"use client";

import { Logo } from "@/components/layout/Logo";
import { NavLinks } from "@/components/layout/NavLinks";
import { Icons } from "@/components/layout/Icons";
import type { NavItem } from "@/lib/nav";

export function MobileMenu({
  open,
  onClose,
  items,
}: {
  open: boolean;
  onClose: () => void;
  items: NavItem[];
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 lg:hidden">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />
      <div className="absolute inset-y-0 left-0 flex w-72 flex-col bg-surface p-4 shadow-2xl">
        <div className="flex items-center justify-between px-2 py-2">
          <Logo />
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-foreground hover:bg-surface-2"
            aria-label="Cerrar menú"
          >
            <Icons.close />
          </button>
        </div>
        <div className="mt-4 flex-1 overflow-y-auto">
          <NavLinks items={items} onNavigate={onClose} />
        </div>
      </div>
    </div>
  );
}
