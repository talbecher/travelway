import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Pencil, Trash2, Check, X, ChevronDown, GripVertical } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useDays, useTrip } from "@/hooks/use-trip";
import { hebDate, todayISO } from "@/lib/format";
import { haversine, fmtDistance } from "@/lib/geo";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTripId } from "@/hooks/use-active-trip";
import { EmptyState } from "@/components/EmptyState";
import { toast } from "sonner";

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
  latitude: number | null;
  longitude: number | null;
  time_of_day: string | null;
  display_order: number;
};

const TYPE_COLOR: Record<string, string> = {
  food: "var(--chart-1)",
  attraction: "var(--chart-2)",
  transport: "var(--chart-3)",
  shopping: "var(--chart-4)",
  hotel_checkin: "var(--chart-5)",
  accommodation: "var(--chart-5)",
  flight: "var(--accent)",
  note: "var(--chart-6)",
};

const CITY_PALETTE = [
  "var(--accent)",
  "var(--accent-3)",
  "var(--accent-2)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
];
function cityColor(city: string) {
  if (!city) return "var(--border)";
  let h = 0;
  for (let i = 0; i < city.length; i++) h = (h * 31 + city.charCodeAt(i)) >>> 0;
  return CITY_PALETTE[h % CITY_PALETTE.length];
}

function iconFor(t: string) {
  const m: Record<string, string> = { flight: "✈️", hotel_checkin: "🏨", attraction: "⛩", food: "🍜", transport: "🚆", note: "📝" };
  return m[t] ?? "•";
}

function summarize(entries: EntryRow[]): string {
  const hotel = entries.find((e) => e.entry_type === "hotel_checkin");
  const food = entries.filter((e) => e.entry_type === "food");
  const attraction = entries.filter((e) => e.entry_type === "attraction");
  const transport = entries.filter((e) => e.entry_type === "transport");
  const parts: string[] = [];
  if (hotel) parts.push(`🏨 ${hotel.title}`);
  if (attraction.length) parts.push(`⛩ ${attraction.length} אטרקציות`);
  if (food.length) parts.push(`🍜 ${food.length} ארוחות`);
  if (transport.length) parts.push(`🚆 תחבורה`);
  return parts.join(" · ") || "לחץ להוספה";
}

