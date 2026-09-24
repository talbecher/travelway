import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pencil, Trash2, Check, X, MoreHorizontal, Sparkles, Download } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useDays, useTrip } from "@/hooks/use-trip";
import { hebDate, hebWeekday } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTripId } from "@/hooks/use-active-trip";
import { useActiveVersion } from "@/hooks/use-versions";
import { VersionSelector } from "@/components/VersionSelector";
import { EmptyState } from "@/components/EmptyState";
import { toast } from "sonner";
import { useDayWeather } from "@/hooks/use-weather";
import { WeatherIcon } from "@/components/WeatherIcon";
import { BottomSheet } from "@/components/BottomSheet";
import { generateAIPrompt } from "@/lib/export-to-ai";
import { useBaseCurrency } from "@/lib/currency";
import { ExportAISheet } from "@/components/ExportAISheet";
import { ImportAISheet } from "@/components/ImportAISheet";


function DayWeatherBadge({ city, date }: { city: string | null; date: string }) {
  const w = useDayWeather(city, date);
  if (!w) return null;
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground tabular-nums shrink-0" dir="ltr">
      <WeatherIcon condition={w.condition} size="sm" />
      {w.tempMax}°/{w.tempMin}°
      {w.precipitation > 5 && <span>💧</span>}
    </span>
  );
}

export const Route = createFileRoute("/itinerary/")({
  component: Itinerary,
});

