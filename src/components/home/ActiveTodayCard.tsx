import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { CalendarDays, ChevronLeft, Clock, MapPin, Navigation, Route } from "lucide-react";

export type ActiveTodayEntry = {
  id: string;
  entry_type: string;
  icon_emoji?: string | null;
  title: string;
  time_of_day: string | null;
  photo_url?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  google_maps_url?: string | null;
};

function iconFor(type: string) {
  const icons: Record<string, string> = {
    flight: "✈️",
    hotel_checkin: "🏨",
    attraction: "⛩",
    food: "🍜",
    transport: "🚆",
    shopping: "🛍",
    note: "📝",
  };
  return icons[type] ?? "•";
}

function navigationHref(entry: ActiveTodayEntry) {
  if (entry.google_maps_url) return entry.google_maps_url;
  if (entry.latitude != null && entry.longitude != null) {
    return `https://www.google.com/maps/dir/?api=1&destination=${entry.latitude},${entry.longitude}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(entry.title)}`;
}

function EntryImage({ entry }: { entry: ActiveTodayEntry }) {
  const [failed, setFailed] = useState(false);
  if (!entry.photo_url || failed) {
    return (
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-muted text-xl" aria-hidden="true">
        {entry.icon_emoji ?? iconFor(entry.entry_type)}
      </span>
    );
  }
  return (
    <img
      src={entry.photo_url}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className="h-12 w-12 shrink-0 rounded-lg object-cover"
    />
  );
}

function EntryRow({ entry, label }: { entry: ActiveTodayEntry; label?: string }) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-lg bg-surface-2 px-2.5 py-2">
      <EntryImage entry={entry} />
      <div className="min-w-0 flex-1">
        {label && <p className="text-[11px] font-medium text-muted-foreground">{label}</p>}
        <p className="break-words text-[14px] font-semibold leading-snug">{entry.title}</p>
        {entry.time_of_day && (
          <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-muted-foreground" dir="ltr">
            <Clock size={12} aria-hidden="true" /> {entry.time_of_day.slice(0, 5)}
          </p>
        )}
      </div>
    </div>
  );
}

function CardShell({ children }: { children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div>
        <h2 className="text-[20px] font-semibold">היום שלכם</h2>
        <p className="text-[12px] text-muted-foreground">לפי התכנון</p>
      </div>
      {children}
    </section>
  );
}

export function ActiveTodayLoadingCard() {
  return (
    <CardShell>
      <div className="space-y-2 animate-pulse">
        <div className="h-16 rounded-lg bg-muted" />
        <div className="h-11 rounded-lg bg-muted" />
      </div>
    </CardShell>
  );
}

export function ActiveTodayErrorCard({ onRetry }: { onRetry: () => void }) {
  return (
    <CardShell>
      <p className="text-[13px] text-muted-foreground">לא הצלחנו לטעון את התכנון להיום.</p>
      <button type="button" onClick={onRetry} className="min-h-11 w-full rounded-lg border border-border px-4 text-[14px] font-medium">
        נסו שוב
      </button>
    </CardShell>
  );
}

export function ActiveTodayMissingCard() {
  return (
    <CardShell>
      <div className="flex items-center gap-3 py-1">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent/10 text-[color:var(--accent)]"><CalendarDays size={20} /></span>
        <p className="text-[14px] text-muted-foreground">אין במסלול רשומת יום להיום.</p>
      </div>
      <Link to="/itinerary" className="flex min-h-11 w-full items-center justify-center gap-1 rounded-lg bg-[color:var(--accent)] px-4 font-semibold text-[color:var(--accent-foreground)]">
        לפתיחת המסלול <ChevronLeft size={16} />
      </Link>
    </CardShell>
  );
}

export function ActiveTodayCard({
  dayId,
  entries,
}: {
  dayId: string;
  entries: ActiveTodayEntry[];
}) {
  const [clock, setClock] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const timed = useMemo(
    () => entries.filter((entry) => entry.time_of_day).sort((a, b) => (a.time_of_day ?? "").localeCompare(b.time_of_day ?? "")),
    [entries],
  );
  const currentTime = `${String(clock.getHours()).padStart(2, "0")}:${String(clock.getMinutes()).padStart(2, "0")}`;
  const reached = [...timed].reverse().find((entry) => (entry.time_of_day ?? "").slice(0, 5) <= currentTime) ?? null;
  const next = timed.find((entry) => (entry.time_of_day ?? "").slice(0, 5) > currentTime) ?? null;
  const navigationTarget = next ?? reached;

  if (entries.length === 0) {
    return (
      <CardShell>
        <div className="py-1 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 text-[color:var(--accent)]"><Route size={23} /></span>
          <h3 className="mt-2 text-[18px] font-semibold">מה מתחשק לכם היום?</h3>
          <p className="mt-0.5 text-[13px] text-muted-foreground">אפשר להתחיל ממקום ששמרתם.</p>
        </div>
        <Link to="/itinerary/$dayId" params={{ dayId }} className="flex min-h-11 w-full items-center justify-center rounded-lg bg-[color:var(--accent)] px-4 font-semibold text-[color:var(--accent-foreground)]">
          לתכנון היום
        </Link>
        <Link to="/recommendations" className="flex min-h-11 items-center justify-center gap-1 text-[13px] font-medium text-[color:var(--accent)]">
          למקומות השמורים <ChevronLeft size={15} />
        </Link>
      </CardShell>
    );
  }

  const hasTimes = timed.length > 0;
  return (
    <CardShell>
      <div className="space-y-2">
        {hasTimes ? (
          <>
            {reached && <EntryRow entry={reached} label={next ? "האחרונה ששעתה הגיעה" : "הפעילות האחרונה בתכנון"} />}
            {next && <EntryRow entry={next} label={reached ? "הפעילות הבאה" : "מתחילים ב…"} />}
            {entries.length > timed.length && (
              <p className="text-[11px] text-muted-foreground">פעילויות נוספות ללא שעה מופיעות ביום המלא.</p>
            )}
          </>
        ) : (
          <>
            {entries.slice(0, 3).map((entry) => <EntryRow key={entry.id} entry={entry} />)}
            {entries.length > 3 && <p className="text-[11px] text-muted-foreground">ועוד {entries.length - 3} תחנות ביום המלא</p>}
          </>
        )}
      </div>

      <Link to="/itinerary/$dayId" params={{ dayId }} className="flex min-h-11 w-full items-center justify-center rounded-lg bg-[color:var(--accent)] px-4 font-semibold text-[color:var(--accent-foreground)]">
        פתחו את היום
      </Link>
      {navigationTarget && (
        <a href={navigationHref(navigationTarget)} target="_blank" rel="noreferrer" className="flex min-h-11 items-center justify-center gap-1.5 text-[13px] font-medium text-[color:var(--accent)]">
          <Navigation size={15} /> ניווט אל {navigationTarget.title}
        </a>
      )}
    </CardShell>
  );
}