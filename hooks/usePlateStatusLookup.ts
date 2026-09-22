"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { PlateStatusResult } from "@/types/domain";

const PLATE_MIN_LENGTH = 5;

interface LookupRow {
  kind: "AUTORIZADO" | "ABONADO";
  id: string;
  nombre: string;
  fecha_vencimiento: string | null;
  display_status: string;
}

/**
 * Consulta en vivo (debounced) el estado real de una placa contra
 * lookup_plate_status() en Supabase, con la MISMA prioridad que usa el
 * servidor al registrar el ingreso (autorizado > abonado > cliente
 * normal) — un único round-trip, nunca se reimplementa la prioridad en
 * el cliente. RETURNS TABLE en SQL: sin coincidencia, `.maybeSingle()`
 * obtiene `data: null` real (ver la causa del bug "toda placa es abonado").
 */
export function usePlateStatusLookup(plate: string) {
  const [result, setResult] = useState<PlateStatusResult | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const trimmed = plate.trim();
    const supabase = createClient();

    const timeout = setTimeout(async () => {
      if (trimmed.length < PLATE_MIN_LENGTH) {
        setResult(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      const { data, error } = await supabase
        .rpc("lookup_plate_status", { p_plate: trimmed })
        .maybeSingle()
        .returns<LookupRow | null>();

      if (error || !data) {
        setResult({ kind: null, id: null, nombre: null, fechaVencimiento: null, displayStatus: null });
      } else {
        setResult({
          kind: data.kind,
          id: data.id,
          nombre: data.nombre,
          fechaVencimiento: data.fecha_vencimiento,
          displayStatus: data.display_status,
        });
      }
      setLoading(false);
    }, 400);

    return () => clearTimeout(timeout);
  }, [plate]);

  return { result, loading };
}
