import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { Calendar, Wallet, Star, Plus, AlertTriangle, MapPin, CheckCircle2, CalendarDays, ChevronLeft, MessagesSquare, FileText } from "lucide-react";
import { useTrip, useExpenses, useDays, useRecs, useHotels } from "@/hooks/use-trip";
import { useActiveTripId } from "@/hooks/use-active-trip";
import { supabase } from "@/integrations/supabase/client";
import { ils, todayISO, daysBetween, hebDate } from "@/lib/format";
import { openQuickExpense } from "@/components/GlobalFab";
import { useCurrentWeather, useDayWeather } from "@/hooks/use-weather";
import { WeatherIcon } from "@/components/WeatherIcon";
import { WEATHER_LABELS_HE } from "@/lib/weather";


function HomeWeatherChip({ city, date }: { city: string | null; date: string | null }) {
  const w = useDayWeather(city, date);
  if (!w) return null;
  const label = WEATHER_LABELS_HE[w.condition];
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-border"
      style={{ background: "color-mix(in oklab, var(--card) 60%, transparent)" }}
    >
      <WeatherIcon condition={w.condition} size="sm" />
      <span className="font-semibold tabular-nums" dir="ltr">{w.tempMax}°</span>
      {label && <span className="text-muted-foreground">{label}</span>}
    </span>
  );
}

export const Route = createFileRoute("/")({
  component: Home,
});

/* ---------- helpers ---------- */

