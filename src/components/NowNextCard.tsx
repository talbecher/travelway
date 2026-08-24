import { useEffect, useMemo, useState } from "react";
import { MapPin, Navigation, ChevronLeft, Clock } from "lucide-react";
import { haversine, fmtDistance } from "@/lib/geo";

export type NowNextEntry = {
  id: string;
  entry_type: string;
  title: string;
  time_of_day: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  google_maps_url?: string | null;
};

function iconFor(t: string) {
  const m: Record<string, string> = {
    flight: "✈️",
    hotel_checkin: "🏨",
    attraction: "⛩",
    food: "🍜",
    transport: "🚆",
    shopping: "🛍",
    note: "📝",
  };
  return m[t] ?? "•";
}

function nowHHMM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function mapsHref(e: NowNextEntry) {
  if (e.google_maps_url) return e.google_maps_url;
  if (e.latitude != null && e.longitude != null) {
    return `https://www.google.com/maps/dir/?api=1&destination=${e.latitude},${e.longitude}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(e.title)}`;
}

function Row({
  label,
  entry,
  distance,
  strong,
}: {
  label: string;
  entry: NowNextEntry;
  distance: number | null;
  strong?: boolean;
}) {
  return (
    <div
      className={
        "flex items-center gap-2.5 rounded-xl border p-2.5 " +
        (strong
          ? "border-[color:var(--accent)] bg-[color:var(--surface-2)]"
          : "border-border bg-background")
      }
    >
      <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center text-lg shrink-0">
        {iconFor(entry.entry_type)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] text-muted-foreground">{label}</div>
        <div className="text-[14px] font-semibold truncate">{entry.title}</div>
        <div className="text-[11px] text-muted-foreground flex items-center gap-2 mt-0.5">
          {entry.time_of_day && (
            <span className="tabular-nums inline-flex items-center gap-1" dir="ltr">
              <Clock size={11} /> {entry.time_of_day.slice(0, 5)}
            </span>
          )}
          {distance != null && (
            <span className="tabular-nums inline-flex items-center gap-1" dir="ltr">
              <MapPin size={11} /> {fmtDistance(distance)}
            </span>
          )}
        </div>
      </div>
      <a
        href={mapsHref(entry)}
        target="_blank"
        rel="noreferrer"
        aria-label="ניווט"
        className="w-9 h-9 rounded-full flex items-center justify-center bg-[color:var(--surface-2)] border border-border shrink-0"
      >
        <Navigation size={15} />
      </a>
    </div>
  );
}

export function NowNextCard({
  entries,
  dayNumber,
  cityLabel,
  onOpenDay,
}: {
  entries: NowNextEntry[];
  dayNumber: number;
  cityLabel?: string | null;
  onOpenDay: () => void;
}) {
  const [clock, setClock] = useState(() => nowHHMM());
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    const t = setInterval(() => setClock(nowHHMM()), 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => undefined,
      { timeout: 8000, maximumAge: 5 * 60_000 },
    );
  }, []);

  const { current, next } = useMemo(() => {
    const timed = entries
      .filter((e) => !!e.time_of_day)
      .sort((a, b) => (a.time_of_day! < b.time_of_day! ? -1 : 1));
    if (timed.length === 0) {
      return { current: null as NowNextEntry | null, next: entries[0] ?? null };
    }
    let cur: NowNextEntry | null = null;
    let nxt: NowNextEntry | null = null;
    for (const e of timed) {
      if (e.time_of_day!.slice(0, 5) <= clock) cur = e;
      else if (!nxt) nxt = e;
    }
    return { current: cur, next: nxt };
  }, [entries, clock]);

  const distOf = (e: NowNextEntry | null) => {
    if (!e || !userPos || e.latitude == null || e.longitude == null) return null;
    return haversine(
      { lat: userPos.lat, lon: userPos.lng },
      { lat: Number(e.latitude), lon: Number(e.longitude) },
    );
  };

  if (!current && !next) return null;

  return (
    <section className="bg-card border border-border rounded-2xl p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          מה עכשיו?
        </div>
        <button
          onClick={onOpenDay}
          className="text-[12px] text-[color:var(--accent)] flex items-center gap-1 shrink-0"
        >
          יום {dayNumber}
          {cityLabel ? <span dir="ltr"> · {cityLabel}</span> : null}
          <ChevronLeft size={14} />
        </button>
      </div>

      <div className="mt-3 space-y-2">
        {current && <Row label="עכשיו" entry={current} distance={distOf(current)} strong />}
        {next && <Row label={current ? "הבא בתור" : "מתחילים ב"} entry={next} distance={distOf(next)} />}
        {!next && current && (
          <div className="text-[12px] text-muted-foreground text-center py-1">
            זה הפריט האחרון להיום 🎉
          </div>
        )}
      </div>
    </section>
  );
}