function Itinerary() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const tripId = useActiveTripId();
  const { data: trip } = useTrip();
  const { data: days = [], isLoading } = useDays();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [didInitExpand, setDidInitExpand] = useState(false);

  const saveCity = useMutation({
    mutationFn: async ({ id, city }: { id: string; city: string }) => {
      const { error } = await supabase.from("itinerary_days").update({ city_label: city }).eq("id", id);
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
        .from("day_entries").select("id", { count: "exact", head: true }).eq("day_id", id);
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
    queryKey: ["day-entries-summary", tripId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("day_entries")
        .select("id, day_id, entry_type, icon_emoji, title, location_name, latitude, longitude, time_of_day, display_order, itinerary_days!inner(trip_id)")
        .eq("itinerary_days.trip_id", tripId)
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

  // Auto-expand today's day once, after data loads
  if (!didInitExpand && days.length > 0) {
    const t = todayISO();
    const today = days.find((d) => d.date === t);
    if (today) setExpanded((s) => ({ ...s, [today.id]: true }));
    setDidInitExpand(true);
  }

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

  // Previous day's last hotel_checkin — used for the morning slot
  const prevNightHotelByDay = useMemo(() => {
    const map: Record<string, string | null> = {};
    for (let i = 0; i < days.length; i++) {
      const d = days[i];
      if (i === 0) { map[d.id] = null; continue; }
      const prev = days[i - 1];
      const prevEntries = entriesByDay[prev.id] ?? [];
      const hotels = prevEntries.filter((e) => e.entry_type === "hotel_checkin");
      map[d.id] = hotels.length ? hotels[hotels.length - 1].title : null;
    }
    return map;
  }, [days, entriesByDay]);

  if (isLoading) return <ListSkeleton />;

  if (days.length === 0) {
    return (
      <div className="pt-6">
        <EmptyState variant="trip" title="עדיין אין ימים" hint="הימים ייווצרו אוטומטית לפי תאריכי הטיול" />
      </div>
    );
  }

  return (
    <div className="pt-2 space-y-6">
      <header>
        <h1>מסלול</h1>
        <p className="text-sm text-muted-foreground mt-1">{trip?.destination_country} · {days.length} ימים</p>
      </header>

      {grouped.map((g) => {
        const color = cityColor(g.city);
        return (
          <section key={g.city + g.days[0].day_number}>
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-block w-2 h-2 rounded-full" style={{ background: color }} />
              <div className="text-xs uppercase tracking-wider text-muted-foreground" dir="ltr">
                {g.city}
              </div>
            </div>
            <div className="space-y-2">
              {g.days.map((d) => {
                const entries = entriesByDay[d.id] ?? [];
                const isEditing = editingId === d.id;
                const isEmpty = entries.length === 0;
                const isExpanded = !!expanded[d.id];
                const morningHotel = (() => {
                  const own = entries.find((e) => e.entry_type === "hotel_checkin");
                  if (own) return own.title;
                  return prevNightHotelByDay[d.id] ?? null;
                })();
                const nightHotels = entries.filter((e) => e.entry_type === "hotel_checkin");
                const nightHotel = nightHotels.length ? nightHotels[nightHotels.length - 1].title : null;

                return (
                  <div
                    key={d.id}
                    className="bg-card border border-border rounded-2xl border-r-4 overflow-hidden"
                    style={{ borderRightColor: color }}
                  >
                    {/* Header row */}
                    <div className="flex items-center gap-2 px-3 py-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (isEditing) return;
                          if (isEmpty) {
                            navigate({ to: "/itinerary/$dayId", params: { dayId: d.id } });
                            return;
                          }
                          setExpanded((s) => ({ ...s, [d.id]: !s[d.id] }));
                        }}
                        className="flex-1 min-w-0 text-right flex items-center gap-3 min-h-0 h-auto py-1"
                      >
                        <div className="w-9 text-center shrink-0">
                          <div className="text-[20px] font-semibold tabular-nums leading-none">{d.day_number}</div>
                          <div className="text-[10px] text-muted-foreground mt-1">יום</div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <div className="text-[15px] font-medium">{hebDate(d.date)}</div>
                            {d.city_label && !isEditing && (
                              <div className="text-[11px] text-muted-foreground truncate" dir="ltr">{d.city_label}</div>
                            )}
                          </div>
                          {isEditing ? (
                            <div className="flex items-center gap-1 mt-1" onClick={(e) => e.stopPropagation()}>
                              <input
                                autoFocus
                                value={editValue}
                                dir="ltr"
                                onChange={(e) => setEditValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") saveCity.mutate({ id: d.id, city: editValue });
                                  if (e.key === "Escape") setEditingId(null);
                                }}
                                className="flex-1 text-xs bg-background border border-input rounded px-2 py-1 outline-none focus:border-[color:var(--accent)]"
                                placeholder="עיר / איזור"
                              />
                              <button type="button" onClick={(e) => { e.stopPropagation(); saveCity.mutate({ id: d.id, city: editValue }); }}
                                className="w-6 h-6 rounded flex items-center justify-center text-[color:var(--accent-3)] min-h-0">
                                <Check size={14} />
                              </button>
                              <button type="button" onClick={(e) => { e.stopPropagation(); setEditingId(null); }}
                                className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground min-h-0">
                                <X size={14} />
                              </button>
                            </div>
                          ) : isEmpty ? (
                            <div className="text-xs text-muted-foreground mt-0.5">לא תוכנן עדיין — לחץ להוספה</div>
                          ) : (
                            <div className="text-[12px] text-muted-foreground truncate mt-0.5">{summarize(entries)}</div>
                          )}
                        </div>
                        {!isEditing && !isEmpty && (
                          <ChevronDown
                            size={16}
                            className="text-muted-foreground shrink-0 transition-transform"
                            style={{ transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)" }}
                          />
                        )}
                      </button>
                      {!isEditing && (
                        <div className="flex flex-col gap-1 shrink-0">
                          <button
                            type="button"
                            aria-label="ערוך שם עיר"
                            onClick={(e) => { e.stopPropagation(); setEditValue(d.city_label ?? ""); setEditingId(d.id); }}
                            className="w-7 h-7 rounded-full border border-border flex items-center justify-center text-muted-foreground min-h-0"
                          >
                            <Pencil size={12} />
                          </button>
                          <button
                            type="button"
                            aria-label="מחק יום"
                            onClick={(e) => { e.stopPropagation(); if (confirm(`למחוק את יום ${d.day_number}?`)) delDay.mutate(d.id); }}
                            className="w-7 h-7 rounded-full border border-border flex items-center justify-center text-[color:var(--accent-2)] min-h-0"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Expandable timeline */}
                    <AnimatePresence initial={false}>
                      {isExpanded && !isEmpty && (
                        <motion.div
                          key="timeline"
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2, ease: "easeOut" }}
                          style={{ overflow: "hidden" }}
                        >
                          <div className="px-3 pb-3 pt-1 border-t border-border">
                            <DayTimeline
                              dayId={d.id}
                              entries={entries}
                              morningHotel={morningHotel}
                              nightHotel={nightHotel}
                              onOpenDetail={() => navigate({ to: "/itinerary/$dayId", params: { dayId: d.id } })}
                            />
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/* ---------------- Timeline ---------------- */

function DayTimeline({
  dayId,
  entries,
  morningHotel,
  nightHotel,
  onOpenDetail,
}: {
  dayId: string;
  entries: EntryRow[];
  morningHotel: string | null;
  nightHotel: string | null;
  onOpenDetail: () => void;
}) {
  const qc = useQueryClient();
  const middle = useMemo(
    () => entries.filter((e) => e.entry_type !== "hotel_checkin"),
    [entries],
  );

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const reorder = useMutation({
    mutationFn: async (rows: { id: string; display_order: number }[]) => {
      await Promise.all(
        rows.map((r) =>
          supabase.from("day_entries").update({ display_order: r.display_order }).eq("id", r.id),
        ),
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["day-entries-summary"] });
      qc.invalidateQueries({ queryKey: ["day-entries", dayId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = middle.findIndex((x) => x.id === active.id);
    const newIdx = middle.findIndex((x) => x.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const next = arrayMove(middle, oldIdx, newIdx);
    reorder.mutate(next.map((r, i) => ({ id: r.id, display_order: i })));
  }

  return (
    <div dir="rtl" className="relative">
      {/* Morning hotel */}
      {morningHotel && (
        <TimelineHotelSlot label="יציאה בבוקר" name={morningHotel} position="top" />
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={middle.map((e) => e.id)} strategy={verticalListSortingStrategy}>
          <div>
            {middle.map((entry, i) => {
              const prev = middle[i - 1];
              const hasSeg =
                prev &&
                prev.latitude != null && prev.longitude != null &&
                entry.latitude != null && entry.longitude != null;
              return (
                <div key={entry.id}>
                  {hasSeg && (
                    <SegmentConnector
                      a={{ lat: Number(prev!.latitude), lng: Number(prev!.longitude) }}
                      b={{ lat: Number(entry.latitude), lng: Number(entry.longitude) }}
                    />
                  )}
                  {!hasSeg && i > 0 && <div className="w-0.5 h-4 bg-border mr-[26px]" />}
                  <SortableNode entry={entry} />
                </div>
              );
            })}
          </div>
        </SortableContext>
      </DndContext>

      {/* Night hotel */}
      {nightHotel && (
        <>
          {middle.length > 0 && <div className="w-0.5 h-4 bg-border mr-[26px]" />}
          <TimelineHotelSlot label="לילה" name={nightHotel} position="bottom" />
        </>
      )}

      {/* Edit full */}
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={onOpenDetail}
          className="text-[12px] text-muted-foreground border border-border rounded-full px-3 py-1 hover:bg-muted transition-colors"
        >
          <Pencil size={12} className="inline -mt-0.5 ml-1" />
          עריכה מלאה
        </button>
      </div>
    </div>
  );
}

function TimelineHotelSlot({
  label,
  name,
}: {
  label: string;
  name: string;
  position: "top" | "bottom";
}) {
  const color = TYPE_COLOR.hotel_checkin;
  return (
    <div className="flex items-center gap-2 py-1.5">
      <span
        className="w-[14px] h-[14px] rounded-full shrink-0 ring-2 ring-card"
        style={{ background: color, marginRight: "20px" }}
      />
      <div className="flex-1 min-w-0">
        <div className="text-[13px]">
          <span className="text-lg align-middle">🏨</span>{" "}
          <span className="text-muted-foreground">{label} —</span>{" "}
          <span className="font-medium">{name}</span>
        </div>
      </div>
    </div>
  );
}

function SortableNode({ entry }: { entry: EntryRow }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: entry.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };
  const color = TYPE_COLOR[entry.entry_type] ?? "var(--chart-6)";
  const emoji = entry.icon_emoji || iconFor(entry.entry_type);
  return (
    <div ref={setNodeRef} style={style} className="flex items-start gap-2 py-1.5">
      <button
        type="button"
        aria-label="גרור לסידור"
        className="mt-1 w-5 h-5 flex items-center justify-center text-muted-foreground shrink-0 touch-none cursor-grab active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical size={14} />
      </button>
      <span
        className="w-[14px] h-[14px] rounded-full shrink-0 mt-1.5 ring-2 ring-card"
        style={{ background: color }}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          {entry.time_of_day && (
            <span className="text-[11px] tabular-nums text-muted-foreground">{entry.time_of_day}</span>
          )}
          <span className="text-base leading-none">{emoji}</span>
          <span className="text-[14px] font-medium truncate">{entry.title}</span>
        </div>
        {entry.location_name && (
          <div className="text-[11px] text-muted-foreground truncate mt-0.5" dir="ltr">{entry.location_name}</div>
        )}
      </div>
    </div>
  );
}

function SegmentConnector({ a, b }: { a: { lat: number; lng: number }; b: { lat: number; lng: number } }) {
  const km = haversine({ lat: a.lat, lon: a.lng }, { lat: b.lat, lon: b.lng });
  const suggested: "walking" | "transit" | "driving" =
    km < 1.5 ? "walking" : km <= 10 ? "transit" : "driving";
  const base = `https://www.google.com/maps/dir/?api=1&origin=${a.lat},${a.lng}&destination=${b.lat},${b.lng}`;
  const modes: { key: "walking" | "transit" | "driving"; emoji: string }[] = [
    { key: "walking", emoji: "🚶" },
    { key: "transit", emoji: "🚌" },
    { key: "driving", emoji: "🚗" },
  ];
  return (
    <div className="mr-[26px] my-1 flex items-center gap-2" dir="rtl">
      <div className="w-0.5 h-4 bg-border" />
      <span className="text-[11px] text-muted-foreground">→ {fmtDistance(km)}</span>
      <div className="flex gap-1">
        {modes.map((m) => {
          const isOn = m.key === suggested;
          return (
            <a
              key={m.key}
              href={`${base}&travelmode=${m.key}`}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              className="w-6 h-6 rounded-full text-[11px] inline-flex items-center justify-center leading-none"
              style={
                isOn
                  ? { background: "var(--accent)", color: "#fff", border: "1px solid transparent" }
                  : { background: "transparent", color: "var(--foreground)", border: "1px solid var(--border)" }
              }
            >
              {m.emoji}
            </a>
          );
        })}
      </div>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="pt-2 space-y-3 animate-pulse">
      {[0,1,2,3,4,5,6].map(i => <div key={i} className="h-14 bg-card border border-border rounded-2xl" />)}
    </div>
  );
}
