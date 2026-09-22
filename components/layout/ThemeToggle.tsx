"use client";

import { useEffect, useState } from "react";
import { Icons } from "@/components/layout/Icons";

const STORAGE_KEY = "parking-admin-theme";

export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);

  useEffect(() => {
    // Vía macrotask (no sincrónico en el cuerpo del efecto) para evitar el
    // mismatch de hidratación sin violar react-hooks/set-state-in-effect.
    const id = setTimeout(() => {
      const current = document.documentElement.getAttribute("data-theme");
      setTheme(current === "dark" ? "dark" : "light");
    }, 0);
    return () => clearTimeout(id);
  }, []);

  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Preferencia de UI no crítica: si localStorage falla, se ignora.
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Cambiar tema"
      className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-surface text-foreground transition-colors hover:bg-surface-2"
    >
      {theme === "dark" ? <Icons.sun /> : <Icons.moon />}
    </button>
  );
}
