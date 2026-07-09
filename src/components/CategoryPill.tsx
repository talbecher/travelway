import { CATEGORY_LABELS, CATEGORY_COLORS, CATEGORY_ICONS } from "@/lib/constants";

export function CategoryPill({
  category,
  showIcon = true,
  className = "",
}: {
  category: string;
  showIcon?: boolean;
  className?: string;
}) {
  const color = CATEGORY_COLORS[category] ?? "var(--chart-6)";
  const label = CATEGORY_LABELS[category] ?? category;
  const icon = CATEGORY_ICONS[category];
  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium ${className}`}
      style={{
        color,
        background: `color-mix(in oklab, ${color} 18%, transparent)`,
        border: `1px solid color-mix(in oklab, ${color} 30%, transparent)`,
      }}
    >
      {showIcon && icon && <span className="text-[11px] leading-none">{icon}</span>}
      {label}
    </span>
  );
}
