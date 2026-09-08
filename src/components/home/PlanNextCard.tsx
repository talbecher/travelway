import { ChevronLeft } from "lucide-react";
import { hebDate, hebWeekday } from "@/lib/format";

/** Shell for the main pre-trip planning card. */
function PlanShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      className="rounded-2xl border border-border bg-card p-4 space-y-3"
      style={{ borderTopWidth: 3, borderTopColor: "var(--accent)" }}
    >
      <h2 className="text-[15px] font-semibold">{title}</h2>
      {children}
    </section>
  );
}

/** Loading state — never implies "no days" or "no activities". */
export function PlanLoadingCard() {
  return (
    <PlanShell title="ממשיכים לתכנן">
      <div className="h-4 w-2/3 rounded bg-muted animate-pulse" />
      <div className="h-11 w-full rounded-xl bg-muted animate-pulse" />
    </PlanShell>
  );
}

/** Data failed to load — no conclusions about the planning state. */
export function PlanErrorCard({ onRetry }: { onRetry: () => void }) {
  return (
    <PlanShell title="ממשיכים לתכנן">
      <p className="text-[13px] text-muted-foreground">לא הצלחנו לטעון את המסלול כרגע.</p>
      <button
        type="button"
        onClick={onRetry}
        className="min-h-11 w-full rounded-xl border border-border px-4 text-[14px] font-medium"
      >
        נסה שוב
      </button>
    </PlanShell>
  );
}

/** A day with no activities was found — offered as a suggestion, not a problem. */
export function PlanEmptyDayCard({
  dayNumber,
  date,
  cityLabel,
  emptyCount,
  onOpenDay,
  onOpenItinerary,
}: {
  dayNumber: number;
  date: string;
  cityLabel: string | null;
  emptyCount: number;
  onOpenDay: () => void;
  onOpenItinerary: () => void;
}) {
  return (
    <PlanShell title="ממשיכים לתכנן">
      <p className="text-[13px] text-muted-foreground break-words">
        {emptyCount === 1 ? "יש יום במסלול ללא פעילויות" : `יש ${emptyCount} ימים במסלול ללא פעילויות`}
      </p>

      <div className="rounded-xl bg-muted/50 px-3 py-2.5">
        <div className="text-[14px] font-medium break-words">
          יום {dayNumber}
          {cityLabel ? ` · ${cityLabel}` : ""}
        </div>
        <div className="mt-0.5 text-[12px] text-muted-foreground">
          {hebWeekday(date)} · {hebDate(date)}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onOpenDay}
          className="min-h-11 flex-1 min-w-[160px] rounded-xl bg-[color:var(--accent)] px-4 text-[14px] font-medium text-[color:var(--primary-foreground)]"
        >
          לתכנון היום הזה
        </button>
        <button
          type="button"
          onClick={onOpenItinerary}
          className="inline-flex min-h-11 items-center gap-0.5 px-2 text-[12px] text-muted-foreground"
        >
          לכל המסלול
          <ChevronLeft size={14} />
        </button>
      </div>

      <p className="text-[11px] text-muted-foreground break-words">יום מנוחה או מעבר? אפשר להשאיר אותו כך.</p>
    </PlanShell>
  );
}

/** Every itinerary day has activities. */
export function PlanReviewCard({ onOpenItinerary }: { onOpenItinerary: () => void }) {
  return (
    <PlanShell title="ממשיכים לתכנן">
      <p className="text-[13px] text-muted-foreground break-words">אפשר לעבור על הימים ולעדכן את המסלול.</p>
      <button
        type="button"
        onClick={onOpenItinerary}
        className="min-h-11 w-full rounded-xl bg-[color:var(--accent)] px-4 text-[14px] font-medium text-[color:var(--primary-foreground)]"
      >
        לעריכת המסלול
      </button>
    </PlanShell>
  );
}

/** No itinerary days exist yet. */
export function PlanStartCard({ onOpenItinerary }: { onOpenItinerary: () => void }) {
  return (
    <PlanShell title="מתחילים לתכנן">
      <p className="text-[13px] text-muted-foreground break-words">אפשר להתחיל ולבנות את ימי המסלול של הטיול.</p>
      <button
        type="button"
        onClick={onOpenItinerary}
        className="min-h-11 w-full rounded-xl bg-[color:var(--accent)] px-4 text-[14px] font-medium text-[color:var(--primary-foreground)]"
      >
        לבניית המסלול
      </button>
    </PlanShell>
  );
}
