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
    <section className="rounded-[20px] bg-card px-3.5 py-2.5 shadow-sm">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
        <h2 className="min-w-0 truncate text-sm font-semibold">תקציב</h2>
        <Link
          to="/budget"
          className="inline-flex min-h-11 shrink-0 items-center gap-0.5 px-1 text-[12px] text-muted-foreground"
        >
          למסך התקציב
          <ChevronLeft size={14} />
        </Link>
      </div>

      {hasBudget ? (
        <div className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-2 gap-y-0.5">
          <span
            className="text-[19px] font-semibold tabular-nums leading-tight"
            style={over ? { color: "var(--destructive)" } : undefined}
            dir="rtl"
          >
            {over ? `-${ils(Math.abs(remaining))}` : ils(remaining)}
          </span>
          <span className="text-[11px] text-muted-foreground">{over ? "חריגה מהתקציב" : "נותרו לטיול"}</span>
          <span className="col-span-2 text-[11px] text-muted-foreground break-words" dir="rtl">
            תקציב {ils(budget)} · הוצאנו {ils(spent)}
          </span>
        </div>
      ) : (
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-[13px] text-muted-foreground">לא הוגדר תקציב לטיול</span>
          <span className="text-[11px] text-muted-foreground" dir="rtl">
            הוצאנו {ils(spent)}
          </span>
        </div>
      )}
    </section>
  );
}
