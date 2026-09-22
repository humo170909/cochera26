"use client";

import { useElapsedTime } from "@/hooks/useElapsedTime";
import type { ParkingSpotWithEntry } from "@/types/domain";

export function ParkingSpotTile({
  spot,
  onClick,
  interactive = true,
}: {
  spot: ParkingSpotWithEntry;
  onClick: () => void;
  /** false = espacio libre en modo solo-consulta: no ejecuta ninguna acción. */
  interactive?: boolean;
}) {
  const isFree = spot.status === "LIBRE";
  const isAuthorized = !isFree && !!spot.activeEntry?.isAuthorized;

  const toneClasses = isFree
    ? "border-success/30 bg-success-bg text-success"
    : isAuthorized
      ? "border-purple/30 bg-purple-bg text-purple"
      : "border-danger/30 bg-danger-bg text-danger";

  return (
    <button
      type="button"
      onClick={interactive ? onClick : undefined}
      aria-disabled={!interactive}
      className={`group flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border-2 p-2 text-center transition-all ${
        interactive ? "cursor-pointer hover:scale-[1.03] hover:shadow-md active:scale-95" : "cursor-default"
      } ${toneClasses}`}
    >
      <span className="text-base font-extrabold tracking-tight sm:text-lg">
        {spot.code}
      </span>
      {isFree ? (
        <span className="text-[10px] font-semibold uppercase tracking-wide opacity-80 sm:text-xs">
          Libre
        </span>
      ) : (
        spot.activeEntry && (
          <OccupiedTimer
            entryAt={spot.activeEntry.entryAt}
            plate={spot.activeEntry.plate}
            isAuthorized={isAuthorized}
          />
        )
      )}
    </button>
  );
}

function OccupiedTimer({
  entryAt,
  plate,
  isAuthorized,
}: {
  entryAt: string;
  plate: string;
  isAuthorized: boolean;
}) {
  const { elapsedLabel } = useElapsedTime(entryAt);
  return (
    <>
      <span className="max-w-full truncate text-[10px] font-bold sm:text-xs">{plate}</span>
      {isAuthorized && (
        <span className="text-[9px] font-bold uppercase tracking-wide sm:text-[10px]">Dueño</span>
      )}
      <span className="font-mono text-[10px] tabular-nums opacity-90 sm:text-xs">
        {elapsedLabel}
      </span>
    </>
  );
}
