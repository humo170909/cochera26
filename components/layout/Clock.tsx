"use client";

import { useEffect, useState } from "react";
import { formatDateLima, formatTimeLima } from "@/lib/datetime";

/** Reloj en vivo (America/Lima). Se actualiza cada segundo sin recargar la página. */
export function Clock({ className = "" }: { className?: string }) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const tick = () => setNow(new Date());
    const id = setInterval(tick, 1000);
    // Primer valor vía macrotask (no sincrónico en el cuerpo del efecto) para
    // evitar el mismatch de hidratación sin violar react-hooks/set-state-in-effect.
    const initial = setTimeout(tick, 0);
    return () => {
      clearInterval(id);
      clearTimeout(initial);
    };
  }, []);

  return (
    <div className={`flex flex-col items-end leading-tight ${className}`}>
      <span className="font-mono text-sm font-semibold tabular-nums text-foreground sm:text-lg">
        {now ? formatTimeLima(now) : "--:--:--"}
      </span>
      <span className="hidden text-xs text-muted sm:block">
        {now ? formatDateLima(now) : ""}
      </span>
    </div>
  );
}
