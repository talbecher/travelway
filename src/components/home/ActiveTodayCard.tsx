import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { CalendarDays, ChevronDown, ChevronLeft, Clock, MapPin, Navigation, Route } from "lucide-react";

export type ActiveTodayEntry = {
  id: string;
  entry_type: string;
  icon_emoji?: string | null;
  title: string;
  location_name?: string | null;
  time_of_day: string | null;
  photo_url?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  google_maps_url?: string | null;
};

type DisplayEntry = {
  entry: ActiveTodayEntry;
  originalIndex: number;
  label?: string;
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
    return <span className="flex h-11 w-11 shrink-0 items-center justify-center text-lg" aria-hidden="true">{entry.icon_emoji ?? iconFor(entry.entry_type)}</span>;
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

function EntryRow({ item, emphasized }: { item: DisplayEntry; emphasized?: boolean }) {
  const { entry, originalIndex, label } = item;
  return (
    <div className="flex min-w-0 items-center gap-2.5 py-2">
      <span
        className={`relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold tabular-nums ${
          emphasized
            ? "border-[color:var(--accent)] bg-[color:var(--accent)] text-[color:var(--accent-foreground)]"
            : "border-border bg-card text-foreground"
        }`}
        aria-label={`תחנה ${originalIndex + 1}`}
      >
        {originalIndex + 1}
      </span>
      <div className="min-w-0 flex-1">
        {label && <p className={`text-[11px] font-medium ${emphasized ? "text-[color:var(--accent)]" : "text-muted-foreground"}`}>{label}</p>}
        <p className={`break-words text-[14px] leading-snug ${emphasized ? "font-bold" : "font-semibold"}`}>{entry.title}</p>
        {(entry.time_of_day || entry.location_name) && (
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
            {entry.time_of_day && <span className="inline-flex items-center gap-1 tabular-nums" dir="ltr"><Clock size={11} aria-hidden="true" /> {entry.time_of_day.slice(0, 5)}</span>}
            {entry.location_name && <span className="inline-flex min-w-0 items-center gap-1"><MapPin size={11} className="shrink-0" aria-hidden="true" /><span className="break-words">{entry.location_name}</span></span>}
          </div>
        )}
      </div>
      <EntryImage entry={entry} />
    </div>
  );
}

function SequenceConnector({ directional }: { directional: boolean }) {
  return (
    <div className="relative mr-3.5 h-4 w-px bg-border" aria-hidden="true">
      {directional
        ? <ChevronDown size={12} className="absolute -bottom-1.5 -right-[5.5px] text-[color:var(--accent)]" />
        : <span className="absolute bottom-0 right-1/2 h-1 w-1 translate-x-1/2 rounded-full bg-muted-foreground" />}
    </div>
  );
}

function CardShell({ children, planned = true }: { children: React.ReactNode; planned?: boolean }) {
  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div>
        <h2 className="text-[20px] font-semibold">היום שלכם</h2>
        {planned && <p className="text-[12px] text-muted-foreground">לפי התכנון</p>}
      </div>
      {children}
    </section>
  );
}

export function ActiveTodayLoadingCard() {
  return <CardShell><div className="space-y-2 animate-pulse"><div className="h-16 rounded-lg bg-muted" /><div className="h-11 rounded-lg bg-muted" /></div></CardShell>;
}

export function ActiveTodayErrorCard({ onRetry }: { onRetry: () => void }) {
  return <CardShell><p className="text-[13px] text-muted-foreground">לא הצלחנו לטעון את התכנון להיום.</p><button type="button" onClick={onRetry} className="min-h-11 w-full rounded-lg border border-border px-4 text-[14px] font-medium">נסו שוב</button></CardShell>;
}

export function ActiveTodayMissingCard() {
  return (
    <CardShell planned={false}>
      <div className="flex items-center gap-3 py-1"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent/10 text-[color:var(--accent)]"><CalendarDays size={20} /></span><p className="text-[14px] text-muted-foreground">אין במסלול רשומת יום להיום.</p></div>
      <Link to="/itinerary" className="flex min-h-11 w-full items-center justify-center gap-1 rounded-lg bg-[color:var(--accent)] px-4 font-semibold text-[color:var(--accent-foreground)]">לפתיחת המסלול <ChevronLeft size={16} /></Link>
    </CardShell>
  );
}

