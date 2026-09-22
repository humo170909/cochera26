import { Icons } from "@/components/layout/Icons";

type Tone = "neutral" | "success" | "danger" | "warning" | "info" | "purple";

const TONE_CLASSES: Record<Tone, string> = {
  neutral: "bg-surface-2 text-foreground",
  success: "bg-success-bg text-success",
  danger: "bg-danger-bg text-danger",
  warning: "bg-warning-bg text-warning",
  info: "bg-info-bg text-info",
  purple: "bg-purple-bg text-purple",
};

export function DashboardCard({
  label,
  value,
  icon,
  tone = "neutral",
}: {
  label: string;
  value: string;
  icon: keyof typeof Icons;
  tone?: Tone;
}) {
  const Icon = Icons[icon];
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${TONE_CLASSES[tone]}`}>
        <Icon width={22} height={22} />
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-muted">{label}</p>
        <p className="text-2xl font-bold tabular-nums text-foreground">{value}</p>
      </div>
    </div>
  );
}
