import type { SubscriberRow } from "@/services/subscribers";

export function ExpiryAlertBanner({ subscribers }: { subscribers: SubscriberRow[] }) {
  const porVencer = subscribers.filter((s) => s.effectiveStatus === "POR_VENCER");
  if (porVencer.length === 0) return null;

  return (
    <div className="rounded-2xl border border-warning/30 bg-warning-bg p-4">
      <p className="font-bold text-warning">⚠️ ABONADOS POR VENCER</p>
      <ul className="mt-2 flex flex-col gap-1 text-sm text-warning">
        {porVencer.map((s) => (
          <li key={s.id}>
            {s.plate} · {s.nombreCompleto} — vence en {s.diasRestantes}{" "}
            {s.diasRestantes === 1 ? "día" : "días"}
          </li>
        ))}
      </ul>
    </div>
  );
}
