import type { ReactNode } from "react";

type Variant = "trip" | "day" | "recs" | "expenses" | "hotels";

export function EmptyState({
  variant,
  title,
  hint,
  cta,
}: {
  variant: Variant;
  title: string;
  hint?: string;
  cta?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center space-y-2.5 py-8 text-center">
      <div className="text-[color:var(--accent)]">
        <Illustration variant={variant} />
      </div>
      <div className="space-y-1">
        <div className="text-base font-medium text-foreground">{title}</div>
        {hint && <div className="max-w-[240px] text-xs leading-relaxed text-muted-foreground">{hint}</div>}
      </div>
      {cta}
    </div>
  );
}

function Illustration({ variant }: { variant: Variant }) {
  const common = {
    width: 72,
    height: 72,
    viewBox: "0 0 64 64",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.4,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (variant) {
    case "trip":
      return (
        <svg {...common}>
          <circle cx="32" cy="32" r="22" />
          <path d="M32 14v6M32 44v6M14 32h6M44 32h6" />
          <path d="M32 22l6 16-16-6z" fill="currentColor" fillOpacity="0.15" />
        </svg>
      );
    case "day":
      return (
        <svg {...common}>
          <circle cx="32" cy="34" r="10" />
          <path d="M32 16v4M32 48v4M16 34h4M48 34h4M20 22l3 3M44 22l-3 3" />
          <path d="M10 52h44" />
        </svg>
      );
    case "recs":
      return (
        <svg {...common}>
          <path d="M32 12l5.5 11.2 12.5 1.8-9 8.8 2.1 12.4L32 40.4l-11.1 5.8L23 33.8l-9-8.8 12.5-1.8z" />
        </svg>
      );
    case "expenses":
      return (
        <svg {...common}>
          <rect x="10" y="18" width="44" height="30" rx="4" />
          <path d="M10 26h44" />
          <circle cx="44" cy="38" r="2.5" fill="currentColor" />
        </svg>
      );
    case "hotels":
      return (
        <svg {...common}>
          <path d="M8 44V26h20a10 10 0 0 1 10 10v8" />
          <path d="M38 44V22h18v22" />
          <path d="M6 44h52" />
          <path d="M14 36h6" />
        </svg>
      );
  }
}
