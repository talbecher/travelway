import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { Calendar, Wallet, Star, Plus, AlertTriangle, MapPin, ChevronLeft, ChevronDown, MessagesSquare, FileText, ExternalLink, ReceiptText } from "lucide-react";
import { useTrip, useExpenses, useDays, useRecs, useHotels, useTripIsActive } from "@/hooks/use-trip";
import { HayinuKanSheet } from "@/components/HayinuKanSheet";
import { useActiveTripId } from "@/hooks/use-active-trip";
import { useActiveVersion } from "@/hooks/use-versions";
import { supabase } from "@/integrations/supabase/client";
import { ils, todayISO, todayLocal, daysBetween, hebDate, hebWeekday } from "@/lib/format";
import { openQuickExpense } from "@/components/GlobalFab";
import { useCurrentWeather, useDayWeather } from "@/hooks/use-weather";
import { WeatherIcon } from "@/components/WeatherIcon";
import { WEATHER_LABELS_HE, weatherForecastUrl } from "@/lib/weather";
import { haversine } from "@/lib/geo";
import { buildDeadlines, URGENCY_COLOR, deadlineLabel, daysLeftLabel, type DeadlineItem } from "@/lib/deadlines";
import { NowNextCard } from "@/components/NowNextCard";
import { ChecklistCard } from "@/components/ChecklistCard";
import { useOnline } from "@/hooks/use-online";
import { toast } from "sonner";
import { PreTripHero } from "@/components/home/PreTripHero";
import {
  PlanErrorCard,
  PlanLoadingCard,
  PlanNextCard,
  PlanStartCard,
} from "@/components/home/PlanNextCard";
import { SavedPlacesRow } from "@/components/home/PrepStatsRow";
import { BudgetSummary } from "@/components/home/BudgetSummary";
import { formatMoney, useBaseCurrency } from "@/lib/currency";
import { ToolsRow, type ToolAction } from "@/components/home/ToolsRow";
import { getDestinationTheme } from "@/lib/destination-theme";
import { ActiveTripHero } from "@/components/home/ActiveTripHero";
import {
  ActiveTodayCard,
  ActiveTodayErrorCard,
  ActiveTodayLoadingCard,
  ActiveTodayMissingCard,
} from "@/components/home/ActiveTodayCard";



type DeadlineGroup = { key: string; title: string; subtitle: string; items: DeadlineItem[] };

function DeadlineRow({ item, onOpen }: { item: DeadlineItem; onOpen: (i: DeadlineItem) => void }) {
  const color = URGENCY_COLOR[item.urgency];
  const strong = item.urgency !== "normal";
  return (
    <button
      onClick={() => onOpen(item)}
      className="w-full text-right bg-card border border-border rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-2 h-auto min-h-0"
      style={{ borderRightWidth: 4, borderRightColor: color }}
    >
      <div className="min-w-0">
        <div className="text-sm font-semibold leading-snug break-words">{item.name}</div>
        <div className="text-xs text-muted-foreground mt-0.5 leading-snug break-words">
          {deadlineLabel(item)} ·{" "}
          <span
            className={strong ? "font-semibold" : undefined}
            style={strong ? { color } : undefined}
          >
            {daysLeftLabel(item.daysLeft)}
          </span>
        </div>
      </div>
      {item.booking_url && (
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            window.open(item.booking_url!, "_blank", "noopener");
          }}
          className="shrink-0 text-xs px-3 h-8 inline-flex items-center rounded-lg bg-[color:var(--accent)] text-white"
        >
          הזמן ↗
        </span>
      )}
    </button>
  );
}

