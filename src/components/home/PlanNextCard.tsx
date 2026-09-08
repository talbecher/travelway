import { ChevronLeft } from "lucide-react";
import { hebDate, hebWeekday } from "@/lib/format";

type Entry = {
  id: string;
  entry_type: string;
  title: string;
  time_of_day: string | null;
};

/**
 * "ממשיכים לתכנן" — display only. Entries arrive already ordered by the
 * itinerary's own order; nothing is re-sorted here.
 */
export function PlanNextCard({
  dayNumber,
  date,
  cityLabel,
  entries,
  entryIcon,
  onOpenDay,
  onOpenItinerary,
}: {
  dayNumber: number;
  date: string;
  cityLabel: string | null;
  entries: Entry[];
  entryIcon: (t: string) => string;
  onOpenDay: () => void;
  onOpenItinerary: () => void;
}) {
  const visible = entries.slice(0, 3);
  const extra = Math.max(0, entries.length - 3);

  return (
    <section className="rounded-2xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">ממשיכים לתכנן</h2>
        <span className="text-[11px] text-muted-foreground">{hebWeekday(date)}</span>
      </div>

      <div className="text-[13px] text-muted-foreground">
        יום {dayNumber} · {hebDate(date)}
        {cityLabel ? ` · ${cityLabel}` : ""}
      </div>

      {visible.length > 0 && (
        <ul className="space-y-1.5">
          {visible.map((e) => (
            <li key={e.id} className="flex items-center gap-2 text-[13px]">
              <span className="shrink-0 text-base leading-none">{entryIcon(e.entry_type)}</span>
              <span className="min-w-0 flex-1 truncate">{e.title}</span>
              {e.time_of_day && (
                <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums" dir="ltr">
                  {e.time_of_day.slice(0, 5)}
                </span>
              )}
            </li>
          ))}
          {extra > 0 && <li className="pr-6 text-[11px] text-muted-foreground">+ {extra} נוספים</li>}
        </ul>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onOpenDay}
          className="min-h-11 flex-1 rounded-xl bg-[color:var(--accent)] px-4 text-[14px] font-medium text-[color:var(--primary-foreground)]"
        >
          פתח את היום
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
    </section>
  );
}

/** Shown when no upcoming day with content is available. */
export function PlanStartCard({ onOpenItinerary }: { onOpenItinerary: () => void }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 space-y-3">
      <h2 className="text-sm font-semibold">ממשיכים לתכנן</h2>
      <p className="text-[13px] text-muted-foreground">עוד לא נוספו פעילויות למסלול. אפשר להתחיל מהיום הראשון.</p>
      <button
        type="button"
        onClick={onOpenItinerary}
        className="min-h-11 w-full rounded-xl bg-[color:var(--accent)] px-4 text-[14px] font-medium text-[color:var(--primary-foreground)]"
      >
        פתח את המסלול
      </button>
    </section>
  );
}
