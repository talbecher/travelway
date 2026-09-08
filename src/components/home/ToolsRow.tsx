import { Link } from "@tanstack/react-router";
import { ChevronLeft, type LucideIcon } from "lucide-react";

export type ToolAction = {
  key: string;
  icon: LucideIcon;
  label: string;
  to?: string;
  onClick?: () => void;
  disabled?: boolean;
};

/** Simple tool rows — only destinations that aren't in the fixed bottom nav. */
export function ToolsRow({ actions }: { actions: ToolAction[] }) {
  const cls =
    "flex min-h-11 w-full items-center gap-3 px-4 py-2.5 text-right focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";

  return (
    <section className="divide-y divide-border overflow-hidden rounded-xl bg-card shadow-sm">
      {actions.map(({ key, icon: Icon, label, to, onClick, disabled }) => {
        const content = (
          <>
            <Icon size={18} strokeWidth={1.7} className="shrink-0 text-[color:var(--accent)]" />
            <span className="min-w-0 flex-1 text-[13px] font-medium leading-snug break-words text-foreground">
              {label}
            </span>
            <ChevronLeft size={16} className="shrink-0 text-muted-foreground" />
          </>
        );
        if (to) {
          return (
            <Link key={key} to={to} className={cls}>
              {content}
            </Link>
          );
        }
        return (
          <button
            key={key}
            type="button"
            onClick={onClick}
            disabled={disabled}
            className={cls + (disabled ? " opacity-50" : "")}
          >
            {content}
          </button>
        );
      })}
    </section>
  );
}