function DeadlineSection({
  group,
  open,
  onToggle,
  onOpen,
}: {
  group: DeadlineGroup;
  open: boolean;
  onToggle: () => void;
  onOpen: (i: DeadlineItem) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const items = showAll ? group.items : group.items.slice(0, 4);
  return (
    <div className="rounded-xl border border-border bg-card/40 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 text-right h-auto min-h-0"
      >
      <div className="min-w-0">
          <div className="text-sm font-semibold break-words">
            {group.title} ({group.items.length})
          </div>
          <div className="text-[11px] text-muted-foreground break-words">{group.subtitle}</div>
        </div>
        <ChevronDown
          size={16}
          className="shrink-0 text-muted-foreground transition-transform"
          style={{ transform: open ? "rotate(180deg)" : undefined }}
        />
      </button>
      {open && (
        <div className="px-2 pb-2 space-y-2">
          {items.map((i) => (
            <DeadlineRow key={i.id} item={i} onOpen={onOpen} />
          ))}
          {!showAll && group.items.length > 4 && (
            <button
              onClick={() => setShowAll(true)}
              className="w-full text-xs text-muted-foreground py-1 h-auto min-h-0"
            >
              הצג הכל ({group.items.length})
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function DeadlinesCard({
  items,
  onOpen,
}: {
  items: DeadlineItem[];
  onOpen: (i: DeadlineItem) => void;
}) {
  const groups = useMemo<DeadlineGroup[]>(() => {
    const defs: DeadlineGroup[] = [
      { key: "hotel", title: "🏨 מלונות", subtitle: "עד מתי אפשר לבטל בחינם", items: [] },
      { key: "attraction", title: "⛩ אטרקציות", subtitle: "עד מתי צריך להזמין", items: [] },
      { key: "food", title: "🍜 מסעדות", subtitle: "עד מתי צריך להזמין שולחן", items: [] },
      { key: "other", title: "🎟 שאר ההזמנות", subtitle: "עד מתי צריך להזמין", items: [] },
    ];
    const by = Object.fromEntries(defs.map((g) => [g.key, g])) as Record<string, DeadlineGroup>;
    for (const i of items) {
      if (i.type === "hotel" || i.recType === "hotel") by.hotel.items.push(i);
      else if (i.recType === "food") by.food.items.push(i);
      else if (i.recType === "attraction") by.attraction.items.push(i);
      else by.other.items.push(i);
    }
    return defs.filter((g) => g.items.length > 0);
  }, [items]);

  const mostUrgentKey = useMemo(() => {
    let best: DeadlineGroup | null = null;
    for (const g of groups) {
      const min = Math.min(...g.items.map((i) => i.daysLeft));
      if (!best || min < Math.min(...best.items.map((i) => i.daysLeft))) best = g;
    }
    return best?.key ?? null;
  }, [groups]);

  const [openKey, setOpenKey] = useState<string | null>(null);
  const effectiveOpen = openKey ?? mostUrgentKey;

  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium">
        <AlertTriangle size={16} className="text-[color:var(--accent-2)]" />
        <span>דדליינים קרובים</span>
      </div>
      <div className="space-y-2">
        {groups.map((g) => (
          <DeadlineSection
            key={g.key}
            group={g}
            open={effectiveOpen === g.key}
            onToggle={() => setOpenKey(effectiveOpen === g.key ? "" : g.key)}
            onOpen={onOpen}
          />
        ))}
      </div>
    </section>
  );
}




export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "TravelWay — הבית של הטיול" },
      { name: "description", content: "היום, המסלול, המקומות והתקציב של הטיול הפעיל ב־TravelWay." },
      { property: "og:title", content: "TravelWay — הבית של הטיול" },
      { property: "og:description", content: "היום, המסלול, המקומות והתקציב של הטיול הפעיל ב־TravelWay." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
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

function parseMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

type EntrySlim = {
  id: string;
  day_id: string;
  entry_type: string;
  icon_emoji?: string | null;
  title: string;
  location_name?: string | null;
  time_of_day: string | null;
  photo_url?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  google_maps_url?: string | null;
  linked_recommendation_id?: string | null;
  recommendations?: { city?: string | null } | null;
};

function cleanLocationLabel(value: string | null | undefined): string | null {
  const label = value?.trim() || null;
  if (!label || label.length > 80 || /^https?:\/\//i.test(label)) return null;
  return label;
}

function firstLocationPart(value: string | null | undefined): string | null {
  const label = cleanLocationLabel(value);
  if (!label) return null;
  return label.split(/\s*(?:·|–|—|\/|\|)\s*/)[0]?.trim() || null;
}


/* ---------- live now card ---------- */

function LiveNowCard({
  todayDay,
  entries,
  onOpenDay,
}: {
  todayDay: { id: string; day_number: number; city_label?: string | null };
  entries: EntrySlim[];
  onOpenDay: () => void;
}) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const timedEntries = useMemo(() => {
    return entries
      .filter((e): e is EntrySlim & { time_of_day: string } => !!e.time_of_day)
      .map((e) => ({ ...e, minutes: parseMinutes(e.time_of_day) }))
      .sort((a, b) => a.minutes - b.minutes);
  }, [entries]);

  const currentEntry = useMemo(() => {
    return [...timedEntries].reverse().find((e) => e.minutes <= currentMinutes);
  }, [timedEntries, currentMinutes]);

  const nextEntry = useMemo(() => {
    return timedEntries.find((e) => e.minutes > currentMinutes);
  }, [timedEntries, currentMinutes]);

  const minutesUntilNext = nextEntry ? nextEntry.minutes - currentMinutes : null;

  const navTarget = currentEntry ?? nextEntry;
  const navUrl = navTarget
    ? navTarget.google_maps_url ||
      (navTarget.latitude != null && navTarget.longitude != null
        ? `https://www.google.com/maps/dir/?api=1&destination=${navTarget.latitude},${navTarget.longitude}`
        : null)
    : null;

  return (
    <section className="bg-card border border-border rounded-2xl overflow-hidden">
      <style>{`
        @keyframes live-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.85); }
        }
      `}</style>
      <div className="h-2 bg-accent flex items-center px-2 gap-2">
        <span
          className="w-2 h-2 rounded-full bg-white"
          style={{ animation: "live-pulse 2s ease-in-out infinite" }}
        />
        <span className="text-[10px] font-medium text-white">עכשיו</span>
      </div>
      <div className="p-4">
        {currentEntry ? (
          <div className="flex items-start gap-3">
            {currentEntry.photo_url ? (
              <img
                src={currentEntry.photo_url}
                alt=""
                loading="lazy"
                onError={(e) => { e.currentTarget.style.visibility = "hidden"; }}
                onLoad={(e) => { e.currentTarget.style.visibility = "visible"; }}
                className="w-[52px] h-[52px] rounded-xl object-cover shrink-0"
              />
            ) : (
              <div className="w-[52px] h-[52px] rounded-xl bg-accent/15 flex items-center justify-center text-2xl shrink-0">
                {currentEntry.icon_emoji ?? iconFor(currentEntry.entry_type)}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="text-[15px] font-medium line-clamp-1">{currentEntry.title}</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                {currentEntry.time_of_day.slice(0, 5)}
              </div>
              {currentEntry.location_name && (
                <div className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">
                  📍 {currentEntry.location_name}
                </div>
              )}
            </div>
          </div>
        ) : nextEntry ? (
          <div className="text-sm font-medium mb-2">הפעילות הראשונה של היום</div>
        ) : null}

        {nextEntry && (
          <div className="flex items-center gap-2 my-2.5 text-muted-foreground/60">
            <span className="h-px flex-1 bg-border" />
            <span className="text-[11px]">הבא בתור</span>
            <span className="h-px flex-1 bg-border" />
          </div>
        )}

        {nextEntry ? (
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-surface-2 flex items-center justify-center text-xl shrink-0">
              {nextEntry.icon_emoji ?? iconFor(nextEntry.entry_type)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-medium line-clamp-1">{nextEntry.title}</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                {minutesUntilNext != null &&
                  (minutesUntilNext < 60
                    ? `בעוד ${minutesUntilNext} דקות`
                    : `בעוד ${Math.floor(minutesUntilNext / 60)}ש׳ ${minutesUntilNext % 60}׳`)}
              </div>
              <div className="text-[10px] text-muted-foreground/60 mt-0.5">
                {nextEntry.time_of_day.slice(0, 5)}
              </div>
            </div>
          </div>
        ) : currentEntry ? (
          <div className="text-center text-[12px] text-muted-foreground mt-3">זה הכל להיום 🎉</div>
        ) : null}

        <div className="flex gap-2 mt-4">
          {navUrl ? (
            <a
              href={navUrl}
              target="_blank"
              rel="noreferrer"
              className="flex-1 h-9 rounded-xl bg-accent text-white text-[13px] font-medium flex items-center justify-center gap-1.5"
            >
              🗺 נווט לשם
            </a>
          ) : (
            <button
              disabled
              className="flex-1 h-9 rounded-xl bg-muted text-muted-foreground text-[13px] font-medium flex items-center justify-center gap-1.5"
            >
              🗺 נווט לשם
            </button>
          )}
          <button
            onClick={onOpenDay}
            className="flex-1 h-9 rounded-xl bg-surface-2 border border-border text-foreground text-[13px] font-medium flex items-center justify-center gap-1.5"
          >
            📅 פתח את היום
          </button>
        </div>
      </div>
    </section>
  );
}

function LiveNowSkeleton() {
  return (
    <section className="bg-card border border-border rounded-2xl overflow-hidden animate-pulse">
      <div className="h-2 bg-accent/50" />
      <div className="p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="w-[52px] h-[52px] rounded-xl bg-muted shrink-0" />
          <div className="flex-1 min-w-0 space-y-2 pt-1">
            <div className="h-4 bg-muted rounded w-3/4" />
            <div className="h-3 bg-muted rounded w-1/2" />
          </div>
        </div>
        <div className="flex items-center gap-2 my-2.5">
          <span className="h-px flex-1 bg-border" />
          <span className="h-3 bg-muted rounded w-16" />
          <span className="h-px flex-1 bg-border" />
        </div>
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-muted shrink-0" />
          <div className="flex-1 min-w-0 space-y-2 pt-1">
            <div className="h-3.5 bg-muted rounded w-2/3" />
            <div className="h-3 bg-muted rounded w-1/3" />
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <div className="flex-1 h-9 rounded-xl bg-muted" />
          <div className="flex-1 h-9 rounded-xl bg-muted" />
        </div>
      </div>
    </section>
  );
}

/* ---------- page ---------- */

function Home() {
  const navigate = useNavigate();
  const tripId = useActiveTripId();
  const { data: trip, isLoading } = useTrip();
  const { data: expenses = [] } = useExpenses();
  const { data: days = [], isLoading: daysLoading, isError: daysError, refetch: refetchDays } = useDays();
  const { data: recs = [] } = useRecs();
  const { data: hotels = [] } = useHotels();
  const tripIsActive = useTripIsActive();
  const isOnline = useOnline();
  const [hayinuOpen, setHayinuOpen] = useState(false);
  const [planSelection, setPlanSelection] = useState<{ tripId: string; dayId: string | null; manual: boolean }>({
    tripId,
    dayId: null,
    manual: false,
  });

  const { version: activeVersion } = useActiveVersion(tripId);
  const {
    data: entriesByDay = {},
    isLoading: entriesLoading,
    isError: entriesError,
    refetch: refetchEntries,
  } = useQuery<Record<string, EntrySlim[]>>({
    queryKey: ["day-entries-summary", tripId, activeVersion?.id ?? null],
    enabled: !!tripId && !!activeVersion?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("day_entries")
        .select("id, day_id, entry_type, icon_emoji, title, location_name, time_of_day, display_order, photo_url, latitude, longitude, google_maps_url, linked_recommendation_id, recommendations(city), itinerary_days!inner(trip_id, version_id)")
        .eq("itinerary_days.trip_id", tripId)
        .eq("itinerary_days.version_id", activeVersion!.id)
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
    const today = todayLocal();
    const beforeTrip = today < trip.start_date;
    const afterTrip = today > trip.end_date;
    // Derive progress from the trip's real dates — itinerary day rows may be
    // stale/mismatched, so counting them gives wrong "day X of Y" values.
    const daysTotal = trip.start_date && trip.end_date
      ? Math.max(1, daysBetween(trip.start_date, trip.end_date) + 1)
      : days.length;
    const daysPassed = beforeTrip
      ? 0
      : afterTrip
        ? daysTotal
        : Math.max(1, Math.min(daysTotal, daysBetween(trip.start_date, today) + 1));
    const daysLeft = Math.max(1, daysTotal - daysPassed + 1);
    const daily = remaining / daysLeft;
    const daysToStart = daysBetween(today, trip.start_date);
    const tripProgressPct = daysTotal > 0 ? Math.round((daysPassed / daysTotal) * 100) : 0;
    return { spent, budget, remaining, pct, daysTotal, daysPassed, daily, beforeTrip, afterTrip, daysToStart, tripProgressPct };
  }, [trip, expenses, days]);

  const todayDay = useMemo(() => {
    const t = todayLocal();
    return days.find((d) => d.date === t) ?? null;
  }, [days]);

  const nextDay = useMemo(() => {
    const t = todayLocal();
    for (const d of days) {
      if (d.date >= t && (entriesByDay[d.id]?.length ?? 0) > 0) return d;
    }
    return null;
  }, [days, entriesByDay]);

  const stats2 = useMemo(() => {
    const saved = recs.length;
    const planned = days.reduce((n, d) => n + ((entriesByDay[d.id]?.length ?? 0) > 0 ? 1 : 0), 0);
    const empty = Math.max(0, days.length - planned);
    return { saved, planned, empty };
  }, [recs, days, entriesByDay]);

  // First itinerary day with no activities, using the exact same filter as
  // stats2 so the count and the suggested day always agree.
  const firstEmptyDay = useMemo(
    () => days.find((d) => (entriesByDay[d.id]?.length ?? 0) === 0) ?? null,
    [days, entriesByDay],
  );

  useEffect(() => {
    if (planSelection.tripId !== tripId) {
      setPlanSelection({ tripId, dayId: null, manual: false });
      return;
    }
    if (planSelection.dayId && !days.some((day) => day.id === planSelection.dayId)) {
      setPlanSelection({ tripId, dayId: firstEmptyDay?.id ?? null, manual: false });
    }
  }, [days, firstEmptyDay?.id, planSelection, tripId]);

  const deadlines = useMemo(
    () => buildDeadlines(hotels as never, recs as never, todayISO()),
    [hotels, recs],
  );

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

  // Bottom nav already covers itinerary / recommendations / budget / phrasebook /
  // checklist, so only non-duplicated actions live here. Quick expense stays:
  // GlobalFab only listens for the event, it renders no visible button.
  const toolActions: ToolAction[] = [
    { key: "documents", icon: FileText, label: "מסמכים", to: "/documents" },
    {
      key: "quick-expense",
      icon: Plus,
      label: "הוצאה מהירה",
      onClick: () => {
        if (!isOnline) {
          toast.error("אין חיבור · לא ניתן להוסיף כרגע");
          return;
        }
        openQuickExpense();
      },
      disabled: !isOnline,
    },
  ];

  // ===== PRE-TRIP HOME =====
  if (stats?.beforeTrip) {
    const planDataPending = daysLoading || (!!activeVersion?.id && entriesLoading);
    const planDataFailed = daysError || entriesError;
    const urgent = deadlines.find((d) => d.urgency === "overdue" || d.urgency === "critical") ?? null;
    const openDeadline = (item: DeadlineItem) =>
      navigate({
        to: "/recommendations",
        search: item.type === "hotel" ? { tab: "hotels" } : { tab: "all" },
      });
    const selectedPlanDayId =
      planSelection.tripId === tripId && planSelection.dayId && days.some((day) => day.id === planSelection.dayId)
        ? planSelection.dayId
        : planSelection.tripId === tripId && planSelection.manual
          ? null
          : firstEmptyDay?.id ?? null;
    const selectedPlanEntries = selectedPlanDayId ? entriesByDay[selectedPlanDayId] ?? [] : [];
    const destinationTheme = getDestinationTheme(trip.destination_country ?? "");
    // Destination-flavoured candidates only (sights/attractions), never food or documents.
    // The hero tries them in order and keeps the first one that actually loads.
    const heroImageCandidates = Array.from(
      new Set(
        [
          ...recs.filter((rec) => rec.type === "attraction").map((rec) => rec.photo_url),
          ...Object.values(entriesByDay)
            .flat()
            .filter((entry) => entry.entry_type === "attraction")
            .map((entry) => entry.photo_url),
        ].filter((url): url is string => Boolean(url)),
      ),
    );
    const savedPlaces = recs.map((rec) => ({
      id: rec.id,
      name: rec.name,
      type: rec.type,
      photoUrl: rec.photo_url,
      mapsUrl: rec.google_maps_url,
    }));

    return (
      <div className="mx-auto flex w-full max-w-[620px] flex-col gap-4 pb-28 pt-3">
        <PreTripHero
          title={trip.title}
          flag={flagFor(trip.destination_country)}
          destination={trip.destination_country ?? null}
          startDate={trip.start_date}
          endDate={trip.end_date}
          daysTotal={stats.daysTotal}
          daysToStart={stats.daysToStart}
          imageUrls={heroImageCandidates}
          fallbackBackground={destinationTheme.heroGradient}
        />

        {urgent && (
          <button
            type="button"
            onClick={() => openDeadline(urgent)}
            className="flex min-h-11 w-full items-start gap-2 rounded-xl bg-card px-3 py-2.5 text-right shadow-sm"
            style={{ borderRightWidth: 4, borderRightColor: URGENCY_COLOR[urgent.urgency] }}
          >
            <AlertTriangle size={16} className="mt-0.5 shrink-0" style={{ color: URGENCY_COLOR[urgent.urgency] }} />
            <span className="min-w-0 flex-1 text-[13px] leading-snug break-words">
              {urgent.name} · {daysLeftLabel(urgent.daysLeft)}
            </span>
          </button>
        )}

        {planDataFailed ? (
          <PlanErrorCard
            onRetry={() => {
              void refetchDays();
              void refetchEntries();
            }}
          />
        ) : planDataPending ? (
          <PlanLoadingCard />
        ) : days.length === 0 ? (
          <PlanStartCard onOpenItinerary={() => navigate({ to: "/itinerary" })} />
        ) : (
          <PlanNextCard
            days={days}
            selectedDayId={selectedPlanDayId}
            entries={selectedPlanEntries}
            emptyCount={stats2.empty}
            showReviewPrompt={stats2.empty === 0 && !planSelection.manual}
            onSelectDay={(dayId) => setPlanSelection({ tripId, dayId, manual: true })}
            onOpenDay={() => {
              if (!selectedPlanDayId) return;
              void navigate({ to: "/itinerary/$dayId", params: { dayId: selectedPlanDayId } });
            }}
            onOpenItinerary={() => navigate({ to: "/itinerary" })}
          />
        )}

        <SavedPlacesRow places={savedPlaces} />

        {deadlines.length > 0 && (
          <>
            <h2 className="mt-1 text-[17px] font-semibold">לקראת היציאה</h2>
            <DeadlinesCard items={deadlines} onOpen={openDeadline} />
          </>
        )}
        <ChecklistCard variant="preTripHome" />

        <BudgetSummary budget={stats.budget} spent={stats.spent} remaining={stats.remaining} />
        <ToolsRow actions={toolActions} />

        <HayinuKanSheet open={hayinuOpen} onClose={() => setHayinuOpen(false)} />
      </div>
    );
  }

  // ===== ACTIVE-TRIP HOME =====
  if (tripIsActive && stats) {
    const todayEntries = todayDay ? entriesByDay[todayDay.id] ?? [] : [];
    const todayDataPending = daysLoading || (!!activeVersion?.id && entriesLoading);
    const todayDataFailed = daysError || entriesError;
    const urgent = deadlines.find((deadline) => deadline.urgency === "overdue" || deadline.urgency === "critical") ?? null;
    const remainingDeadlines = urgent ? deadlines.filter((deadline) => deadline.id !== urgent.id) : deadlines;
    const openDeadline = (item: DeadlineItem) =>
      navigate({
        to: "/recommendations",
        search: item.type === "hotel" ? { tab: "hotels" } : { tab: "all" },
      });
    const destinationTheme = getDestinationTheme(trip.destination_country ?? "");
    const heroImageCandidates = Array.from(
      new Set(
        todayEntries
          .filter((entry) => !["food", "note"].includes(entry.entry_type))
          .sort((a, b) => {
            const rank: Record<string, number> = { attraction: 0, hotel_checkin: 1, transport: 2, flight: 3 };
            return (rank[a.entry_type] ?? 4) - (rank[b.entry_type] ?? 4);
          })
          .map((entry) => entry.photo_url)
          .filter((url): url is string => Boolean(url)),
      ),
    );
    const entryCity = todayEntries
      .map((entry) => cleanLocationLabel(entry.recommendations?.city))
      .find((value): value is string => Boolean(value)) ?? null;
    const entryLocation = todayEntries
      .map((entry) => cleanLocationLabel(entry.location_name))
      .find((value): value is string => Boolean(value)) ?? null;
    const dayAreaLabel = cleanLocationLabel(todayDay?.city_label) ?? entryCity ?? entryLocation;
    const weatherCity = entryCity ?? firstLocationPart(todayDay?.city_label);
    const photoLocation = dayAreaLabel ?? weatherCity ?? cleanLocationLabel(trip.destination_country);
    const budgetDefined = Number.isFinite(stats.budget) && stats.budget > 0;
    const overBudget = budgetDefined && stats.remaining < 0;

    return (
      <div className="mx-auto flex w-full max-w-[620px] flex-col gap-3 pb-28 pt-3">
        <ActiveTripHero
          title={trip.title}
          dayNumber={todayDay?.day_number ?? null}
          daysTotal={stats.daysTotal}
          date={todayLocal()}
          city={dayAreaLabel}
          weatherLocation={weatherCity}
          photoLocation={photoLocation}
          imageUrls={heroImageCandidates}
          fallbackBackground={destinationTheme.heroGradient}
          destination={trip.destination_country ?? null}
        />

        {urgent && (
          <button
            type="button"
            onClick={() => openDeadline(urgent)}
            className="flex min-h-11 w-full items-start gap-2 rounded-xl bg-card px-3 py-2.5 text-right shadow-sm"
            style={{ borderRightWidth: 4, borderRightColor: URGENCY_COLOR[urgent.urgency] }}
          >
            <AlertTriangle size={16} className="mt-0.5 shrink-0" style={{ color: URGENCY_COLOR[urgent.urgency] }} />
            <span className="min-w-0 flex-1 break-words text-[13px] leading-snug">
              {urgent.name} · {daysLeftLabel(urgent.daysLeft)}
            </span>
            <ChevronLeft size={16} className="shrink-0 text-muted-foreground" />
          </button>
        )}

        {todayDataFailed ? (
          <ActiveTodayErrorCard
            onRetry={() => {
              void refetchDays();
              void refetchEntries();
            }}
          />
        ) : todayDataPending ? (
          <ActiveTodayLoadingCard />
        ) : !todayDay ? (
          <ActiveTodayMissingCard />
        ) : (
          <ActiveTodayCard dayId={todayDay.id} entries={todayEntries} />
        )}

        <section className="grid grid-cols-3 gap-2" aria-label="פעולות שימושיות">
          <button
            type="button"
            onClick={() => setHayinuOpen(true)}
            className="flex min-h-[68px] min-w-0 flex-col items-center justify-center gap-1 rounded-lg border border-border bg-card px-1.5 text-center shadow-sm"
          >
            <MapPin size={20} className="text-[color:var(--accent)]" />
            <span className="break-words text-[11px] font-medium">היינו כאן</span>
          </button>
          <button
            type="button"
            disabled={!isOnline}
            onClick={() => {
              if (!isOnline) {
                toast.error("אין חיבור · לא ניתן להוסיף כרגע");
                return;
              }
              openQuickExpense();
            }}
            className="flex min-h-[68px] min-w-0 flex-col items-center justify-center gap-1 rounded-lg border border-border bg-card px-1.5 text-center shadow-sm disabled:opacity-50"
          >
            <ReceiptText size={20} className="text-[color:var(--accent)]" />
            <span className="break-words text-[11px] font-medium">הוצאה מהירה</span>
          </button>
          <Link
            to="/documents"
            className="flex min-h-[68px] min-w-0 flex-col items-center justify-center gap-1 rounded-lg border border-border bg-card px-1.5 text-center shadow-sm"
          >
            <FileText size={20} className="text-[color:var(--accent)]" />
            <span className="break-words text-[11px] font-medium">מסמכים</span>
          </Link>
        </section>

        <NearbyCard recs={recs as NearbyRec[]} onSeeAll={() => navigate({ to: "/recommendations" })} variant="activeHome" />

        <section className="rounded-xl bg-card px-3.5 py-3 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] text-muted-foreground">{overBudget ? "חריגה מהתקציב" : budgetDefined ? "נשאר לטיול" : "תקציב"}</p>
              <p className={`mt-0.5 break-words text-[22px] font-semibold tabular-nums leading-tight ${overBudget ? "text-destructive" : "text-foreground"}`}>
                {!budgetDefined ? "לא הוגדר תקציב" : overBudget ? `-${formatMoney(Math.abs(stats.remaining), baseCurrency)}` : formatMoney(stats.remaining, baseCurrency)}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">הוצאות עד עכשיו: {formatMoney(stats.spent, baseCurrency)}</p>
            </div>
            <Link to="/budget" className="flex min-h-11 shrink-0 items-center gap-1 px-1 text-[12px] font-medium text-[color:var(--accent)]">
              לתקציב <ChevronLeft size={15} />
            </Link>
          </div>
          {budgetDefined && (
            <details className="mt-2 border-t border-border pt-1.5 text-[12px]">
              <summary className="min-h-11 cursor-pointer py-3 text-muted-foreground">יתרה ממוצעת ליום שנותר</summary>
              <p className={overBudget ? "pb-2 text-destructive" : "pb-2 text-foreground"}>
                {overBudget ? "אין יתרה זמינה לחלוקה יומית" : `${formatMoney(stats.daily, baseCurrency)} ליום`}
              </p>
            </details>
          )}
        </section>

        <ChecklistCard variant="activeHome" />

        {remainingDeadlines.length > 0 && (
          <details className="rounded-xl bg-card shadow-sm">
            <summary className="flex min-h-14 cursor-pointer items-center gap-3 px-3.5 py-2.5">
              <AlertTriangle size={18} className="shrink-0 text-[color:var(--accent-2)]" />
              <span className="min-w-0 flex-1 text-[14px] font-semibold">דדליינים נוספים</span>
              <span className="text-[12px] text-muted-foreground">{remainingDeadlines.length}</span>
            </summary>
            <div className="border-t border-border px-3 pb-3 pt-2">
              <DeadlinesCard items={remainingDeadlines} onOpen={openDeadline} />
            </div>
          </details>
        )}

        <HayinuKanSheet open={hayinuOpen} onClose={() => setHayinuOpen(false)} />
      </div>
    );
  }



  // 0. LIVE NOW
  if (tripIsActive && todayDay) {
    const entries = entriesByDay[todayDay.id] ?? [];
    const hasTimed = entries.some((e) => e.time_of_day);
    if (entriesLoading || hasTimed) {
      sections.push({
        key: "live-now",
        node: entriesLoading ? (
          <LiveNowSkeleton />
        ) : (
          <LiveNowCard
            todayDay={todayDay}
            entries={entries}
            onOpenDay={() => navigate({ to: "/itinerary/$dayId", params: { dayId: todayDay.id } })}
          />
        ),
      });
    }
  }

  // 1. HERO
  const heroWeatherCity = days.find((d) => d.city_label)?.city_label ?? null;
  const heroWeatherFallback = trip.destination_country ?? null;
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
        weatherFallback={heroWeatherFallback}
      />
    ),
  });

  // 1b. "היינו כאן" — only while the trip is running
  if (tripIsActive) {
    sections.push({
      key: "hayinu",
      node: (
        <button
          onClick={() => setHayinuOpen(true)}
          className="w-full flex items-center gap-4 bg-[color:var(--accent)]/10 border border-[color:var(--accent)]/30 rounded-2xl p-4 h-auto min-h-0"
        >
          <span className="text-3xl">📍</span>
          <div className="flex-1 text-right">
            <div className="text-[16px] font-semibold text-[color:var(--accent)]">היינו כאן</div>
            <div className="text-[12px] text-muted-foreground">תעדו מקום שביקרתם בו</div>
          </div>
          <span className="text-muted-foreground">›</span>
        </button>
      ),
    });
  }





  // 2 or 3. TODAY / NEXT
  if (todayDay && stats && !stats.beforeTrip && !stats.afterTrip) {
    const entries = entriesByDay[todayDay.id] ?? [];
    if (entries.length > 0) {
      sections.push({
        key: "nownext",
        node: (
          <NowNextCard
            entries={entries}
            dayNumber={todayDay.day_number}
            cityLabel={todayDay.city_label}
            onOpenDay={() => navigate({ to: "/itinerary/$dayId", params: { dayId: todayDay.id } })}
          />
        ),
      });
    }

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
        <UpcomingDayPreviewCard
          dayNumber={nextDay.day_number}
          date={nextDay.date}
          entries={entries}
          onOpen={() => navigate({ to: "/itinerary/$dayId", params: { dayId: nextDay.id } })}
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
                {formatMoney(stats.remaining, baseCurrency)}
              </motion.div>
              <div className="grid grid-cols-2 gap-3 mt-3 text-xs">
                <div>
                  <div className="text-muted-foreground">הוצאנו</div>
                  <div className="font-medium tabular-nums">{formatMoney(stats.spent, baseCurrency)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">ליום</div>
                  <div className="font-medium tabular-nums">{formatMoney(stats.daily, baseCurrency)}</div>
                </div>
              </div>
            </div>
          </div>
        </section>
      ),
    });
  }

  // 5. QUICK STATS
  sections.push({
    key: "stats",
    node: (
      <section className="grid grid-cols-3 gap-2">
        <CompactStatChip icon="📍" value={stats2.saved} label="מקומות" to="/recommendations" />
        <CompactStatChip icon="📅" value={stats2.planned} label="ימים מתוכננים" to="/itinerary" />
        <CompactStatChip icon="🈳" value={stats2.empty} label="ריקים" to="/itinerary" />
      </section>
    ),
  });


  // 5b. CHECKLIST
  sections.push({ key: "checklist", node: <ChecklistCard /> });

  // 6. QUICK ACTIONS
  sections.push({

    key: "actions",
    node: (
      <section className="grid grid-cols-2 gap-3">
        <ActionTile icon={Calendar} label="מסלול הטיול" to="/itinerary" />
        <ActionTile icon={Star} label="המלצות" to="/recommendations" />
        <ActionTile icon={Wallet} label="תקציב" to="/budget" />
        <ActionTile icon={MessagesSquare} label="שיחון" to="/phrasebook" />
        <ActionTile
          icon={Plus}
          label="הוצאה מהירה"
          onClick={() => {
            if (!isOnline) {
              toast.error("אין חיבור · לא ניתן להוסיף כרגע");
              return;
            }
            openQuickExpense();
          }}
          disabled={!isOnline}
        />
        <ActionTile icon={FileText} label="מסמכים" to="/documents" />
      </section>
    ),
  });

  // 6b. NEARBY (from saved recs)
  sections.push({
    key: "nearby",
    node: <NearbyCard recs={recs as NearbyRec[]} onSeeAll={() => navigate({ to: "/recommendations" })} />,
  });

  // 7. DEADLINES

  if (deadlines.length > 0) {
    sections.push({
      key: "alerts",
      node: <DeadlinesCard items={deadlines} onOpen={(item) =>
        navigate({
          to: "/recommendations",
          search: item.type === "hotel" ? { tab: "hotels" } : { tab: "all" },
        })
      } />,
    });
  }


  return (
    <div className="pt-4 pb-24 px-4 flex flex-col gap-3">
      {sections.map((s, i) => (
        <motion.div
          key={s.key}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: i * 0.05, ease: "easeOut" }}
        >
          {s.node}
        </motion.div>
      ))}
      <HayinuKanSheet open={hayinuOpen} onClose={() => setHayinuOpen(false)} />
    </div>
  );
}

/* ---------- pieces ---------- */

function HeroCard(props: {
  title: string; flag: string; startDate: string; endDate: string;
  status: "future" | "active" | "past";
  daysToStart: number; daysPassed: number; daysTotal: number; tripProgressPct: number;
  weatherCity: string | null;
  weatherFallback: string | null;
}) {
  const { title, flag, startDate, endDate, status, daysToStart, daysPassed, daysTotal, tripProgressPct, weatherCity, weatherFallback } = props;
  const today = todayISO();
  const forecast = useDayWeather(weatherCity ?? weatherFallback, today);
  const current = useCurrentWeather(weatherCity, weatherFallback);
  const wCondition = forecast?.condition ?? current?.condition ?? null;
  const wTemp = forecast ? forecast.tempMax : current?.temp ?? null;
  const wLabel = wCondition ? WEATHER_LABELS_HE[wCondition] : "";
  const forecastUrl = current ? weatherForecastUrl(current.lat, current.lng) : null;

  const ringPct = status === "future" ? 0 : status === "past" ? 100 : tripProgressPct;
  const ringStroke = status === "future" ? "rgba(255,255,255,0.15)" : "var(--accent)";
  const ringTrack = "rgba(255,255,255,0.15)";

  return (
    <section
      className="relative overflow-hidden rounded-2xl px-4 py-3.5 text-white flex flex-col justify-between"
      style={{
        height: 160,
        background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
      }}
    >
      {/* top row */}
      <div className="flex items-start justify-end gap-2">
        <div className="flex items-center gap-2">
          {wCondition && wTemp != null && (
            <a
              href={forecastUrl ?? "#"}
              target="_blank"
              rel="noreferrer"
              title={wLabel ? `${wLabel} · לתחזית מלאה` : "לתחזית מלאה"}
              aria-label={wLabel ? `${wTemp}° ${wLabel}` : `${wTemp}°`}
              className="flex items-center gap-1 px-2 py-1 rounded-full text-white text-[10px]"
              style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)" }}
            >
              <WeatherIcon condition={wCondition} size="sm" />
              <span className="font-medium tabular-nums leading-none" dir="ltr">{wTemp}°</span>
            </a>
          )}
          <span className="text-[22px] leading-none">{flag}</span>
        </div>
      </div>

      {/* middle */}
      <div className="text-right mt-1">
        <div className="text-[20px] font-medium leading-tight tracking-[-0.3px] truncate">{title}</div>
        <div className="text-[11px] text-white/65 mt-1 truncate" dir="rtl">
          {hebDate(startDate)} – {hebDate(endDate)} · {daysTotal} ימים
        </div>
      </div>

      {/* bottom row */}
      <div className="flex items-end justify-between mt-1">
        <ProgressRing pct={ringPct} size={44} label={`${ringPct}%`} stroke={ringStroke} track={ringTrack} textColor="var(--primary-foreground)" fontSize={9} />
        <HeroStatusPill status={status} daysToStart={daysToStart} daysPassed={daysPassed} daysTotal={daysTotal} />
      </div>
    </section>
  );
}

