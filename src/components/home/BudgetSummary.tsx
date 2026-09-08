import { Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { ils } from "@/lib/format";

/** Compact budget summary — values are calculated by the home screen. */
export function BudgetSummary({
  budget,
  spent,
  remaining,
}: {
  budget: number;
  spent: number;
  remaining: number;
}) {
  const hasBudget = Number.isFinite(budget) && budget > 0;
  const over = hasBudget && remaining < 0;

  return (
    <section className="rounded-2xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">תקציב</h2>
        <Link to="/budget" className="inline-flex min-h-11 items-center gap-0.5 px-1 text-[12px] text-[color:var(--accent)]">
          למסך התקציב
          <ChevronLeft size={14} />
        </Link>
      </div>

      {hasBudget ? (
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-[11px] text-muted-foreground">תקציב</div>
            <div className="text-[14px] font-medium tabular-nums">{ils(budget)}</div>
          </div>
          <div>
            <div className="text-[11px] text-muted-foreground">הוצאנו</div>
            <div className="text-[14px] font-medium tabular-nums">{ils(spent)}</div>
          </div>
          <div>
            <div className="text-[11px] text-muted-foreground">{over ? "חריגה" : "נשאר"}</div>
            <div
              className="text-[14px] font-semibold tabular-nums"
              style={over ? { color: "var(--destructive)" } : undefined}
            >
              {ils(over ? Math.abs(remaining) : remaining)}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <p className="text-[13px] text-muted-foreground">לא הוגדר תקציב לטיול</p>
          <div className="text-left">
            <div className="text-[11px] text-muted-foreground">הוצאנו</div>
            <div className="text-[14px] font-medium tabular-nums">{ils(spent)}</div>
          </div>
        </div>
      )}
    </section>
  );
}
