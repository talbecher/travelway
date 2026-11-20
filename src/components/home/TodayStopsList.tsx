import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronDown, Clock, ListOrdered, Navigation } from "lucide-react";
import { resolveDayLocation } from "@/lib/day-location";
import { navigationHref } from "@/lib/stop-navigation";
import { todayStopsTimeline } from "@/lib/today-stops";

export type TodayStopsEntry = {
  id: string;
  entry_type: string;
  icon_emoji?: string | null;
  title: string;
  location_name?: string | null;
  time_of_day: string | null;
  display_order?: number | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  google_maps_url?: string | null;
};

const ICONS: Record<string, string> = {
  flight: "✈️",
  hotel_checkin: "🏨",
  attraction: "⛩",
  food: "🍜",
  transport: "🚆",
  shopping: "🛍",
  note: "📝",
};

function hhmmNow(d: Date) {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Same link as the Live Now card, with the day screen's resolved coordinates. Notes have none. */
function stopHref(entry: TodayStopsEntry) {
  if (entry.entry_type === "note") return null;
  const point = resolveDayLocation(entry);
  return navigationHref({
    title: entry.location_name?.trim() || entry.title,
    latitude: point?.lat ?? null,
    longitude: point?.lng ?? null,
    google_maps_url: entry.google_maps_url,
  });
}

function RowTarget({
  dayId,
  entryId,
  onTap,
  label,
  className,
  children,
}: {
  dayId: string;
  entryId: string;
  onTap?: () => void;
  label: string;
  className: string;
  children: React.ReactNode;
}) {
  if (onTap) {
    return (
      <button
        type="button"
        onClick={onTap}
        aria-label={label}
        data-stop-tap={entryId}
        className={className}
      >
        {children}
      </button>
    );
  }
  return (
    <Link to="/itinerary/$dayId" params={{ dayId }} aria-label={label} className={className}>
      {children}
    </Link>
  );
}

/** Collapsed list of every stop today, in itinerary order; past stops are dimmed, never hidden. */
export function TodayStopsList({
  dayId,
  entries,
  onStopTap,
}: {
  dayId: string;
  entries: TodayStopsEntry[];
  /** When set, tapping a row opens the stop's actions (which include opening the day) instead of the day. */
  onStopTap?: (entryId: string) => void;
}) {
  const [clock, setClock] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const now = hhmmNow(clock);
  const stops = useMemo(() => todayStopsTimeline(entries, now), [entries, now]);
  if (stops.length === 0) return null;

  return (
    <details className="group rounded-xl bg-card shadow-sm">
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-3.5 py-2.5 [&::-webkit-details-marker]:hidden">
        <ListOrdered size={18} className="shrink-0 text-[color:var(--accent)]" aria-hidden="true" />
        <span className="min-w-0 flex-1 text-[14px] font-semibold">כל תחנות היום</span>
        <span className="text-[12px] text-muted-foreground tabular-nums">{stops.length}</span>
        <ChevronDown
          size={16}
          className="shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <ol className="space-y-1 border-t border-border px-2 pb-2 pt-1.5">
        {stops.map(({ entry, position, past }) => {
          const href = stopHref(entry);
          return (
            <li
              key={entry.id}
              data-past={past ? "true" : undefined}
              className={`flex min-w-0 items-center gap-1 rounded-lg ${past ? "opacity-55" : ""}`}
            >
              <RowTarget
                dayId={dayId}
                onTap={onStopTap ? () => onStopTap(entry.id) : undefined}
                entryId={entry.id}
                label={`${entry.title}${past ? " (השעה עברה)" : ""} · ${onStopTap ? "אפשרויות לתחנה" : "פתח את היום"}`}
                className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg px-1.5 py-1 text-right focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border text-[11px] font-bold tabular-nums">
                  {position + 1}
                </span>
                <span className="shrink-0 text-base" aria-hidden="true">
                  {entry.icon_emoji ?? ICONS[entry.entry_type] ?? "•"}
                </span>
                <span
                  className={`min-w-0 flex-1 truncate text-[14px] ${past ? "" : "font-medium"}`}
                >
                  {entry.title}
                </span>
                {entry.time_of_day && (
                  <span
                    className="inline-flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground tabular-nums"
                    dir="ltr"
                  >
                    <Clock size={11} aria-hidden="true" /> {entry.time_of_day.slice(0, 5)}
                  </span>
                )}
              </RowTarget>
              {href ? (
                <a
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`ניווט אל ${entry.title}`}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[color:var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Navigation size={18} />
                </a>
              ) : (
                <span className="h-11 w-11 shrink-0" aria-hidden="true" />
              )}
            </li>
          );
        })}
      </ol>
    </details>
  );
}