function HeroStatusPill({ status, daysToStart, daysPassed, daysTotal }: {
  status: "future" | "active" | "past";
  daysToStart: number;
  daysPassed: number;
  daysTotal: number;
}) {
  if (status === "future") {
    return (
      <span
        className="inline-flex items-center gap-1.5 text-[10px] font-medium text-white px-2.5 py-1 rounded-full"
        style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)" }}
      >
        <span className="relative flex h-1.5 w-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-warning opacity-75" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-warning" />
        </span>
        עוד {daysToStart} ימים
      </span>
    );
  }
  if (status === "active") {
    return (
      <span
        className="inline-flex items-center gap-1.5 text-[10px] font-medium text-white px-2.5 py-1 rounded-full"
        style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)" }}
      >
        <span className="relative flex h-1.5 w-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-success" />
        </span>
        יום {Math.min(daysPassed, daysTotal)} מתוך {daysTotal}
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[10px] font-medium text-white/60 px-2.5 py-1 rounded-full"
      style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)" }}
    >
      הסתיים
    </span>
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

function UpcomingDayPreviewCard({ dayNumber, date, entries, onOpen }: {
  dayNumber: number;
  date: string;
  entries: EntrySlim[];
  onOpen: () => void;
}) {
  const visible = entries.slice(0, 3);
  const extra = Math.max(0, entries.length - 3);
  return (
    <section className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="flex">
        <div className="w-2 shrink-0 bg-accent" />
        <div className="flex-1 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12px] font-medium text-[color:var(--accent)]">
              יום {dayNumber} · {hebDate(date)}
            </span>
            <span className="text-[10px] text-muted-foreground">{hebWeekday(date)}</span>
          </div>
          <ul className="mt-2 space-y-1.5">
            {visible.map((e) => (
              <li key={e.id} className="flex items-center gap-2">
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: entryTypeColor(e.entry_type) }}
                />
                <span className="flex-1 min-w-0 text-[11px] text-foreground truncate">{e.title}</span>
                {e.time_of_day && (
                  <span className="text-[10px] text-muted-foreground tabular-nums shrink-0" dir="ltr">
                    {e.time_of_day.slice(0, 5)}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {extra > 0 && (
            <div className="text-[10px] text-muted-foreground mt-1.5">+ {extra} נוספים</div>
          )}
        </div>
      </div>
      <button
        onClick={onOpen}
        className="w-full text-center text-[11px] font-medium text-[color:var(--accent)] py-2 border-t border-border"
      >
        פתח את היום ›
      </button>
    </section>
  );
}

function entryTypeColor(t: string) {
  const map: Record<string, string> = {
    flight: "var(--color-flight)",
    hotel_checkin: "var(--color-hotel)",
    attraction: "var(--color-attraction)",
    food: "var(--color-food)",
    transport: "var(--color-transport)",
    note: "var(--color-note)",
  };
  return map[t] ?? "var(--accent)";
}

function CompactStatChip({ icon, value, label, to }: { icon: string; value: number; label: string; to: string }) {
  return (
    <Link
      to={to}
      className="flex flex-col items-center justify-center gap-0.5 bg-card border border-border rounded-[10px] py-1.5 px-1 text-center"
    >
      <div className="flex items-center gap-1">
        <span className="text-[13px] leading-none">{icon}</span>
        <span className="text-[14px] font-semibold tabular-nums leading-none text-foreground">{value}</span>
      </div>
      <span className="text-[8px] text-muted-foreground leading-none">{label}</span>
    </Link>
  );
}

function ActionTile({
  icon: Icon, label, to, onClick, disabled,
}: {
  icon: typeof Calendar; label: string; to?: string; onClick?: () => void; disabled?: boolean;
}) {
  const cls = "rounded-xl border border-border h-[72px] flex flex-col items-center justify-center gap-1 bg-card transition-colors" + (disabled ? " opacity-50" : "");
  const content = (
    <>
      <Icon size={22} strokeWidth={1.6} className="text-[color:var(--accent)]" />
      <div className="text-[10px] font-medium text-foreground">{label}</div>
    </>
  );
  if (to) return <Link to={to} className={cls} style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>{content}</Link>;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cls}
      style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}
    >
      {content}
    </button>
  );
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

/* ---------- Nearby card ---------- */

type NearbyRec = {
  id: string;
  name: string;
  type: string;
  latitude: number | string | null;
  longitude: number | string | null;
  google_maps_url: string | null;
  photo_url: string | null;
};

function fmtDistKm(km: number) {
  if (km < 1) return `${Math.round(km * 1000)} מ׳`;
  return `${km.toFixed(1)} ק״מ`;
}

function typeEmoji(t: string) {
  if (t === "food") return "🍜";
  if (t === "hotel") return "🏨";
  return "⛩";
}

function NearbyImage({ rec }: { rec: NearbyRec }) {
  const [failed, setFailed] = useState(false);
  if (!rec.photo_url || failed) {
    return (
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-lg" aria-hidden="true">
        {typeEmoji(rec.type)}
      </div>
    );
  }
  return <img src={rec.photo_url} alt="" loading="lazy" onError={() => setFailed(true)} className="h-10 w-10 shrink-0 rounded-lg object-cover" />;
}

function NearbyCard({ recs, onSeeAll, variant = "default" }: { recs: NearbyRec[]; onSeeAll: () => void; variant?: "default" | "activeHome" }) {
  const [filter, setFilter] = useState<"all" | "food" | "attraction">("all");
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);
  const [geoError, setGeoError] = useState(false);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoError(true);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setGeoError(true),
      { timeout: 8000 },
    );
  }, []);

  const nearby = useMemo(() => {
    if (!userPos || !recs) return [];
    return recs
      .filter((r) => {
        if (r.latitude == null || r.longitude == null) return false;
        if (filter === "all") return true;
        return r.type === filter;
      })
      .map((r) => ({
        rec: r,
        distance: haversine(
          { lat: userPos.lat, lon: userPos.lng },
          { lat: Number(r.latitude), lon: Number(r.longitude) },
        ),
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 3);
  }, [recs, userPos, filter]);

  const filters: Array<{ key: "food" | "attraction" | "all"; label: string }> = [
    { key: "food", label: "🍜 אוכל" },
    { key: "attraction", label: "⛩ אטרקציות" },
    { key: "all", label: "הכל" },
  ];

  if (variant === "activeHome" && geoError) {
    return (
      <section className="rounded-xl bg-card px-3.5 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <MapPin size={18} className="shrink-0 text-[color:var(--accent)]" />
          <div className="min-w-0 flex-1">
            <h2 className="text-[14px] font-semibold">מהמקומות ששמרתם, לידכם</h2>
            <p className="text-[11px] text-muted-foreground">אין כרגע גישה למיקום.</p>
          </div>
          <button type="button" onClick={onSeeAll} className="min-h-11 shrink-0 px-1 text-[12px] font-medium text-[color:var(--accent)]">לשמורים</button>
        </div>
      </section>
    );
  }

  return (
    <section className={variant === "activeHome" ? "rounded-xl bg-card p-3.5 shadow-sm" : "bg-card border border-border rounded-2xl p-4 shadow-sm"}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold flex items-center gap-1.5">
            <MapPin size={14} /> {variant === "activeHome" ? "מהמקומות ששמרתם, לידכם" : "מה קרוב אליי?"}
          </div>
          {variant !== "activeHome" && <div className="text-[11px] text-muted-foreground mt-0.5">מהמקומות השמורים שלך</div>}
        </div>
      </div>

      <div className="flex gap-2 mt-3">
        {filters.map((f) => {
          const active = filter === f.key;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={
                "h-8 px-3 rounded-full text-[12px] " +
                (active
                  ? "bg-[color:var(--accent)] text-white border border-transparent"
                  : "bg-[color:var(--surface-2)] border border-border text-muted-foreground")
              }
            >
              {f.label}
            </button>
          );
        })}
      </div>

      <div className="mt-3 space-y-2">
        {geoError ? (
          <div className="text-center py-4 text-[12px] text-muted-foreground flex flex-col items-center gap-1.5">
            <MapPin size={16} />
            <div>אפשר גישה למיקום כדי לראות מה קרוב אליך</div>
          </div>
        ) : !userPos ? (
          [0, 1, 2].map((i) => (
            <div key={i} className="h-12 rounded-lg bg-muted/40 animate-pulse" />
          ))
        ) : nearby.length === 0 ? (
          <div className="text-center py-4 text-[12px] text-muted-foreground">
            לא נמצאו מקומות שמורים בקטגוריה זו
          </div>
        ) : (
          nearby.map(({ rec, distance }) => {
            const mapsHref =
              rec.google_maps_url ||
              `https://www.google.com/maps/search/?api=1&query=${rec.latitude},${rec.longitude}`;
            return (
              <div
                key={rec.id}
                className="flex items-center gap-2.5 rounded-lg border border-border bg-background p-2"
              >
                <NearbyImage rec={rec} />
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-semibold truncate">{rec.name}</div>
                  <div className="text-[11px] text-muted-foreground tabular-nums" dir="ltr">
                    מרחק בקו אווירי · {fmtDistKm(distance)}
                  </div>
                </div>
                <a
                  href={mapsHref}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="פתח במפה"
                  className="w-9 h-9 rounded-full flex items-center justify-center text-lg bg-[color:var(--surface-2)] border border-border shrink-0"
                >
                  🗺
                </a>
              </div>
            );
          })
        )}
      </div>

      <button
        type="button"
        onClick={onSeeAll}
        className="mt-3 w-full text-center text-[12px] text-[color:var(--accent)] font-medium"
      >
        {variant === "activeHome" ? "למקומות השמורים" : "ראה הכל ›"}
      </button>
    </section>
  );
}

