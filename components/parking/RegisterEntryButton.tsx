"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { VehicleEntryModal } from "@/components/parking/VehicleEntryModal";
import type { FlatRateCapacity, FlatRateSettings } from "@/types/domain";

/** Único punto de entrada para registrar un ingreso: el colaborador/admin
 * ya no toca un espacio en la grilla, el sistema lo asigna solo. */
export function RegisterEntryButton({
  flatRateSettings,
  flatRateCapacity,
}: {
  flatRateSettings: FlatRateSettings;
  flatRateCapacity: FlatRateCapacity;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button size="lg" onClick={() => setOpen(true)}>
        + Registrar ingreso
      </Button>

      <VehicleEntryModal
        open={open}
        flatRateSettings={flatRateSettings}
        flatRateCapacity={flatRateCapacity}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
