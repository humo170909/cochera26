"use client";

import { useEffect, useState } from "react";
import { formatElapsedClock } from "@/lib/datetime";

/**
 * Cronómetro en vivo basado en un timestamp real (entryAt), no en un
 * contador acumulativo. No genera consultas al servidor: solo compara
 * `Date.now()` contra el instante de ingreso cada segundo.
 *
 * FIX (hidratación): el estado inicial NUNCA calcula Date.now() en el
 * cuerpo del render — eso es exactamente lo que causaba "Hydration failed":
 * el render de servidor calculaba Date.now() en un instante, y el primer
 * render del cliente lo volvía a calcular un poco después (el tiempo que
 * tarda en llegar/hidratar la página); si ese lapso cruzaba el segundo
 * siguiente, el texto formateado (HH:MM:SS) no coincidía entre servidor y
 * cliente. Mismo patrón ya usado en components/layout/Clock.tsx: el valor
 * real solo se calcula dentro de useEffect (client-only, después de la
 * hidratación), así que el primer render de servidor y el primer render
 * de cliente muestran exactamente lo mismo ("--:--:--").
 */
export function useElapsedTime(entryAtIso: string) {
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);

  useEffect(() => {
    const entryTime = new Date(entryAtIso).getTime();
    const tick = () => setElapsedMs(Date.now() - entryTime);
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [entryAtIso]);

  const safeElapsedMs = elapsedMs ?? 0;

  return {
    elapsedMs: safeElapsedMs,
    elapsedLabel: elapsedMs === null ? "--:--:--" : formatElapsedClock(safeElapsedMs),
    elapsedMinutes: Math.floor(safeElapsedMs / 60000),
  };
}
