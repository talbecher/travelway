import { useEffect, useRef } from "react";
import { ChevronLeft, MapPin } from "lucide-react";
import { hebDate, hebWeekday } from "@/lib/format";

export type PlanningDay = {
  id: string;
  day_number: number;
  date: string;
  city_label?: string | null;
};

export type PlanningEntry = {
  id: string;
  title: string;
  icon_emoji?: string | null;
};

function Shell({
  title = "ממשיכים לתכנן",
  onOpenItinerary,
  children,
}: {
  title?: string;
  onOpenItinerary?: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2.5 rounded-[22px] bg-card px-3.5 py-3 shadow-sm">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
        <h2 className="min-w-0 break-words text-[18px] font-semibold">{title}</h2>
        {onOpenItinerary && (
          <button type="button" onClick={onOpenItinerary} className="inline-flex min-h-11 shrink-0 items-center gap-1 text-[12px] text-muted-foreground">
            לכל המסלול
            <ChevronLeft size={14} aria-hidden="true" />
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

function DayPicker({
  days,
  selectedDayId,
  onSelectDay,
}: {
  days: PlanningDay[];
  selectedDayId: string | null;
  onSelectDay: (id: string) => void;
}) {
  const showCity = days.length > 0 && days.every((day) => Boolean(day.city_label));
  const scrollerRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLButtonElement>(null);
  const lastRevealedId = useRef<string | null>(null);

  useEffect(() => {
    if (!selectedDayId || lastRevealedId.current === selectedDayId) return;
    const scroller = scrollerRef.current;
    const selected = selectedRef.current;
    if (!scroller || !selected) return;
    const target = selected.offsetLeft - (scroller.clientWidth - selected.clientWidth) / 2;
    scroller.scrollTo({ left: target, behavior: "smooth" });
    lastRevealedId.current = selectedDayId;
  }, [selectedDayId]);

  return (
    <div ref={scrollerRef} className="no-scrollbar -mx-4 overflow-x-auto px-4 overscroll-x-contain" dir="rtl">
      <div className="flex w-max min-w-full gap-2 pb-1">
        {days.map((day) => {
          const selected = day.id === selectedDayId;
          return (
            <button
              key={day.id}
              ref={selected ? selectedRef : undefined}
              type="button"
              aria-pressed={selected}
              onClick={() => onSelectDay(day.id)}
              className={
                "min-h-[56px] w-[86px] shrink-0 rounded-lg border px-2 py-1.5 text-center transition-colors duration-200 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
                (selected
                  ? "border-transparent bg-[color:var(--accent)] text-[color:var(--accent-foreground)]"
                  : "border-border bg-surface-2 text-foreground")
              }
            >
              <span className="block text-[11px] font-semibold">יום {day.day_number}</span>
              <span className={"block text-[10px] " + (selected ? "text-[color:var(--accent-foreground)]/85" : "text-muted-foreground")}>{hebDate(day.date)}</span>
              {showCity && <span className="mt-0.5 block truncate text-[10px]">{day.city_label}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function PlanLoadingCard() {
  return (
    <Shell>
      <div className="flex gap-2 overflow-hidden">
        {[0, 1, 2].map((item) => <div key={item} className="h-[56px] w-[86px] shrink-0 animate-pulse rounded-lg bg-muted" />)}
      </div>
      <div className="h-5 w-2/3 animate-pulse rounded bg-muted" />
      <div className="h-11 w-full animate-pulse rounded-lg bg-muted" />
    </Shell>
  );
}

export function PlanErrorCard({ onRetry }: { onRetry: () => void }) {
  return (
    <Shell>
      <p className="text-[13px] text-muted-foreground">לא הצלחנו לטעון את המסלול כרגע.</p>
      <button type="button" onClick={onRetry} className="min-h-11 w-full rounded-lg border border-border px-4 text-[14px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">נסה שוב</button>
    </Shell>
  );
}

export function PlanStartCard({ onOpenItinerary }: { onOpenItinerary: () => void }) {
  return (
    <Shell title="מתחילים לתכנן">
      <p className="text-[13px] text-muted-foreground">אפשר להתחיל ולבנות את ימי המסלול של הטיול.</p>
      <PrimaryAction onClick={onOpenItinerary}>לבניית המסלול</PrimaryAction>
    </Shell>
  );
}

function PrimaryAction({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="min-h-11 w-full rounded-[15px] bg-[color:var(--accent)] px-4 text-[15px] font-semibold text-[color:var(--accent-foreground)] transition-opacity duration-200 motion-reduce:transition-none active:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
      {children}
    </button>
  );
}

export function PlanNextCard({
  days,
  selectedDayId,
  entries,
  emptyCount,
  showReviewPrompt,
  onSelectDay,
  onOpenDay,
  onOpenItinerary,
}: {
  days: PlanningDay[];
  selectedDayId: string | null;
  entries: PlanningEntry[];
  emptyCount: number;
  showReviewPrompt: boolean;
  onSelectDay: (id: string) => void;
  onOpenDay: () => void;
  onOpenItinerary: () => void;
}) {
  const selectedDay = days.find((day) => day.id === selectedDayId) ?? null;
  const isEmpty = Boolean(selectedDay) && entries.length === 0;

  return (
    <Shell onOpenItinerary={onOpenItinerary}>
      <DayPicker days={days} selectedDayId={selectedDayId} onSelectDay={onSelectDay} />

      {emptyCount > 0 && (
        <p className="text-[11px] text-muted-foreground/80">
          {emptyCount === 1 ? "יום אחד במסלול ללא פעילויות" : `${emptyCount} ימים במסלול ללא פעילויות`}
        </p>
      )}

      {showReviewPrompt && !selectedDay ? (
        <div className="space-y-2.5">
          <p className="text-[13px] text-muted-foreground">אפשר לעבור על הימים ולעדכן את המסלול.</p>
          <PrimaryAction onClick={onOpenItinerary}>לעריכת המסלול</PrimaryAction>
        </div>
      ) : selectedDay ? (
        <div className="space-y-2.5">
          <div className="min-w-0">
            <h3 className="break-words text-[19px] font-semibold leading-tight">
              {isEmpty
                ? selectedDay.city_label ? `מה עושים ב${selectedDay.city_label}?` : "מה מתכננים ליום הזה?"
                : selectedDay.city_label ?? `יום ${selectedDay.day_number}`}
            </h3>
            <p className="mt-0.5 text-[12px] text-muted-foreground">{hebWeekday(selectedDay.date)} · {hebDate(selectedDay.date)}</p>
          </div>

          {isEmpty ? (
            <p className="text-[13px] text-muted-foreground">היום הזה פתוח לרעיונות</p>
          ) : (
            <ul className="space-y-1.5">
              {entries.slice(0, 3).map((entry) => (
                <li key={entry.id} className="flex min-w-0 items-start gap-2 text-[13px] leading-snug">
                  <span className="mt-0.5 shrink-0 text-sm" aria-hidden="true">{entry.icon_emoji || <MapPin size={14} />}</span>
                  <span className="min-w-0 line-clamp-2 break-words">{entry.title}</span>
                </li>
              ))}
            </ul>
          )}

          <PrimaryAction onClick={onOpenDay}>{isEmpty ? "בואו נתכנן את היום" : "להמשך תכנון היום"}</PrimaryAction>
          {isEmpty && <p className="text-[11px] text-muted-foreground">יום מנוחה או מעבר? אפשר להשאיר אותו כך.</p>}
        </div>
      ) : null}
    </Shell>
  );
}