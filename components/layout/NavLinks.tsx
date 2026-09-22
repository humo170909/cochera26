"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icons } from "@/components/layout/Icons";
import type { NavItem } from "@/lib/nav";

export function NavLinks({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + "/");
        const Icon = Icons[item.icon];
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
              active
                ? "bg-primary text-primary-foreground"
                : "text-foreground/80 hover:bg-surface-2 hover:text-foreground"
            }`}
          >
            <Icon className="shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
