"use client";

import { useEffect, useState } from "react";
import { formatElapsedClock } from "@/lib/datetime";

/**
 * Cronómetro en vivo basado en un timestamp real (entryAt), no en un
 * contador acumulativo. No genera consultas al servidor: solo compara
 * `Date.now()` contra el instante de ingreso cada segundo.
 */
export function useElapsedTime(entryAtIso: string) {
  const [elapsedMs, setElapsedMs] = useState(() => Date.now() - new Date(entryAtIso).getTime());

  useEffect(() => {
    const entryTime = new Date(entryAtIso).getTime();
    const tick = () => setElapsedMs(Date.now() - entryTime);
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [entryAtIso]);

  return {
    elapsedMs,
    elapsedLabel: formatElapsedClock(elapsedMs),
    elapsedMinutes: Math.floor(elapsedMs / 60000),
  };
}
