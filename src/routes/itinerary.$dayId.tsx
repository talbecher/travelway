import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ChevronRight, ExternalLink, Pencil, Trash2, Plus, Check, X, GripVertical, Map as MapIcon, Link2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDays, dayEntriesQuery } from "@/hooks/use-trip";
import { useActiveTripId } from "@/hooks/use-active-trip";
import { hebDateLong } from "@/lib/format";
import { ENTRY_TYPES } from "@/lib/constants";
import { BottomSheet } from "@/components/BottomSheet";
import DayMap from "@/components/DayMap";
import { saveRecommendation } from "@/lib/recommendations";
import { parseLatLngFromMapsUrl, googleDirectionsUrl, mapsSearchUrl, walkTimeMin, TYPE_PIN_COLOR } from "@/lib/coords";
import { resolveMapsUrl } from "@/lib/maps-resolver.functions";
import { useServerFn } from "@tanstack/react-start";
import { haversine, fmtDistance } from "@/lib/geo";
import { PlacesSearch, type SelectedPlace } from "@/components/PlacesSearch";
import { toast } from "sonner";
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";


export const Route = createFileRoute("/itinerary/$dayId")({
  component: DayDetail,
});

type EntryType = "flight" | "hotel_checkin" | "attraction" | "food" | "transport" | "note";

type EntryRow = {
  id: string;
  entry_type: string;
  title: string;
  description: string | null;
  time_of_day: string | null;
  icon_emoji: string | null;
  google_maps_url: string | null;
  location_name: string | null;
  linked_recommendation_id: string | null;
  display_order: number;
  latitude: number | string | null;
  longitude: number | string | null;
  photo_url?: string | null;
};

const TYPE_COLOR: Record<string, string> = {
  food: "var(--accent-2)",
  attraction: "var(--accent)",
  transport: "var(--chart-3)",
  hotel_checkin: "var(--accent-3)",
  flight: "var(--chart-4)",
  note: "var(--chart-6)",
};

const TYPE_ICON: Record<string, string> = {
  flight: "✈️", hotel_checkin: "🏨", attraction: "⛩", food: "🍜", transport: "🚆", note: "📝",
};

function sortEntries(list: EntryRow[]): EntryRow[] {
  return [...list].sort((a, b) => {
    if (a.display_order !== b.display_order) return a.display_order - b.display_order;
    const ta = a.time_of_day ?? "";
    const tb = b.time_of_day ?? "";
    if (ta && tb) return ta.localeCompare(tb);
    if (ta && !tb) return -1;
    if (!ta && tb) return 1;
    return 0;
  });
}

