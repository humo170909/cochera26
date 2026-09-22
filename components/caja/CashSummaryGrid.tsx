import { formatCurrency } from "@/lib/format";
import type { CashRegisterSummary } from "@/types/database";

export function CashSummaryGrid({ summary }: { summary: CashRegisterSummary }) {
  const items = [
    { label: "Efectivo", value: summary.efectivo },
    { label: "Yape", value: summary.yape },
    { label: "Plin", value: summary.plin },
    { label: "Transferencia", value: summary.transferencia },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="rounded-xl border border-border bg-surface-2 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">{item.label}</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-foreground">
            {formatCurrency(item.value)}
          </p>
        </div>
      ))}
      <div className="col-span-2 rounded-xl border border-primary/30 bg-primary/10 p-4 sm:col-span-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">Total ingresos</p>
        <p className="mt-1 text-2xl font-extrabold tabular-nums text-primary">
          {formatCurrency(summary.total_ingresos)}
        </p>
      </div>
    </div>
  );
}
