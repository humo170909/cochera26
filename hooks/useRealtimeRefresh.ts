"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Refresca los datos del Server Component actual (router.refresh) cuando
 * cambia cualquier fila de las tablas indicadas. Evita polling: usa
 * Supabase Realtime (push), y no afecta al cronómetro (que es puro
 * cálculo local por timestamp).
 */
export function useRealtimeRefresh(tables: string[]) {
  const router = useRouter();
  const tablesKey = tables.join(",");

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(`realtime-${tablesKey}`);

    for (const table of tablesKey.split(",")) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        () => router.refresh()
      );
    }

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tablesKey]);
}
