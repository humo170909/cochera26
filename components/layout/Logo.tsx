// Placeholder profesional de logo. Ver public/logo/README.md para
// reemplazarlo por el logo definitivo de la empresa.
export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <svg
        width="34"
        height="34"
        viewBox="0 0 34 34"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0"
        aria-hidden
      >
        <rect width="34" height="34" rx="9" fill="var(--primary)" />
        <path
          d="M11 24V10h6.2c3.1 0 5.3 2 5.3 4.9 0 2.9-2.2 4.9-5.3 4.9H14v4.2h-3Zm3-6.9h2.9c1.4 0 2.3-.8 2.3-2.2 0-1.4-.9-2.2-2.3-2.2H14v4.4Z"
          fill="white"
        />
      </svg>
      {!compact && (
        <span className="text-base font-bold tracking-tight text-foreground">
          PARKING <span className="font-light text-muted">ADMIN</span>
        </span>
      )}
    </div>
  );
}
