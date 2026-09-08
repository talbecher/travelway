import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";

export type ToolAction = {
  key: string;
  icon: LucideIcon;
  label: string;
  to?: string;
  onClick?: () => void;
  disabled?: boolean;
};

/** Compact tools grid — same destinations and handlers as before. */
export function ToolsRow({ actions }: { actions: ToolAction[] }) {
  const cls =
    "flex min-h-11 items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5 text-right";

  return (
    <section className="grid grid-cols-2 gap-2">
      {actions.map(({ key, icon: Icon, label, to, onClick, disabled }) => {
        const content = (
          <>
            <Icon size={18} strokeWidth={1.7} className="shrink-0 text-[color:var(--accent)]" />
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">{label}</span>
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