function coordsOf(e: EntryRow): { lat: number; lng: number } | null {
  if (e.latitude != null && e.longitude != null) {
    const lat = Number(e.latitude), lng = Number(e.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }
  return null;
}

function DayDetail() {
  const { dayId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: days = [] } = useDays();
  const day = days.find((d) => d.id === dayId);
  const { data: rawEntries = [], isLoading } = useQuery(dayEntriesQuery(dayId));
  const entries = sortEntries(rawEntries as EntryRow[]);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [entryType, setEntryType] = useState<EntryType | null>(null);
  const [editEntry, setEditEntry] = useState<EntryRow | null>(null);
  const [editLocationEntry, setEditLocationEntry] = useState<EntryRow | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const tripId = useActiveTripId();

  const updateEntryLocation = useMutation({
    mutationFn: async ({ entry, place }: { entry: EntryRow; place: SelectedPlace }) => {
      const patch = {
        latitude: place.latitude,
        longitude: place.longitude,
        google_maps_url: place.google_maps_url,
      };
      const { error } = await supabase.from("day_entries").update(patch).eq("id", entry.id);
      if (error) throw error;
      if (entry.linked_recommendation_id) {
        const { error: recErr } = await supabase
          .from("recommendations")
          .update(patch)
          .eq("id", entry.linked_recommendation_id);
        if (recErr) throw recErr;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["day-entries", dayId] });
      qc.invalidateQueries({ queryKey: ["recs", tripId] });
      qc.invalidateQueries({ queryKey: ["recs"] });
      toast.success("✅ מיקום עודכן");
      setEditLocationEntry(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [editingCity, setEditingCity] = useState(false);
  const [cityValue, setCityValue] = useState(day?.city_label ?? "");

  const [mapPct, setMapPct] = useState(50);
  const draggingRef = useRef(false);

  const listRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const saveCity = useMutation({
    mutationFn: async () => {
      if (!day) return;
      const { error } = await supabase.from("itinerary_days").update({ city_label: cityValue }).eq("id", day.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["days"] });
      setEditingCity(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("day_entries").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["day-entries", dayId] });
      qc.invalidateQueries({ queryKey: ["day-entries-summary"] });
      toast.success("נמחק");
    },
  });

  const reorder = useMutation({
    mutationFn: async (rows: { id: string; display_order: number }[]) => {
      await Promise.all(
        rows.map((r) =>
          supabase.from("day_entries").update({ display_order: r.display_order }).eq("id", r.id)
        )
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["day-entries", dayId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = entries.findIndex((x) => x.id === active.id);
    const newIndex = entries.findIndex((x) => x.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(entries, oldIndex, newIndex);
    reorder.mutate(next.map((r, i) => ({ id: r.id, display_order: i })));
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
  );

  const mapStops = useMemo(() => {
    const stops: { id: string; lat: number; lng: number; type: string; index: number; title: string; time: string | null }[] = [];
    let idx = 0;
    for (const e of entries) {
      const c = coordsOf(e);
      if (c) {
        idx += 1;
        stops.push({ id: e.id, lat: c.lat, lng: c.lng, type: e.entry_type, index: idx, title: e.title, time: e.time_of_day });
      }
    }
    console.log("[mapStops]", stops.length, stops);
    return stops;
  }, [entries]);

  const stopIndexById = useMemo(() => {
    const m: Record<string, number> = {};
    for (const s of mapStops) m[s.id] = s.index;
    return m;
  }, [mapStops]);

  const scrollToCard = useCallback((id: string) => {
    setHighlightId(id);
    const el = cardRefs.current[id];
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => setHighlightId((cur) => (cur === id ? null : cur)), 1600);
  }, []);

  function openPicker() {
    setEntryType(null);
    setPickerOpen(true);
  }

  // Drag divider between map and list
  useEffect(() => {
    function move(e: PointerEvent) {
      if (!draggingRef.current) return;
      const container = document.getElementById("day-split");
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const pct = ((e.clientY - rect.top) / rect.height) * 100;
      setMapPct(Math.max(20, Math.min(80, pct)));
    }
    function up() { draggingRef.current = false; document.body.style.cursor = ""; }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, []);

  if (!day) return <div className="pt-6 text-center text-muted-foreground">יום לא נמצא</div>;

  const hasAnyEntries = entries.length > 0;
  const directions = googleDirectionsUrl(mapStops.map((s) => ({ lat: Number(s.lat), lng: Number(s.lng) })));
  const directionsEnabled = directions !== "";

  return (
    <div className="-mx-4">
      {/* Header (scrollable region above split) */}
      <div className="px-4 pt-2 pb-3 space-y-2">
        <button onClick={() => navigate({ to: "/itinerary" })} className="flex items-center gap-1 text-sm text-muted-foreground min-h-0 h-auto py-1">
          <ChevronRight size={16} /> חזרה למסלול
        </button>
        <div className="text-xs text-muted-foreground">יום {day.day_number}</div>
        <h1>{hebDateLong(day.date)}</h1>
        {editingCity ? (
          <div className="flex items-center gap-2 mt-1">
            <input
              autoFocus value={cityValue} onChange={(e) => setCityValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveCity.mutate();
                if (e.key === "Escape") { setEditingCity(false); setCityValue(day.city_label ?? ""); }
              }}
              dir="ltr" placeholder="עיר / איזור"
              className="flex-1 text-sm bg-background border border-input rounded-md px-2 py-1 outline-none focus:border-[color:var(--accent)]"
            />
            <button onClick={() => saveCity.mutate()} className="w-8 h-8 rounded-full bg-[color:var(--accent)] text-white flex items-center justify-center min-h-0"><Check size={14} /></button>
            <button onClick={() => { setEditingCity(false); setCityValue(day.city_label ?? ""); }} className="w-8 h-8 rounded-full border border-border flex items-center justify-center text-muted-foreground min-h-0"><X size={14} /></button>
          </div>
        ) : (
          <button onClick={() => { setCityValue(day.city_label ?? ""); setEditingCity(true); }}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground min-h-0 h-auto py-1">
            <span dir="ltr">{day.city_label || "הוסף עיר / איזור"}</span>
            <Pencil size={12} />
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="px-4 space-y-2 animate-pulse">
          {[0, 1, 2].map((i) => <div key={i} className="h-20 bg-card border border-border rounded-2xl" />)}
        </div>
      ) : !hasAnyEntries ? (
        <div className="px-4"><EmptyDay onAdd={openPicker} /></div>
      ) : (
        <div id="day-split" className="relative flex flex-col" style={{ height: "calc(100dvh - 220px)" }}>
          {/* Map pane */}
          <div className="relative overflow-hidden" style={{ height: `${mapPct}%` }}>
            {mapStops.length > 0 ? (
              <DayMap stops={mapStops} highlightId={highlightId} onPinTap={scrollToCard} />
            ) : (
              <div className="w-full h-full bg-muted/40 flex flex-col items-center justify-center text-center gap-2 px-6">
                <MapIcon size={28} className="text-muted-foreground" />
                <div className="text-sm text-muted-foreground">אין פריטים עם מיקום להצגה במפה</div>
                <div className="text-xs text-muted-foreground">הוסף לינק גוגל מפות לפריטים ותראה אותם כאן</div>
              </div>
            )}
          </div>

          {/* Divider */}
          <div
            role="separator"
            aria-orientation="horizontal"
            onPointerDown={(e) => { draggingRef.current = true; document.body.style.cursor = "row-resize"; e.preventDefault(); }}
            className="h-3 bg-card border-y border-border flex items-center justify-center cursor-row-resize touch-none select-none"
          >
            <div className="w-10 h-1 rounded-full bg-border" />
          </div>

          {/* List pane */}
          <div ref={listRef} className="flex-1 overflow-y-auto px-4 pt-3 pb-4">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={entries.map((e) => e.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-2">
                  {directionsEnabled && (
                    <a
                      href={directions}
                      target="_blank"
                      rel="noreferrer"
                      title="לשינוי מצב תחבורה — השתמש בכפתורי הניווט בין הנקודות למטה"
                      className="w-full h-9 rounded-full border border-border text-xs text-muted-foreground flex items-center justify-center gap-2 hover:border-[color:var(--accent)] hover:text-[color:var(--accent)]"
                    >
                      🗺 פתח את כל היום בגוגל מפות (ברגל)
                    </a>
                  )}
                  {entries.map((e, idx) => {
                    const prev = idx > 0 ? entries[idx - 1] : null;
                    const a = prev ? coordsOf(prev) : null;
                    const b = coordsOf(e);
                    return (
                      <div key={e.id}>
                        {prev && (a && b ? (
                          <SegmentConnector a={a} b={b} />
                        ) : (
                          <div className="h-px bg-border mr-14 my-2" />
                        ))}
                        <SortableEntry
                          entry={e}
                          pinIndex={stopIndexById[e.id] ?? null}
                          highlighted={highlightId === e.id}
                          setRef={(el) => (cardRefs.current[e.id] = el)}
                          onEdit={() => setEditEntry(e)}
                          onEditLocation={() => setEditLocationEntry(e)}
                          onDelete={() => { if (confirm("למחוק פריט?")) del.mutate(e.id); }}
                        />
                      </div>
                    );
                  })}
                </div>
              </SortableContext>
            </DndContext>

            <button onClick={openPicker}
              className="w-full h-11 mt-3 rounded-xl bg-[color:var(--accent)] text-white text-sm font-medium flex items-center justify-center gap-2">
              <Plus size={16} /> הוסף פעילות
            </button>
          </div>
        </div>
      )}


      <BottomSheet open={pickerOpen} onOpenChange={setPickerOpen} title={entryType ? undefined : "בחר סוג פעילות"}>
        {!entryType ? (
          <div className="grid grid-cols-2 gap-3 pt-2 pb-4">
            {ENTRY_TYPES.map((t) => {
              const tint = TYPE_COLOR[t.type] ?? "var(--accent)";
              return (
                <button key={t.type} onClick={() => setEntryType(t.type as EntryType)}
                  className="flex flex-col items-center justify-center gap-3 py-6 rounded-2xl border border-border bg-background active:scale-[0.98] transition-transform"
                  style={{ background: `color-mix(in oklab, ${tint} 8%, transparent)` }}>
                  <span className="text-4xl">{t.icon}</span>
                  <span className="text-sm font-medium">{t.label}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <EntryForm
            key={entryType}
            dayId={day.id}
            entryType={entryType}
            defaultOrder={entries.length}
            onDone={() => { setEntryType(null); setPickerOpen(false); }}
            onBack={() => setEntryType(null)}
          />
        )}
      </BottomSheet>

      <BottomSheet open={!!editEntry} onOpenChange={(o) => !o && setEditEntry(null)} title="ערוך פריט">
        {editEntry && (
          <EntryForm
            key={editEntry.id}
            dayId={day.id}
            entryType={editEntry.entry_type as EntryType}
            defaultOrder={editEntry.display_order}
            existing={editEntry}
            onDone={() => setEditEntry(null)}
          />
        )}
      </BottomSheet>

      <BottomSheet
        open={!!editLocationEntry}
        onOpenChange={(o) => !o && setEditLocationEntry(null)}
        title={editLocationEntry ? `עדכן מיקום — ${editLocationEntry.title}` : undefined}
      >
        {editLocationEntry && (
          <div className="pt-2 pb-2">
            <PlacesSearch
              onSelect={(place) =>
                updateEntryLocation.mutate({ entry: editLocationEntry, place })
              }
            />
          </div>
        )}
      </BottomSheet>
    </div>
  );
}

function SegmentConnector({ a, b }: { a: { lat: number; lng: number }; b: { lat: number; lng: number } }) {
  const km = haversine({ lat: a.lat, lon: a.lng }, { lat: b.lat, lon: b.lng });
  const suggested: "walking" | "transit" | "driving" =
    km < 1.5 ? "walking" : km <= 10 ? "transit" : "driving";
  const base = `https://www.google.com/maps/dir/?api=1&origin=${a.lat},${a.lng}&destination=${b.lat},${b.lng}`;
  const modes: { key: "walking" | "transit" | "driving"; label: string; emoji: string }[] = [
    { key: "walking", label: "ברגל", emoji: "🚶" },
    { key: "transit", label: "תחבורה", emoji: "🚌" },
    { key: "driving", label: "מכונית", emoji: "🚗" },
  ];
  return (
    <div className="mr-14 my-1 flex flex-col items-start gap-1" dir="rtl">
      <div className="w-0.5 h-3 bg-border" />
      <div className="text-[11px] text-muted-foreground">→ {fmtDistance(km)}</div>
      <div className="flex gap-1.5 flex-wrap">
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
              className="h-7 px-3 rounded-full text-[11px] inline-flex items-center gap-1 leading-none"
              style={
                isOn
                  ? { background: "var(--accent)", color: "#fff", border: "1px solid transparent" }
                  : { background: "transparent", color: "var(--foreground)", border: "1px solid var(--border)" }
              }
            >
              <span>{m.emoji}</span>
              <span>{m.label}</span>
            </a>
          );
        })}
      </div>
      <div className="w-0.5 h-3 bg-border" />
    </div>
  );
}



function SortableEntry({
  entry, pinIndex, highlighted, setRef, onEdit, onEditLocation, onDelete,
}: {
  entry: EntryRow;
  pinIndex: number | null;
  highlighted: boolean;
  setRef: (el: HTMLDivElement | null) => void;
  onEdit: () => void;
  onEditLocation: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: entry.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };
  const tint = TYPE_COLOR[entry.entry_type] ?? "var(--chart-6)";
  const pinColor = TYPE_PIN_COLOR[entry.entry_type] ?? "#6C63FF";
  const icon = entry.icon_emoji || TYPE_ICON[entry.entry_type] || "•";
  const hasCoords = pinIndex != null;
  const isLinked = !!entry.linked_recommendation_id;

  return (
    <div ref={(el) => { setNodeRef(el); setRef(el); }} style={style}>
      <motion.div
        animate={highlighted ? { boxShadow: `0 0 0 2px ${pinColor}` } : { boxShadow: "0 0 0 0px transparent" }}
        transition={{ duration: 0.35 }}
        className="bg-card border border-border rounded-2xl p-3"
      >
        <div className="flex items-start gap-2">
          <button
            {...attributes} {...listeners} type="button" aria-label="גרור לשינוי סדר"
            className="w-7 self-stretch flex items-center justify-center text-muted-foreground touch-none cursor-grab active:cursor-grabbing min-h-0"
          >
            <GripVertical size={16} />
          </button>
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-[13px] font-semibold shrink-0"
            style={{
              background: hasCoords ? pinColor : `color-mix(in oklab, ${tint} 22%, transparent)`,
              color: hasCoords ? "#0F0F13" : tint,
              border: hasCoords ? "2px solid var(--background)" : "none",
            }}
          >
            {hasCoords ? pinIndex : icon}
          </div>
          <div className="flex-1 min-w-0">
            {entry.time_of_day && (
              <div className="text-xs text-muted-foreground tabular-nums" dir="ltr">{entry.time_of_day}</div>
            )}
            <div className="font-medium text-[15px] flex items-center gap-1.5 flex-wrap">
              <span className="me-1">{icon}</span>
              <span>{entry.title}</span>
              {hasCoords && (
                <span
                  aria-label="במפה"
                  className="inline-block w-2 h-2 rounded-full shrink-0"
                  style={{ background: pinColor }}
                />
              )}
              {isLinked && (
                <span title="מסונכרן עם המלצות" className="inline-flex text-[color:var(--accent-3)] shrink-0">
                  <Link2 size={12} aria-label="מסונכרן עם המלצות" />
                </span>
              )}
            </div>
            {!hasCoords && entry.entry_type !== "note" && (
              <button
                type="button"
                onClick={onEditLocation}
                className="text-[11px] text-muted-foreground underline mt-1 inline-flex items-center gap-1 min-h-0 h-auto p-0"
              >
                📍 לא זוהה מיקום — לחץ לעדכון
              </button>
            )}
            {entry.location_name && (
              <div className="text-xs text-muted-foreground mt-0.5" dir="ltr">{entry.location_name}</div>
            )}
            {entry.description && (
              <div className="text-sm text-muted-foreground mt-1 whitespace-pre-line line-clamp-3">{entry.description}</div>
            )}
            {(entry.google_maps_url || hasCoords) && (
              <a
                href={
                  hasCoords && entry.latitude != null && entry.longitude != null
                    ? mapsSearchUrl(Number(entry.latitude), Number(entry.longitude))
                    : entry.google_maps_url!
                }
                target="_blank"
                rel="noreferrer"
                className="text-xs text-[color:var(--accent)] inline-flex items-center gap-1 mt-2"
              >
                <ExternalLink size={12} /> פתח במפה
              </a>
            )}
          </div>
          {entry.photo_url && (
            <img
              src={entry.photo_url}
              alt=""
              loading="lazy"
              className="w-[60px] h-[60px] rounded-lg object-cover shrink-0"
            />
          )}
          <div className="flex flex-col gap-1 shrink-0">
            <button onClick={onEdit} aria-label="ערוך"
              className="w-7 h-7 rounded-full border border-border flex items-center justify-center text-muted-foreground min-h-0"><Pencil size={12} /></button>
            <button onClick={onDelete} aria-label="מחק"
              className="w-7 h-7 rounded-full border border-border flex items-center justify-center text-[color:var(--accent-2)] min-h-0"><Trash2 size={12} /></button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function EmptyDay({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="text-center py-14 space-y-4 flex flex-col items-center">
      <svg viewBox="0 0 96 96" width="96" height="96" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" className="text-[color:var(--accent)]">
        <circle cx="48" cy="48" r="30" />
        <path d="M48 30v18l12 8" />
        <path d="M20 20l6 6M76 20l-6 6M48 80v6" />
      </svg>
      <div className="space-y-1">
        <div className="text-[16px] font-medium">היום עדיין ריק</div>
        <div className="text-xs text-muted-foreground max-w-[260px]">הוסף טיסות, מלונות, אטרקציות, ארוחות, תחבורה או הערות — הכל יופיע כטיימליין ועל המפה.</div>
      </div>
      <button onClick={onAdd} className="h-12 px-6 rounded-xl bg-[color:var(--accent)] text-white font-medium inline-flex items-center gap-2">
        <Plus size={18} /> הוסף פעילות לאותו יום
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Entry form
// ─────────────────────────────────────────────────────────────────

function EntryForm(props: {
  dayId: string;
  entryType: EntryType;
  defaultOrder: number;
  existing?: EntryRow;
  onDone: () => void;
  onBack?: () => void;
}) {
  const { entryType } = props;
  const meta = ENTRY_TYPES.find((t) => t.type === entryType)!;
  return (
    <div className="pb-2">
      <div className="flex items-center justify-between pt-1 pb-3">
        {props.onBack ? (
          <button type="button" onClick={props.onBack} className="text-xs text-muted-foreground min-h-0 h-auto p-0">← סוג אחר</button>
        ) : <span />}
        <div className="text-lg font-medium flex items-center gap-2"><span>{meta.icon}</span>{meta.label}</div>
      </div>
      {entryType === "flight" && <FlightForm {...props} />}
      {entryType === "hotel_checkin" && <LodgingForm {...props} />}
      {entryType === "attraction" && <PlaceForm {...props} recType="attraction" />}
      {entryType === "food" && <PlaceForm {...props} recType="food" />}
      {entryType === "transport" && <TransportForm {...props} />}
      {entryType === "note" && <NoteForm {...props} />}
    </div>
  );
}

type EntryPayload = {
  entry_type: EntryType;
  title: string;
  description?: string | null;
  time_of_day?: string | null;
  icon_emoji?: string | null;
  location_name?: string | null;
  google_maps_url?: string | null;
  linked_recommendation_id?: string | null;
  display_order?: number;
  latitude?: number | null;
  longitude?: number | null;
  photo_url?: string | null;
};

function useUpsert(dayId: string, existingId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: EntryPayload) => {
      if (existingId) {
        const { error } = await supabase.from("day_entries").update(payload).eq("id", existingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("day_entries").insert({ day_id: dayId, ...payload });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["day-entries", dayId] });
      qc.invalidateQueries({ queryKey: ["day-entries-summary"] });
      qc.invalidateQueries({ queryKey: ["recs"] });
      toast.success(existingId ? "נשמר" : "נוסף");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

function L({ children }: { children: React.ReactNode }) {
  return <label className="text-xs text-muted-foreground">{children}</label>;
}
const inputCls = "w-full mt-1 rounded-lg bg-background border border-input px-3 h-11 outline-none focus:border-[color:var(--accent)]";
const textareaCls = "w-full mt-1 rounded-lg bg-background border border-input px-3 py-2 min-h-[70px] outline-none focus:border-[color:var(--accent)]";
const btnCls = "w-full h-12 rounded-xl bg-[color:var(--accent)] text-white font-medium disabled:opacity-50";

type CoordState = "idle" | "loading" | "found" | "failed";

function CoordStatus({ status }: { status: CoordState }) {
  if (status === "idle") return null;
  if (status === "loading") {
    return (
      <div className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-muted-foreground animate-pulse" />
        🔍 מזהה מיקום...
      </div>
    );
  }
  if (status === "found") {
    return <div className="text-[11px] text-[color:var(--accent-3)] mt-1">✅ מיקום זוהה</div>;
  }
  return (
    <div className="text-[11px] text-[color:var(--accent-2)] mt-1">
      ⚠️ לא זוהה מיקום — נסה להעתיק את הלינק המלא (Share → Copy link, לא Short URL)
    </div>
  );
}

function useResolveMapsUrl(initial: { lat: number; lng: number } | null = null) {
  const resolveFn = useServerFn(resolveMapsUrl);
  const [status, setStatus] = useState<CoordState>(initial ? "found" : "idle");
  const [resolved, setResolved] = useState<{ lat: number; lng: number } | null>(initial);
  const seq = useRef(0);
  const pending = useRef<Promise<{ lat: number; lng: number } | null> | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reset = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setStatus("idle");
    setResolved(null);
    pending.current = null;
  }, []);

  const runResolve = useCallback(async (url: string): Promise<{ lat: number; lng: number } | null> => {
    const trimmed = url.trim();
    if (!trimmed) { setStatus("idle"); setResolved(null); return null; }

    const local = parseLatLngFromMapsUrl(trimmed);
    if (local) {
      setStatus("found");
      setResolved(local);
      return local;
    }

    let host = "";
    try { host = new URL(trimmed).hostname.toLowerCase(); } catch {
      setStatus("failed");
      setResolved(null);
      return null;
    }
    const isShort = host === "maps.app.goo.gl" || host === "goo.gl" || host.endsWith(".app.goo.gl");
    if (!isShort) {
      setStatus("failed");
      setResolved(null);
      return null;
    }

    const my = ++seq.current;
    setStatus("loading");
    const task = (async () => {
      try {
        const r = await resolveFn({ data: { url: trimmed } });
        if (my !== seq.current) return null;
        if (r) {
          const c = { lat: r.lat, lng: r.lng };
          setResolved(c);
          setStatus("found");
          return c;
        }
        setResolved(null);
        setStatus("failed");
        return null;
      } catch {
        if (my === seq.current) { setResolved(null); setStatus("failed"); }
        return null;
      }
    })();
    pending.current = task;
    return task;
  }, [resolveFn]);

  const tryResolve = useCallback((url: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    return runResolve(url);
  }, [runResolve]);

  const scheduleDebounced = useCallback((url: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setStatus("idle");
    debounceRef.current = setTimeout(() => { void runResolve(url); }, 800);
  }, [runResolve]);

  const awaitPending = useCallback(async () => {
    if (pending.current) return pending.current;
    return null;
  }, []);

  return { status, resolved, tryResolve, scheduleDebounced, reset, awaitPending };
}

type BaseFormProps = {
  dayId: string;
  defaultOrder: number;
  existing?: EntryRow;
  onDone: () => void;
};

function parseDesc(desc: string | null | undefined, key: string): string {
  if (!desc) return "";
  const m = desc.match(new RegExp(`^${key}:\\s*(.*)$`, "m"));
  return m ? m[1] : "";
}

function FlightForm({ dayId, defaultOrder, existing, onDone }: BaseFormProps) {
  const [flight, setFlight] = useState(existing?.title.split(" ")[0] ?? "");
  const [origin, setOrigin] = useState(parseDesc(existing?.description, "מוצא"));
  const [destination, setDestination] = useState(parseDesc(existing?.description, "יעד"));
  const [depart, setDepart] = useState(existing?.time_of_day ?? "");
  const [arrive, setArrive] = useState(parseDesc(existing?.description, "נחיתה"));
  const [notes, setNotes] = useState(parseDesc(existing?.description, "הערות"));
  const mut = useUpsert(dayId, existing?.id);
  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      const title = `${flight} ${origin}→${destination}`.trim();
      const description = [
        origin && `מוצא: ${origin}`,
        destination && `יעד: ${destination}`,
        arrive && `נחיתה: ${arrive}`,
        notes && `הערות: ${notes}`,
      ].filter(Boolean).join("\n");
      mut.mutate({
        entry_type: "flight", title: title || flight || "טיסה",
        description: description || null, time_of_day: depart || null, icon_emoji: "✈️",
        display_order: existing?.display_order ?? defaultOrder,
      }, { onSuccess: onDone });
    }} className="space-y-3">
      <div><L>מספר טיסה</L><input value={flight} onChange={(e) => setFlight(e.target.value)} dir="ltr" placeholder="LY 083" className={inputCls} /></div>
      <div className="grid grid-cols-2 gap-2">
        <div><L>מוצא</L><input value={origin} onChange={(e) => setOrigin(e.target.value)} dir="ltr" placeholder="TLV" className={inputCls} /></div>
        <div><L>יעד</L><input value={destination} onChange={(e) => setDestination(e.target.value)} dir="ltr" placeholder="NRT" className={inputCls} /></div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div><L>שעת המראה</L><input type="time" value={depart} onChange={(e) => setDepart(e.target.value)} dir="ltr" className={inputCls} /></div>
        <div><L>שעת נחיתה</L><input type="time" value={arrive} onChange={(e) => setArrive(e.target.value)} dir="ltr" className={inputCls} /></div>
      </div>
      <div><L>הערות</L><textarea value={notes} onChange={(e) => setNotes(e.target.value)} className={textareaCls} /></div>
      <button type="submit" disabled={mut.isPending} className={btnCls}>{mut.isPending ? "שומר..." : "שמור"}</button>
    </form>
  );
}

function LodgingForm({ dayId, defaultOrder, existing, onDone }: BaseFormProps) {
  const [name, setName] = useState(existing?.title ?? "");
  const [time, setTime] = useState(existing?.time_of_day ?? "");
  const [price, setPrice] = useState(parseDesc(existing?.description, "מחיר ללילה"));
  const [url, setUrl] = useState(parseDesc(existing?.description, "הזמנה"));
  const [mapsUrl, setMapsUrl] = useState(existing?.google_maps_url ?? "");
  const [cancel, setCancel] = useState(parseDesc(existing?.description, "ביטול"));
  const [notes, setNotes] = useState(parseDesc(existing?.description, "הערות"));
  const mut = useUpsert(dayId, existing?.id);
  const initialCoords = existing?.latitude != null && existing?.longitude != null
    ? { lat: Number(existing.latitude), lng: Number(existing.longitude) }
    : null;
  const [resolvedCoords, setResolvedCoords] = useState<{ lat: number; lng: number } | null>(initialCoords);
  const resolver = useResolveMapsUrl(initialCoords);
  useEffect(() => { setResolvedCoords(resolver.resolved); }, [resolver.resolved]);
  return (
    <form onSubmit={async (e) => {
      e.preventDefault();
      if (!name.trim()) { toast.error("שם המלון חסר"); return; }
      const description = [
        price && `מחיר ללילה: ${price}`,
        url && `הזמנה: ${url}`,
        cancel && `ביטול: ${cancel}`,
        notes && `הערות: ${notes}`,
      ].filter(Boolean).join("\n");
      const local = parseLatLngFromMapsUrl(mapsUrl);
      const awaited = mapsUrl && !local && !resolvedCoords
        ? await resolver.tryResolve(mapsUrl)
        : null;
      const c = local ?? resolvedCoords ?? awaited;
      mut.mutate({
        entry_type: "hotel_checkin", title: name.trim(),
        description: description || null, time_of_day: time || null, icon_emoji: "🏨",
        google_maps_url: mapsUrl || null,
        latitude: c?.lat ?? null, longitude: c?.lng ?? null,
        display_order: existing?.display_order ?? defaultOrder,
      }, { onSuccess: onDone });
    }} className="space-y-3">
      <div><L>שם המלון</L><input value={name} onChange={(e) => setName(e.target.value)} required className={inputCls} /></div>
      <div><L>שעת צ׳ק-אין</L><input type="time" value={time} onChange={(e) => setTime(e.target.value)} dir="ltr" className={inputCls} /></div>
      <div><L>מחיר ללילה (₪)</L><input type="number" value={price} onChange={(e) => setPrice(e.target.value)} className={inputCls} /></div>
      <div><L>לינק להזמנה</L><input type="url" value={url} onChange={(e) => setUrl(e.target.value)} dir="ltr" className={inputCls} /></div>
      <div>
        <L>לינק גוגל מפות</L>
        <input
          type="url" value={mapsUrl}
          onChange={(e) => { setMapsUrl(e.target.value); resolver.scheduleDebounced(e.target.value); }}
          onBlur={(e) => { void resolver.tryResolve(e.target.value); }}
          dir="ltr" placeholder="https://maps.app.goo.gl/..." className={inputCls}
        />
        <CoordStatus status={resolver.status} />
      </div>
      <div><L>תאריך ביטול חינם</L><input type="date" value={cancel} onChange={(e) => setCancel(e.target.value)} className={inputCls} /></div>
      <div><L>הערות</L><textarea value={notes} onChange={(e) => setNotes(e.target.value)} className={textareaCls} /></div>
      <button type="submit" disabled={mut.isPending} className={btnCls}>{mut.isPending ? "שומר..." : "שמור"}</button>
    </form>
  );
}

function PlaceForm({ dayId, defaultOrder, existing, onDone, recType }: BaseFormProps & { recType: "attraction" | "food" }) {
  const [name, setName] = useState(existing?.title ?? "");
  const [time, setTime] = useState(existing?.time_of_day ?? "");
  const [area, setArea] = useState(existing?.location_name ?? "");
  const [mapsUrl, setMapsUrl] = useState(existing?.google_maps_url ?? "");
  const [foodType, setFoodType] = useState(recType === "food" ? parseDesc(existing?.description, "סוג") : "");
  const [notes, setNotes] = useState(recType === "food" ? parseDesc(existing?.description, "הערות") || (existing?.description ?? "") : (existing?.description ?? ""));
  const [saveToRecs, setSaveToRecs] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(existing?.photo_url ?? null);
  const mut = useUpsert(dayId, existing?.id);
  const initialCoords = existing?.latitude != null && existing?.longitude != null
    ? { lat: Number(existing.latitude), lng: Number(existing.longitude) }
    : null;
  const [resolvedCoords, setResolvedCoords] = useState<{ lat: number; lng: number } | null>(initialCoords);
  const [placeCoords, setPlaceCoords] = useState<{ lat: number; lng: number } | null>(initialCoords);
  const [placeSelected, setPlaceSelected] = useState<{ name: string; address: string } | null>(
    existing ? { name: existing.title, address: existing.location_name ?? "" } : null,
  );
  const [manualMode, setManualMode] = useState(!!existing);
  const resolver = useResolveMapsUrl(initialCoords);
  useEffect(() => { setResolvedCoords(resolver.resolved); }, [resolver.resolved]);

  function handlePlace(p: SelectedPlace) {
    setName(p.name);
    setArea(p.address);
    setMapsUrl(p.google_maps_url);
    setPlaceCoords({ lat: p.latitude, lng: p.longitude });
    setPhotoUrl(p.photo_url);
    setPlaceSelected({ name: p.name, address: p.address });
  }

  function clearPlace() {
    setPlaceSelected(null);
    setName("");
    setArea("");
    setMapsUrl("");
    setPlaceCoords(null);
    setPhotoUrl(null);
  }

  return (
    <form onSubmit={async (e) => {
      e.preventDefault();
      if (!name.trim()) { toast.error(recType === "food" ? "שם המסעדה חסר" : "שם האטרקציה חסר"); return; }
      let linkedId: string | null = existing?.linked_recommendation_id ?? null;
      if (!existing && saveToRecs) {
        try {
          linkedId = await saveRecommendation({
            type: recType, name: name.trim(), city: area || null,
            google_maps_url: mapsUrl || null, notes: notes || null,
          });
        } catch (err) { toast.error((err as Error).message); }
      }
      const description = recType === "food"
        ? [foodType && `סוג: ${foodType}`, notes && `הערות: ${notes}`].filter(Boolean).join("\n")
        : notes;
      let c: { lat: number; lng: number } | null = placeCoords;
      if (!c) {
        const local = parseLatLngFromMapsUrl(mapsUrl);
        const awaited = mapsUrl && !local && !resolvedCoords
          ? await resolver.tryResolve(mapsUrl)
          : null;
        c = local ?? resolvedCoords ?? awaited;
      }
      mut.mutate({
        entry_type: recType, title: name.trim(),
        description: description || null, time_of_day: time || null,
        icon_emoji: recType === "food" ? "🍜" : "⛩",
        location_name: area || null, google_maps_url: mapsUrl || null,
        linked_recommendation_id: linkedId,
        latitude: c?.lat ?? null, longitude: c?.lng ?? null,
        photo_url: photoUrl,
        display_order: existing?.display_order ?? defaultOrder,
      }, { onSuccess: onDone });
    }} className="space-y-3">
      {!manualMode && !placeSelected && (
        <>
          <PlacesSearch onSelect={handlePlace} placeholder={recType === "food" ? "חפש מסעדה..." : "חפש אטרקציה..."} />
          <button type="button" onClick={() => setManualMode(true)}
            className="text-xs text-muted-foreground underline min-h-0 h-auto p-0">
            הוסף ידנית
          </button>
        </>
      )}

      {placeSelected && (
        <div className="rounded-lg border border-[color:var(--accent-3)]/40 bg-[color:var(--accent-3)]/10 p-2 text-xs flex items-start gap-2">
          {photoUrl && (
            <img src={photoUrl} alt="" className="w-10 h-10 rounded-md object-cover shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <div className="text-[color:var(--accent-3)]">✅ {placeSelected.name}</div>
            {placeSelected.address && (
              <div className="text-muted-foreground truncate" dir="ltr">{placeSelected.address}</div>
            )}
            {placeCoords && <div className="text-[10px] text-muted-foreground mt-0.5">✅ מיקום זוהה</div>}
          </div>
          <button type="button" onClick={clearPlace}
            className="text-[color:var(--accent)] underline min-h-0 h-auto p-0 shrink-0">שנה</button>
        </div>
      )}

      {(manualMode || placeSelected) && (
        <>
          <div><L>{recType === "food" ? "שם המסעדה" : "שם האטרקציה"}</L><input value={name} onChange={(e) => setName(e.target.value)} required className={inputCls} /></div>
          <div><L>שעה מתוכננת</L><input type="time" value={time} onChange={(e) => setTime(e.target.value)} dir="ltr" className={inputCls} /></div>
          <div><L>אזור / שכונה</L><input value={area} onChange={(e) => setArea(e.target.value)} dir="ltr" className={inputCls} /></div>
          {recType === "food" && (
            <div><L>סוג אוכל</L><input value={foodType} onChange={(e) => setFoodType(e.target.value)} placeholder="ראמן, סושי..." className={inputCls} /></div>
          )}
          {manualMode && !placeSelected && (
            <div>
              <L>לינק גוגל מפות</L>
              <input
                type="url" value={mapsUrl}
                onChange={(e) => { setMapsUrl(e.target.value); resolver.scheduleDebounced(e.target.value); }}
                onBlur={(e) => { void resolver.tryResolve(e.target.value); }}
                dir="ltr" placeholder="https://maps.app.goo.gl/..." className={inputCls}
              />
              <CoordStatus status={resolver.status} />
            </div>
          )}
          <div><L>הערות</L><textarea value={notes} onChange={(e) => setNotes(e.target.value)} className={textareaCls} /></div>
          {!existing && (
            <label className="flex items-center gap-2 py-2 text-sm">
              <input type="checkbox" checked={saveToRecs} onChange={(e) => setSaveToRecs(e.target.checked)} className="w-4 h-4 accent-[color:var(--accent)]" />
              <span>שמור גם בהמלצות</span>
            </label>
          )}
          <button type="submit" disabled={mut.isPending} className={btnCls}>{mut.isPending ? "שומר..." : "שמור"}</button>
        </>
      )}
    </form>
  );
}

const TRANSPORT_TYPES = ["רכבת", "אוטובוס", "מונית", "הליכה", "שינקנסן", "מטרו"];

function TransportForm({ dayId, defaultOrder, existing, onDone }: BaseFormProps) {
  const [kind, setKind] = useState(existing ? parseDesc(existing.description, "סוג") || "רכבת" : "רכבת");
  const [from, setFrom] = useState(existing ? parseDesc(existing.description, "מוצא") : "");
  const [to, setTo] = useState(existing ? parseDesc(existing.description, "יעד") : "");
  const [time, setTime] = useState(existing?.time_of_day ?? "");
  const [duration, setDuration] = useState(existing ? parseDesc(existing.description, "משך") : "");
  const [notes, setNotes] = useState(existing ? parseDesc(existing.description, "הערות") : "");
  const mut = useUpsert(dayId, existing?.id);
  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      const description = [
        `סוג: ${kind}`,
        from && `מוצא: ${from}`,
        to && `יעד: ${to}`,
        duration && `משך: ${duration}`,
        notes && `הערות: ${notes}`,
      ].filter(Boolean).join("\n");
      mut.mutate({
        entry_type: "transport", title: `${kind}${from && to ? ` · ${from} → ${to}` : ""}`,
        description: description || null, time_of_day: time || null, icon_emoji: "🚆",
        display_order: existing?.display_order ?? defaultOrder,
      }, { onSuccess: onDone });
    }} className="space-y-3">
      <div><L>סוג</L>
        <select value={kind} onChange={(e) => setKind(e.target.value)} className={inputCls}>
          {TRANSPORT_TYPES.map((t) => <option key={t}>{t}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div><L>מוצא</L><input value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} /></div>
        <div><L>יעד</L><input value={to} onChange={(e) => setTo(e.target.value)} className={inputCls} /></div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div><L>שעת יציאה</L><input type="time" value={time} onChange={(e) => setTime(e.target.value)} dir="ltr" className={inputCls} /></div>
        <div><L>משך</L><input value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="2.5 שעות" className={inputCls} /></div>
      </div>
      <div><L>הערות</L><textarea value={notes} onChange={(e) => setNotes(e.target.value)} className={textareaCls} /></div>
      <button type="submit" disabled={mut.isPending} className={btnCls}>{mut.isPending ? "שומר..." : "שמור"}</button>
    </form>
  );
}

function NoteForm({ dayId, defaultOrder, existing, onDone }: BaseFormProps) {
  const [title, setTitle] = useState(existing?.title === "הערה" ? "" : (existing?.title ?? ""));
  const [content, setContent] = useState(existing?.description ?? "");
  const mut = useUpsert(dayId, existing?.id);
  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      if (!content.trim()) { toast.error("תוכן חסר"); return; }
      mut.mutate({
        entry_type: "note", title: title.trim() || "הערה",
        description: content, icon_emoji: "📝",
        display_order: existing?.display_order ?? defaultOrder,
      }, { onSuccess: onDone });
    }} className="space-y-3">
      <div><L>כותרת (לא חובה)</L><input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} /></div>
      <div><L>תוכן</L><textarea value={content} onChange={(e) => setContent(e.target.value)} required rows={5} className={textareaCls} /></div>
      <button type="submit" disabled={mut.isPending} className={btnCls}>{mut.isPending ? "שומר..." : "שמור"}</button>
    </form>
  );
}
