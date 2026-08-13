import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pencil, Trash2, Check, X, ChevronLeft, Sparkles, Download } from "lucide-react";
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
          "id, day_id, entry_type, icon_emoji, title, location_name, time_of_day, display_order, photo_url, itinerary_days!inner(trip_id, version_id)"
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

  if (isLoading || !activeVersion) return <ListSkeleton />;

  if (days.length === 0) {
    return (
      <div className="pt-6">
        <EmptyState variant="trip" title="עדיין אין ימים" hint="הימים ייווצרו אוטומטית לפי תאריכי הטיול" />
      </div>
    );
  }

  return (
    <div className="pt-2 space-y-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1>מסלול</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {trip?.destination_country} · {days.length} ימים
          </p>
        </div>
        <div className="shrink-0 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setExportOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-full bg-[color:var(--accent)] text-white text-[12px] px-3 h-8 shadow-sm"
          >
            <Sparkles size={14} />
            ייצא ל-AI
          </button>
          <button
            type="button"
            onClick={() => setImportOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-full bg-surface border border-border text-[12px] px-3 h-8"
          >
            <Download size={14} />
            ייבא
          </button>
        </div>
      </header>

      <VersionSelector tripId={tripId} />



      {/* City navigation strip */}
      {grouped.length > 1 && (
        <div className="-mx-4 px-4 overflow-x-auto no-scrollbar sticky top-0 z-10 py-3 bg-surface border-b border-border">
          <div className="flex gap-2 w-max" dir="rtl">
            {grouped.map((g, i) => {
              const key = `${g.city || "—"}-${i}`;
              const active = activeCity === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => scrollToCity(key)}
                  className={`rounded-full h-8 px-3 flex items-center justify-center text-[12px] whitespace-nowrap transition-colors ${
                    active
                      ? "bg-accent text-white shadow-sm"
                      : "bg-surface-2 text-muted-foreground border border-border"
                  }`}
                >
                  <span dir="ltr" className="inline-block align-middle">
                    {g.city || "ללא עיר"}
                  </span>
                  <span className="ms-1 opacity-70">· {g.days.length} י'</span>
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
            className="scroll-mt-16"
          >
            {/* Group divider header */}
            <div className="flex items-center gap-3 mb-3">
              <div className="flex-1 h-px bg-border" />
              <div className="text-[12px] text-muted-foreground" dir="ltr">
                {g.city || "ללא עיר"}
              </div>
              <div className="flex-1 h-px bg-border" />
            </div>

            <div className="space-y-3">
              {g.days.map((d) => {
                const entries = entriesByDay[d.id] ?? [];
                const isEditing = editingId === d.id;
                const isEmpty = entries.length === 0;
                const preview = entries.slice(0, 3);
                const more = entries.length - preview.length;

                return (
                  <div
                    key={d.id}
                    className={`bg-white dark:bg-card rounded-2xl overflow-hidden transition-shadow ${
                      isEmpty
                        ? "border border-dashed border-border-strong"
                        : "border border-border"
                    }`}
                    style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }}
                  >
                    <div className="h-1 bg-[color:var(--accent)]" />
                    <div className="p-4">
                    {/* Header row */}
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (isEditing) return;
                          navigate({ to: "/itinerary/$dayId", params: { dayId: d.id } });
                        }}
                        className="flex-1 min-w-0 text-right flex items-center gap-2 min-h-0 h-auto py-0"
                      >
                        <span className="text-[15px] font-bold text-[color:var(--accent)] shrink-0">
                          יום {d.day_number}
                        </span>
                        <span className="text-[13px] text-muted-foreground shrink-0">·</span>
                        <span className="text-[13px] font-medium text-muted-foreground shrink-0">
                          {hebWeekday(d.date)}
                        </span>
                        <span className="text-[13px] text-muted-foreground shrink-0">·</span>
                        <span className="text-[13px] text-muted-foreground shrink-0 tabular-nums">
                          {hebDate(d.date)}
                        </span>
                        {d.city_label && !isEditing && (
                          <span
                            className="ms-auto rounded-full bg-[color:var(--surface-2)] text-[11px] px-2 py-0.5 truncate max-w-[45%]"
                            dir="ltr"
                          >
                            {d.city_label}
                          </span>
                        )}
                        {!isEditing && (
                          <DayWeatherBadge city={d.city_label ?? null} date={d.date} />
                        )}
                      </button>
                      {!isEditing && (
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            aria-label="ערוך שם עיר"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditValue(d.city_label ?? "");
                              setEditingId(d.id);
                            }}
                            className="w-7 h-7 rounded-full border border-border flex items-center justify-center text-muted-foreground min-h-0"
                          >
                            <Pencil size={12} />
                          </button>
                          <button
                            type="button"
                            aria-label="מחק יום"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm(`למחוק את יום ${d.day_number}?`)) delDay.mutate(d.id);
                            }}
                            className="w-7 h-7 rounded-full border border-border flex items-center justify-center text-[color:var(--accent-2)] min-h-0"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      )}
                    </div>

                    {isEditing && (
                      <div
                        className="flex items-center gap-1 mt-2"
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
                          className="flex-1 text-xs bg-background border border-input rounded-md px-2 py-1 outline-none focus:border-[color:var(--accent)]"
                          placeholder="עיר / איזור"
                        />
                        <button
                          type="button"
                          onClick={() => saveCity.mutate({ id: d.id, city: editValue })}
                          className="w-7 h-7 rounded-md flex items-center justify-center text-[color:var(--accent-3)] min-h-0"
                        >
                          <Check size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground min-h-0"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    )}

                    {/* Body */}
                    {isEmpty ? (
                      <button
                        type="button"
                        onClick={() =>
                          navigate({ to: "/itinerary/$dayId", params: { dayId: d.id } })
                        }
                        className="w-full mt-3 text-center text-[13px] text-muted-foreground min-h-0 h-auto py-2"
                      >
                        יום ריק — לחץ להוספה
                      </button>
                    ) : (
                      <>
                        <div className="h-px bg-border my-3" />
                        <button
                          type="button"
                          onClick={() =>
                            navigate({ to: "/itinerary/$dayId", params: { dayId: d.id } })
                          }
                          className="w-full text-right min-h-0 h-auto p-0 block"
                        >
                          <div className="space-y-1.5">
                            {preview.map((entry) => (
                              <EntryPreviewRow key={entry.id} entry={entry} />
                            ))}
                          </div>
                          {more > 0 && (
                            <div className="mt-2 flex items-center justify-between text-[12px] text-muted-foreground">
                              <span>+ {more} נוספים</span>
                              <ChevronLeft size={14} />
                            </div>
                          )}
                        </button>
                      </>
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
        queryKey={["ai-export", tripId]}
        generate={() => generateAIPrompt(tripId)}
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


function EntryPreviewRow({ entry }: { entry: EntryRow }) {
  const emoji = entry.icon_emoji || iconFor(entry.entry_type);
  return (
    <div className="flex items-center gap-2 h-10">
      {entry.photo_url ? (
        <img
          src={entry.photo_url}
          alt=""
          loading="lazy"
          className="w-10 h-10 rounded-lg object-cover shrink-0"
        />
      ) : (
        <div className="w-10 h-10 rounded-lg bg-[color:var(--surface-2)] flex items-center justify-center text-[16px] shrink-0">
          {emoji}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="text-[14px] truncate leading-tight">{entry.title}</div>
        {entry.location_name && (
          <div className="text-[11px] text-muted-foreground truncate leading-tight" dir="ltr">
            {entry.location_name}
          </div>
        )}
      </div>
      {entry.time_of_day && (
        <span className="rounded-full bg-[color:var(--surface-2)] text-[10px] tabular-nums px-1.5 py-0.5 shrink-0" dir="ltr">
          {entry.time_of_day}
        </span>
      )}
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
