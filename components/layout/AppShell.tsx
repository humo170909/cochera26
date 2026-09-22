"use client";

import { useState } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileMenu } from "@/components/layout/MobileMenu";
import { Clock } from "@/components/layout/Clock";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { UserMenu } from "@/components/layout/UserMenu";
import { Icons } from "@/components/layout/Icons";
import { Logo } from "@/components/layout/Logo";
import { ToastProvider } from "@/components/ui/Toaster";
import type { NavItem } from "@/lib/nav";
import type { UserRole } from "@/types/database";

export function AppShell({
  navItems,
  profile,
  children,
}: {
  navItems: NavItem[];
  profile: { nombre: string; apellido: string; rol: UserRole };
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <ToastProvider>
      <div className="flex min-h-screen bg-background">
        <Sidebar items={navItems} />
        <MobileMenu open={mobileOpen} onClose={() => setMobileOpen(false)} items={navItems} />

        <div className="flex min-h-screen flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-border bg-surface px-4 sm:px-6">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                className="rounded-lg p-2 text-foreground hover:bg-surface-2 lg:hidden"
                aria-label="Abrir menú"
              >
                <Icons.menu />
              </button>
              <div className="lg:hidden">
                <Logo compact />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Clock />
              <ThemeToggle />
              <UserMenu {...profile} />
            </div>
          </header>

          <main className="flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
        </div>
      </div>
    </ToastProvider>
  );
}
