"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { EditVisitModal } from "@/components/historial/EditVisitModal";
import { DeleteVisitButton } from "@/components/historial/DeleteVisitButton";
import type { HistoryRow } from "@/services/history";

/** Exclusivo ADMIN — ver app/(app)/historial/page.tsx, que solo renderiza
 * esta columna cuando profile.rol === "ADMIN". La restricción real vive en
 * el backend (admin_update_vehicle_visit / admin_delete_vehicle_visit
 * exigen is_admin()), esto es solo la UI. */
export function VisitRowActions({
  row,
  spots,
}: {
  row: HistoryRow;
  spots: { id: string; code: string }[];
}) {
  const [editOpen, setEditOpen] = useState(false);

  return (
    <div className="flex items-center gap-2">
      <Button variant="secondary" size="sm" onClick={() => setEditOpen(true)}>
        Editar
      </Button>
      <DeleteVisitButton exitId={row.exitId} />

      <EditVisitModal row={row} spots={spots} open={editOpen} onClose={() => setEditOpen(false)} />
    </div>
  );
}