type EntryRow = {
  id: string;
  day_id: string;
  entry_type: string;
  icon_emoji: string | null;
  title: string;
  location_name: string | null;
  time_of_day: string | null;
  display_order: number;
  photo_url: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
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

function buildSummary(entries: EntryRow[]): string {
  const byType = {
    attraction: entries.filter((e) => e.entry_type === "attraction"),
    food: entries.filter((e) => e.entry_type === "food"),
    hotel: entries.filter((e) => e.entry_type === "hotel_checkin"),
    transport: entries.filter((e) => e.entry_type === "transport"),
    flight: entries.filter((e) => e.entry_type === "flight"),
  };

  const parts: string[] = [];

  // Flight first
  if (byType.flight.length) {
    parts.push(`✈️ ${byType.flight[0].title.slice(0, 20)}`);
  }

  // Hotel
  if (byType.hotel.length) {
    parts.push(`🏨 ${byType.hotel[0].title.slice(0, 18)}`);
  }

  // Attractions: show first 2 by name
  if (byType.attraction.length === 1) {
    parts.push(`⛩ ${byType.attraction[0].title.slice(0, 20)}`);
  } else if (byType.attraction.length === 2) {
    parts.push(`⛩ ${byType.attraction[0].title.slice(0, 15)} · ${byType.attraction[1].title.slice(0, 15)}`);
  } else if (byType.attraction.length > 2) {
    parts.push(`⛩ ${byType.attraction[0].title.slice(0, 15)} · ${byType.attraction[1].title.slice(0, 12)} +${byType.attraction.length - 2}`);
  }

  // Food: show first by name + count
  if (byType.food.length === 1) {
    parts.push(`🍜 ${byType.food[0].title.slice(0, 20)}`);
  } else if (byType.food.length > 1) {
    parts.push(`🍜 ${byType.food[0].title.slice(0, 15)} +${byType.food.length - 1}`);
  }

  // Transport
  if (byType.transport.length) {
    parts.push("🚆 תחבורה");
  }

  // Max 3 parts total
  return parts.slice(0, 3).join("  ");
}

function localDateKey() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

function Itinerary() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const tripId = useActiveTripId();
  const { version: activeVersion } = useActiveVersion(tripId);
  const { data: trip } = useTrip();
  const { data: days = [], isLoading } = useDays();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [dayMenuId, setDayMenuId] = useState<string | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressStart = useRef<{ x: number; y: number } | null>(null);
  const suppressDayClick = useRef(false);

  const saveCity = useMutation({
    mutationFn: async ({ id, city }: { id: string; city: string }) => {
      const { error } = await supabase
        .from("itinerary_days")
        .update({ city_label: city })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["days"] });
      qc.invalidateQueries({ queryKey: ["day-entries-summary"] });
      setEditingId(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delDay = useMutation({
    mutationFn: async (id: string) => {
      const { count } = await supabase
        .from("day_entries")
        .select("id", { count: "exact", head: true })
        .eq("day_id", id);
      if ((count ?? 0) > 0) throw new Error("יש פריטים ביום זה — מחקו אותם קודם");
      const { error } = await supabase.from("itinerary_days").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["days"] });
      toast.success("היום נמחק");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const { data: entriesByDay = {} } = useQuery<Record<string, EntryRow[]>>({
    queryKey: ["day-entries-summary", tripId, activeVersion?.id ?? null],
    enabled: !!tripId && !!activeVersion?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("day_entries")
        .select(
          "id, day_id, entry_type, icon_emoji, title, location_name, time_of_day, display_order, photo_url, latitude, longitude, google_maps_url, itinerary_days!inner(trip_id, version_id)"
        )

        .eq("itinerary_days.trip_id", tripId)
        .eq("itinerary_days.version_id", activeVersion!.id)
        .order("display_order")
        .order("created_at");
      if (error) throw error;
      const map: Record<string, EntryRow[]> = {};
      for (const e of (data ?? []) as unknown as EntryRow[]) {
        (map[e.day_id] ||= []).push(e);
      }
      return map;
    },
  });


  const grouped = useMemo(() => {
    const groups: { city: string; days: typeof days }[] = [];
    for (const d of days) {
      const label = d.city_label ?? "";
      const last = groups[groups.length - 1];
      if (last && last.city === label) last.days.push(d);
      else groups.push({ city: label, days: [d] });
    }
    return groups;
  }, [days]);

  // City strip active tracking via IntersectionObserver
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const [activeCity, setActiveCity] = useState<string>("");

  useEffect(() => {
    if (grouped.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]) {
          const key = (visible[0].target as HTMLElement).dataset.cityKey;
          if (key) setActiveCity(key);
        }
      },
      { rootMargin: "-20% 0px -60% 0px", threshold: [0, 0.25, 0.5] }
    );
    for (const key in sectionRefs.current) {
      const el = sectionRefs.current[key];
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [grouped]);

  function scrollToCity(key: string) {
    const el = sectionRefs.current[key];
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function clearLongPress() {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTimer.current = null;
    pressStart.current = null;
  }

  function startLongPress(dayId: string, x: number, y: number) {
    clearLongPress();
    pressStart.current = { x, y };
    longPressTimer.current = setTimeout(() => {
      suppressDayClick.current = true;
      setDayMenuId(dayId);
      longPressTimer.current = null;
    }, 500);
  }

  if (isLoading || !activeVersion) return <ListSkeleton />;

  if (days.length === 0) {
    return (
      <div className="pt-6">
        <EmptyState variant="trip" title="עדיין אין ימים" hint="הימים ייווצרו אוטומטית לפי תאריכי הטיול" />
      </div>
    );
  }

  return (
    <div className="space-y-3 overflow-x-hidden pt-2 pb-24">
      <header className="relative grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0">
          <h1 className="text-[20px] font-medium">מסלול</h1>
          <p className="mt-1 truncate text-[12px] text-muted-foreground">
            {trip?.destination_country} · {days.length} ימים
          </p>
        </div>
        <div className="relative shrink-0">
          <button
            type="button"
            aria-label="פעולות מסלול"
            aria-expanded={headerMenuOpen}
            onClick={() => setHeaderMenuOpen((open) => !open)}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-surface text-foreground"
          >
            <MoreHorizontal size={20} />
          </button>
          {headerMenuOpen && (
            <div className="absolute left-0 top-12 z-30 w-44 overflow-hidden rounded-xl border border-border bg-popover p-1 shadow-md">
              <button
                type="button"
                onClick={() => {
                  setHeaderMenuOpen(false);
                  setExportOpen(true);
                }}
                className="flex h-11 w-full items-center gap-2 rounded-lg px-3 text-right text-[13px] text-foreground"
              >
                <Sparkles size={16} />
                ייצא ל-AI
              </button>
              <button
                type="button"
                onClick={() => {
                  setHeaderMenuOpen(false);
                  setImportOpen(true);
                }}
                className="flex h-11 w-full items-center gap-2 rounded-lg px-3 text-right text-[13px] text-foreground"
              >
                <Download size={16} />
                ייבא
              </button>
            </div>
          )}
        </div>
      </header>

      <VersionSelector tripId={tripId} />



      {/* City navigation strip */}
      {grouped.length > 1 && (
        <div className="sticky top-0 z-10 -mx-4 overflow-x-auto border-b border-border bg-surface px-4 no-scrollbar">
          <div className="flex w-max gap-1.5" dir="rtl">
            {grouped.map((g, i) => {
              const key = `${g.city || "—"}-${i}`;
              const active = activeCity === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => scrollToCity(key)}
                  className={`flex h-11 items-center justify-center rounded-full px-1 text-[11px] whitespace-nowrap transition-colors ${
                    active
                      ? "text-accent-foreground"
                      : "text-muted-foreground"
                  }`}
                >
                  <span className={`flex h-8 items-center rounded-full px-3 ${active ? "bg-accent" : "border border-border bg-surface"}`}>
                    <span dir="ltr" className="inline-block align-middle">
                      {g.city || "ללא עיר"}
                    </span>
                    <span className="ms-1 opacity-70">· {g.days.length} י'</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {grouped.map((g, gi) => {
        const key = `${g.city || "—"}-${gi}`;
        return (
          <section
            key={key}
            data-city-key={key}
            ref={(el) => { sectionRefs.current[key] = el; }}
            className="scroll-mt-14"
          >
            {/* Group divider header */}
            <div className="mt-3 mb-1 flex items-center gap-2">
              <div className="h-px flex-1 bg-border opacity-60" />
              <div className="text-[11px] font-medium tracking-[0.05em] text-muted-foreground uppercase" dir="ltr">
                {g.city || "ללא עיר"}
              </div>
              <div className="h-px flex-1 bg-border opacity-60" />
            </div>

            <div className="space-y-2">
              {g.days.map((d) => {
                const entries = entriesByDay[d.id] ?? [];
                const isEditing = editingId === d.id;
                const isEmpty = entries.length === 0;
                const summary = buildSummary(entries);
                const isToday = d.date === localDateKey();
                const menuOpen = dayMenuId === d.id;

                return (
                  <div
                    key={d.id}
                    className={`relative overflow-visible rounded-xl transition-colors ${
                      isEmpty
                        ? "border border-dashed border-border-strong bg-transparent opacity-65"
                        : "border border-border bg-card"
                    } ${isToday ? "border-s-[3px] border-s-accent" : ""}`}
                  >
                    {isToday && (
                      <span className="absolute top-2 left-2 z-10 rounded-full bg-accent px-1.5 py-0.5 text-[10px] text-accent-foreground">
                        היום
                      </span>
                    )}
                    <div className={isEmpty ? "px-3.5 py-2.5" : `min-h-[72px] px-3.5 py-3 ${isToday ? "ps-5" : ""}`}>
                      <button
                        type="button"
                        aria-label={`פתח יום ${d.day_number}`}
                        onPointerDown={(event) => startLongPress(d.id, event.clientX, event.clientY)}
                        onPointerMove={(event) => {
                          const start = pressStart.current;
                          if (start && (Math.abs(event.clientX - start.x) > 8 || Math.abs(event.clientY - start.y) > 8)) {
                            clearLongPress();
                          }
                        }}
                        onPointerUp={clearLongPress}
                        onPointerCancel={clearLongPress}
                        onPointerLeave={clearLongPress}
                        onContextMenu={(event) => {
                          event.preventDefault();
                          setDayMenuId(d.id);
                        }}
                        onClick={() => {
                          if (isEditing) return;
                          if (suppressDayClick.current) {
                            suppressDayClick.current = false;
                            return;
                          }
                          navigate({ to: "/itinerary/$dayId", params: { dayId: d.id } });
                        }}
                        className="block min-h-11 w-full min-w-0 text-right"
                      >
                        <span className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
                          <span className={`shrink-0 text-[13px] font-medium ${isEmpty ? "text-muted-foreground" : "text-accent"}`}>
                            יום {d.day_number}
                          </span>
                          <span className="truncate text-center text-[11px] text-muted-foreground">
                            {hebWeekday(d.date)}
                          </span>
                          <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                            {hebDate(d.date)}
                          </span>
                        </span>
                        {isEmpty ? (
                          <span className="mt-1 block truncate text-center text-[11px] text-muted-foreground">
                            לחץ לתכנון +
                          </span>
                        ) : (
                          <>
                            {summary && (
                              <span className="mt-1 block line-clamp-2 text-[11px] text-foreground">
                                {summary}
                              </span>
                            )}
                            <span className="mt-0.5 flex min-h-4 items-center">
                              <DayWeatherBadge city={d.city_label ?? null} date={d.date} />
                            </span>
                          </>
                        )}
                      </button>

                      {menuOpen && !isEditing && (
                        <div className="absolute left-2 top-11 z-20 w-48 overflow-hidden rounded-xl border border-border bg-popover p-1 shadow-md">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDayMenuId(null);
                              setEditValue(d.city_label ?? "");
                              setEditingId(d.id);
                            }}
                            className="flex h-11 w-full items-center gap-2 rounded-lg px-3 text-right text-[13px] text-foreground"
                          >
                            <Pencil size={16} />
                            ערוך עיר
                          </button>
                          <button
                            type="button"
                            disabled={!isEmpty}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!isEmpty) return;
                              setDayMenuId(null);
                              if (confirm(`למחוק את יום ${d.day_number}?`)) delDay.mutate(d.id);
                            }}
                            className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-right text-[13px] text-destructive disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <Trash2 size={16} />
                            <span className="min-w-0">
                              <span className="block">מחק</span>
                              {!isEmpty && <span className="block text-[10px] text-muted-foreground">הסר קודם את הפעילויות</span>}
                            </span>
                          </button>
                        </div>
                      )}

                    {isEditing && (
                      <div
                        className="mt-2 grid grid-cols-[minmax(0,1fr)_44px_44px] items-center gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          autoFocus
                          value={editValue}
                          dir="ltr"
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveCity.mutate({ id: d.id, city: editValue });
                            if (e.key === "Escape") setEditingId(null);
                          }}
                          className="min-w-0 rounded-md border border-input bg-background px-2 text-xs outline-none focus:border-accent"
                          placeholder="עיר / איזור"
                        />
                        <button
                          type="button"
                          onClick={() => saveCity.mutate({ id: d.id, city: editValue })}
                          className="flex h-11 w-11 items-center justify-center rounded-md text-success"
                        >
                          <Check size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    )}

                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      <ExportAISheet
        open={exportOpen}
        onOpenChange={setExportOpen}
        queryKey={["ai-export", tripId, baseCurrency]}
        generate={() => generateAIPrompt(tripId, baseCurrency)}
      />

      <ImportAISheet
        open={importOpen}
        onOpenChange={setImportOpen}
        tripId={tripId}
        days={days.map((d) => ({
          id: d.id,
          day_number: d.day_number,
          date: d.date,
          city_label: d.city_label,
        }))}
      />
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="pt-2 space-y-3 animate-pulse">
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <div key={i} className="h-24 bg-card border border-border rounded-2xl" />
      ))}
    </div>
  );
}