const COUNTRY_FLAGS: Array<[RegExp, string]> = [
  [/יפן|japan/i, "🇯🇵"],
  [/צרפת|france/i, "🇫🇷"],
  [/איטליה|italy/i, "🇮🇹"],
  [/ספרד|spain/i, "🇪🇸"],
  [/יוון|greece/i, "🇬🇷"],
  [/ארה"?ב|ארהב|usa|united states|america/i, "🇺🇸"],
  [/תאילנד|thailand/i, "🇹🇭"],
  [/בריטניה|אנגליה|uk|britain|england/i, "🇬🇧"],
  [/גרמניה|germany/i, "🇩🇪"],
  [/הולנד|netherlands/i, "🇳🇱"],
  [/פורטוגל|portugal/i, "🇵🇹"],
  [/טורקיה|turkey/i, "🇹🇷"],
  [/וייטנאם|vietnam/i, "🇻🇳"],
  [/הודו|india/i, "🇮🇳"],
  [/סין|china/i, "🇨🇳"],
];
function flagFor(dest?: string | null): string {
  if (!dest) return "🌍";
  for (const [rx, flag] of COUNTRY_FLAGS) if (rx.test(dest)) return flag;
  return "🌍";
}

function iconFor(t: string) {
  const m: Record<string, string> = {
    flight: "✈️", hotel_checkin: "🏨", attraction: "⛩",
    food: "🍜", transport: "🚆", note: "📝",
  };
  return m[t] ?? "•";
}

type EntrySlim = {
  id: string;
  day_id: string;
  entry_type: string;
  title: string;
  time_of_day: string | null;
};

/* ---------- page ---------- */

function Home() {
  const navigate = useNavigate();
  const tripId = useActiveTripId();
  const { data: trip, isLoading } = useTrip();
  const { data: expenses = [] } = useExpenses();
  const { data: days = [] } = useDays();
  const { data: recs = [] } = useRecs();
  const { data: hotels = [] } = useHotels();

  const { data: entriesByDay = {} } = useQuery<Record<string, EntrySlim[]>>({
    queryKey: ["day-entries-summary", tripId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("day_entries")
        .select("id, day_id, entry_type, title, time_of_day, itinerary_days!inner(trip_id)")
        .eq("itinerary_days.trip_id", tripId)
        .order("display_order")
        .order("created_at");
      if (error) throw error;
      const map: Record<string, EntrySlim[]> = {};
      for (const e of (data ?? []) as unknown as EntrySlim[]) (map[e.day_id] ||= []).push(e);
      return map;
    },
  });

  const stats = useMemo(() => {
    if (!trip) return null;
    const spent = expenses.reduce((s, e) => s + Number(e.amount_ils), 0);
    const budget = Number(trip.total_budget_ils);
    const remaining = budget - spent;
    const pct = budget > 0 ? Math.min(100, (spent / budget) * 100) : 0;
    const today = todayISO();
    const daysTotal = days.length;
    const daysPassed = Math.max(0, Math.min(daysTotal, days.filter((d) => d.date <= today).length));
    const daysLeft = Math.max(1, daysTotal - daysPassed + 1);
    const daily = remaining / daysLeft;
    const beforeTrip = today < trip.start_date;
    const afterTrip = today > trip.end_date;
    const daysToStart = daysBetween(today, trip.start_date);
    const tripProgressPct = daysTotal > 0 ? Math.round((daysPassed / daysTotal) * 100) : 0;
    return { spent, budget, remaining, pct, daysTotal, daysPassed, daily, beforeTrip, afterTrip, daysToStart, tripProgressPct };
  }, [trip, expenses, days]);

  const todayDay = useMemo(() => {
    const t = todayISO();
    return days.find((d) => d.date === t) ?? null;
  }, [days]);

  const nextDay = useMemo(() => {
    const t = todayISO();
    for (const d of days) {
      if (d.date >= t && (entriesByDay[d.id]?.length ?? 0) > 0) return d;
    }
    return null;
  }, [days, entriesByDay]);

  const stats2 = useMemo(() => {
    const saved = recs.length;
    const visited = recs.filter((r: { status?: string | null }) => r.status === "visited").length;
    const planned = days.reduce((n, d) => n + ((entriesByDay[d.id]?.length ?? 0) > 0 ? 1 : 0), 0);
    return { saved, visited, planned };
  }, [recs, days, entriesByDay]);

  const upcomingHotelDeadlines = useMemo(() => {
    const t = todayISO();
    return (hotels ?? [])
      .filter((h: { cancellation_deadline?: string | null }) => {
        if (!h.cancellation_deadline) return false;
        const d = daysBetween(t, h.cancellation_deadline);
        return d >= 0 && d <= 7;
      })
      .sort((a, b) => (a.cancellation_deadline! < b.cancellation_deadline! ? -1 : 1));
  }, [hotels]);

  if (isLoading) return <HomeSkeleton />;

  if (!trip) {
    return (
      <div className="pt-16 text-center space-y-4">
        <div className="text-5xl">🧭</div>
        <h1 className="text-2xl font-medium">אין טיול פעיל</h1>
        <p className="text-sm text-muted-foreground">בואו ניצור טיול חדש</p>
        <Link to="/onboarding"
          className="inline-block px-6 h-12 leading-[3rem] rounded-lg bg-[color:var(--terracotta)] text-white font-medium">
          צור טיול חדש
        </Link>
      </div>
    );
  }

  const sections: Array<{ key: string; node: React.ReactNode }> = [];

  // 1. HERO
  const heroWeatherCity =
    days.find((d) => d.city_label)?.city_label ?? trip.destination_country ?? null;
  sections.push({
    key: "hero",
    node: (
      <HeroCard
        title={trip.title}
        flag={flagFor(trip.destination_country)}
        startDate={trip.start_date}
        endDate={trip.end_date}
        status={stats?.beforeTrip ? "future" : stats?.afterTrip ? "past" : "active"}
        daysToStart={stats?.daysToStart ?? 0}
        daysPassed={stats?.daysPassed ?? 0}
        daysTotal={stats?.daysTotal ?? 0}
        tripProgressPct={stats?.tripProgressPct ?? 0}
        weatherCity={heroWeatherCity}
      />
    ),
  });


  // 2 or 3. TODAY / NEXT
  if (todayDay && stats && !stats.beforeTrip && !stats.afterTrip) {
    const entries = entriesByDay[todayDay.id] ?? [];
    sections.push({
      key: "today",
      node: (
        <DayPreviewCard
          heading={`היום — יום ${todayDay.day_number}${todayDay.city_label ? ` · ${todayDay.city_label}` : ""}`}
          entries={entries}
          maxVisible={4}
          onOpen={() => navigate({ to: "/itinerary/$dayId", params: { dayId: todayDay.id } })}
          emptyLabel="היום ריק — רוצה לתכנן?"
          openLabel="פתח את היום"
        />
      ),
    });
  } else if (stats?.beforeTrip && nextDay) {
    const entries = entriesByDay[nextDay.id] ?? [];
    sections.push({
      key: "next",
      node: (
        <DayPreviewCard
          heading={`היום הבא המתוכנן — יום ${nextDay.day_number}`}
          subheading={hebDate(nextDay.date)}
          entries={entries}
          maxVisible={3}
          onOpen={() => navigate({ to: "/itinerary/$dayId", params: { dayId: nextDay.id } })}
          emptyLabel=""
          openLabel="פתח את היום"
        />
      ),
    });
  }

  // 4. BUDGET
  if (stats) {
    sections.push({
      key: "budget",
      node: (
        <section className="bg-card border border-border rounded-2xl p-5">
          <div className="flex items-center gap-5">
            <ProgressRing pct={stats.pct} size={80} label={`${Math.round(stats.pct)}%`} />
            <div className="flex-1 min-w-0">
              <div className="text-xs text-muted-foreground">נשאר</div>
              <motion.div
                key={stats.remaining}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-[28px] font-semibold tabular-nums leading-none mt-1"
              >
                {ils(stats.remaining)}
              </motion.div>
              <div className="grid grid-cols-2 gap-3 mt-3 text-xs">
                <div>
                  <div className="text-muted-foreground">הוצאנו</div>
                  <div className="font-medium tabular-nums">{ils(stats.spent)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">ליום</div>
                  <div className="font-medium tabular-nums">{ils(stats.daily)}</div>
                </div>
              </div>
            </div>
          </div>
        </section>
      ),
    });
  }

  // 5. QUICK STATS
  const weatherTarget = (() => {
    const today = todayISO();
    const target = days.find((d) => d.date >= today) ?? days[0];
    if (!target) return null;
    const diff = daysBetween(today, target.date);
    if (diff < 0 || diff > 15) return null;
    return { city: target.city_label ?? null, date: target.date };
  })();
  sections.push({
    key: "stats",
    node: (
      <section className="flex flex-wrap gap-2">
        {weatherTarget && <HomeWeatherChip city={weatherTarget.city} date={weatherTarget.date} />}
        <StatChip icon={<MapPin size={14} />} value={stats2.saved} label="מקומות שמורים" to="/recommendations" />
        <StatChip icon={<CheckCircle2 size={14} />} value={stats2.visited} label="ביקרנו" to="/recommendations" />
        <StatChip icon={<CalendarDays size={14} />} value={stats2.planned} label="ימים מתוכננים" to="/itinerary" />
      </section>
    ),
  });


  // 6. QUICK ACTIONS
  sections.push({
    key: "actions",
    node: (
      <section className="grid grid-cols-2 gap-3">
        <ActionTile icon={Calendar} label="מסלול הטיול" to="/itinerary" />
        <ActionTile icon={Star} label="המלצות" to="/recommendations" />
        <ActionTile icon={Wallet} label="תקציב" to="/budget" />
        <ActionTile icon={MessagesSquare} label="שיחון" to="/phrasebook" />
        <ActionTile icon={Plus} label="הוצאה מהירה" onClick={openQuickExpense} accent />
        <ActionTile icon={FileText} label="מסמכים" disabled />
      </section>
    ),
  });

  // 7. HOTEL ALERTS
  if (upcomingHotelDeadlines.length > 0) {
    sections.push({
      key: "alerts",
      node: (
        <section className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <AlertTriangle size={16} className="text-[color:var(--accent-2)]" />
            <span>דדליינים קרובים</span>
          </div>
          <div className="space-y-2">
            {upcomingHotelDeadlines.map((h: { id: string; hotel_name: string; cancellation_deadline: string | null }) => {
              const d = daysBetween(todayISO(), h.cancellation_deadline!);
              return (
                <div key={h.id} className="bg-card border border-border rounded-xl px-4 py-3 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{h.hotel_name}</div>
                    <div className="text-xs text-muted-foreground">ביטול חינם עד {hebDate(h.cancellation_deadline!)}</div>
                  </div>
                  <div className="text-xs font-medium text-[color:var(--accent-2)] shrink-0">
                    {d === 0 ? "היום" : `בעוד ${d} י׳`}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ),
    });
  }

  return (
    <div className="pt-4 pb-8 flex flex-col gap-4">
      {sections.map((s, i) => (
        <motion.div
          key={s.key}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: i * 0.08, ease: "easeOut" }}
        >
          {s.node}
        </motion.div>
      ))}
    </div>
  );
}

/* ---------- pieces ---------- */

function HeroCard(props: {
  title: string; flag: string; startDate: string; endDate: string;
  status: "future" | "active" | "past";
  daysToStart: number; daysPassed: number; daysTotal: number; tripProgressPct: number;
}) {
  const { title, flag, startDate, endDate, status, daysToStart, daysPassed, daysTotal, tripProgressPct } = props;
  const pill =
    status === "future"
      ? { text: `עוד ${daysToStart} ימים`, cls: "bg-amber-400/20 text-amber-300 border-amber-300/30", dot: false }
      : status === "active"
      ? { text: `יום ${Math.min(daysPassed, daysTotal)} מתוך ${daysTotal}`, cls: "bg-emerald-400/20 text-emerald-300 border-emerald-300/30", dot: true }
      : { text: "הסתיים", cls: "bg-white/10 text-white/70 border-white/20", dot: false };

  return (
    <section
      className="relative overflow-hidden rounded-2xl px-5 py-4 text-white"
      style={{
        height: 160,
        background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
      }}
    >
      <div className="flex flex-col justify-between h-full">
        <div className="flex items-start gap-2 min-w-0 pr-[76px]">
          <div className="text-[28px] font-bold leading-tight truncate">{title}</div>
          <div className="text-[26px] leading-tight shrink-0">{flag}</div>
        </div>
        <div className="text-sm text-white/70" dir="ltr">
          {hebDate(startDate)} → {hebDate(endDate)}
        </div>
        <div>
          <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border ${pill.cls}`}>
            {pill.dot && <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-300"></span>
            </span>}
            {pill.text}
          </span>
        </div>
      </div>
      <div className="absolute bottom-3 left-3">
        <ProgressRing pct={tripProgressPct} size={56} label={`${daysPassed}/${daysTotal}`} stroke="rgba(255,255,255,0.85)" track="rgba(255,255,255,0.18)" textColor="#fff" fontSize={11} />
      </div>
    </section>
  );
}

function DayPreviewCard(props: {
  heading: string;
  subheading?: string;
  entries: EntrySlim[];
  maxVisible: number;
  onOpen: () => void;
  emptyLabel: string;
  openLabel: string;
}) {
  const { heading, subheading, entries, maxVisible, onOpen, emptyLabel, openLabel } = props;
  const visible = entries.slice(0, maxVisible);
  const extra = Math.max(0, entries.length - maxVisible);
  return (
    <section className="bg-card border border-border rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-medium truncate">{heading}</div>
          {subheading && <div className="text-xs text-muted-foreground mt-0.5">{subheading}</div>}
        </div>
        <button onClick={onOpen} className="shrink-0 text-xs text-[color:var(--accent)] flex items-center gap-1">
          {openLabel} <ChevronLeft size={14} />
        </button>
      </div>
      {entries.length === 0 ? (
        <button onClick={onOpen} className="w-full text-right text-sm text-muted-foreground py-2">
          {emptyLabel}
        </button>
      ) : (
        <ul className="space-y-1.5">
          {visible.map((e) => (
            <li key={e.id} className="flex items-center gap-2 text-sm">
              <span className="text-base leading-none shrink-0">{iconFor(e.entry_type)}</span>
              <span className="flex-1 min-w-0 truncate">{e.title}</span>
              {e.time_of_day && (
                <span className="text-[11px] text-muted-foreground tabular-nums shrink-0" dir="ltr">
                  {e.time_of_day.slice(0, 5)}
                </span>
              )}
            </li>
          ))}
          {extra > 0 && (
            <li className="text-xs text-muted-foreground pr-6">+ {extra} נוספים</li>
          )}
        </ul>
      )}
    </section>
  );
}

function StatChip({ icon, value, label, to }: { icon: React.ReactNode; value: number; label: string; to: string }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-border"
      style={{ background: "color-mix(in oklab, var(--card) 60%, transparent)" }}
    >
      <span className="text-[color:var(--accent)]">{icon}</span>
      <span className="font-semibold tabular-nums">{value}</span>
      <span className="text-muted-foreground">{label}</span>
    </Link>
  );
}

function ActionTile({
  icon: Icon, label, to, onClick, accent, disabled,
}: {
  icon: typeof Calendar; label: string; to?: string; onClick?: () => void; accent?: boolean; disabled?: boolean;
}) {
  const cls = `rounded-xl border h-20 flex flex-col items-center justify-center gap-1.5 transition-colors ${
    accent
      ? "bg-[color:var(--accent-2)] text-white border-transparent"
      : disabled
      ? "bg-card border-border opacity-50"
      : "bg-card border-border"
  }`;
  const content = (
    <>
      <Icon size={22} strokeWidth={1.6} className={accent ? "" : "text-[color:var(--accent)]"} />
      <div className="text-[13px]">{label}</div>
    </>
  );
  if (disabled) return <div className={cls} aria-disabled>{content}</div>;
  if (to) return <Link to={to} className={cls}>{content}</Link>;
  return <button type="button" onClick={onClick} className={cls}>{content}</button>;
}

function ProgressRing({
  pct, size = 96, label, stroke = "var(--accent)", track = "var(--border)", textColor, fontSize,
}: {
  pct: number; size?: number; label?: string;
  stroke?: string; track?: string; textColor?: string; fontSize?: number;
}) {
  const strokeW = Math.max(6, Math.round(size / 12));
  const r = (size - strokeW) / 2;
  const c = 2 * Math.PI * r;
  const off = c - (Math.max(0, Math.min(100, pct)) / 100) * c;
  const fs = fontSize ?? Math.round(size / 6.5);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={strokeW} fill="none" />
      <motion.circle
        cx={size / 2} cy={size / 2} r={r} stroke={stroke} strokeWidth={strokeW} fill="none"
        strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`}
        strokeDasharray={c}
        initial={{ strokeDashoffset: c }}
        animate={{ strokeDashoffset: off }}
        transition={{ duration: 0.9, ease: "easeOut" }}
      />
      {label && (
        <text
          x={size / 2} y={size / 2 + fs / 3} textAnchor="middle"
          style={{ fontSize: fs, fontWeight: 600, fill: textColor ?? "currentColor" }}
          className={textColor ? "" : "fill-foreground"}
        >
          {label}
        </text>
      )}
    </svg>
  );
}

function HomeSkeleton() {
  return (
    <div className="pt-4 pb-8 flex flex-col gap-4 animate-pulse">
      <div className="h-40 bg-card border border-border rounded-2xl" />
      <div className="h-32 bg-card border border-border rounded-2xl" />
      <div className="h-24 bg-card border border-border rounded-2xl" />
      <div className="grid grid-cols-2 gap-3">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-20 bg-card border border-border rounded-xl" />)}
      </div>
    </div>
  );
}