export function ActiveTodayCard({ dayId, entries }: { dayId: string; entries: ActiveTodayEntry[] }) {
  const [clock, setClock] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const indexedEntries = useMemo(() => entries.map((entry, originalIndex) => ({ entry, originalIndex })), [entries]);
  const timed = useMemo(
    () => indexedEntries.filter((item) => item.entry.time_of_day).sort((a, b) => (a.entry.time_of_day ?? "").localeCompare(b.entry.time_of_day ?? "")),
    [indexedEntries],
  );
  const currentTime = `${String(clock.getHours()).padStart(2, "0")}:${String(clock.getMinutes()).padStart(2, "0")}`;
  const reached = [...timed].reverse().find((item) => (item.entry.time_of_day ?? "").slice(0, 5) <= currentTime) ?? null;
  const next = timed.find((item) => (item.entry.time_of_day ?? "").slice(0, 5) > currentTime) ?? null;
  const navigationTarget = next?.entry ?? reached?.entry ?? null;

  if (entries.length === 0) {
    return (
      <CardShell planned={false}>
        <div className="text-center">
          <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-accent/10 text-[color:var(--accent)]"><Route size={19} /></span>
          <h3 className="mt-1.5 text-[18px] font-semibold">מה מתחשק לכם היום?</h3>
          <p className="mt-0.5 text-[13px] text-muted-foreground">אפשר להתחיל ממקום ששמרתם.</p>
        </div>
        <Link to="/itinerary/$dayId" params={{ dayId }} className="flex min-h-11 w-full items-center justify-center rounded-lg bg-[color:var(--accent)] px-4 font-semibold text-[color:var(--accent-foreground)]">לתכנון היום</Link>
        <Link to="/recommendations" className="-mt-2 flex min-h-11 items-center justify-center gap-1 text-[13px] font-medium text-[color:var(--accent)]">למקומות השמורים <ChevronLeft size={15} /></Link>
      </CardShell>
    );
  }

  const hasTimes = timed.length > 0;
  const displayed: DisplayEntry[] = hasTimes
    ? [
        ...(reached ? [{ ...reached, label: next ? "האחרונה ששעתה הגיעה" : "הפעילות האחרונה בתכנון" }] : []),
        ...(next ? [{ ...next, label: reached ? "הפעילות הבאה" : "מתחילים ב…" }] : []),
      ]
    : indexedEntries.slice(0, 3);
  const displayedIds = new Set(displayed.map((item) => item.entry.id));
  const remainingCount = entries.filter((entry) => !displayedIds.has(entry.id)).length;

  return (
    <CardShell>
      <div>
        {displayed.map((item, index) => {
          const following = displayed[index + 1];
          return (
            <div key={item.entry.id}>
              <EntryRow item={item} emphasized={item.entry.id === next?.entry.id} />
              {following && <SequenceConnector directional={following.originalIndex === item.originalIndex + 1} />}
            </div>
          );
        })}
        {remainingCount > 0 && <p className="mr-9 mt-1 text-[11px] text-muted-foreground">{remainingCount === 1 ? "ועוד תחנה אחת ביום המלא" : `ועוד ${remainingCount} תחנות ביום המלא`}</p>}
      </div>
      <Link to="/itinerary/$dayId" params={{ dayId }} className="flex min-h-11 w-full items-center justify-center rounded-lg bg-[color:var(--accent)] px-4 font-semibold text-[color:var(--accent-foreground)]">פתחו את היום</Link>
      {navigationTarget && <a href={navigationHref(navigationTarget)} target="_blank" rel="noreferrer" className="flex min-h-11 items-center justify-center gap-1.5 text-[13px] font-medium text-[color:var(--accent)]"><Navigation size={15} /> ניווט אל {navigationTarget.title}</a>}
    </CardShell>
  );
}