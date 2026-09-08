import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ChevronRight, ExternalLink, Pencil, Trash2, Plus, Check, X, Map as MapIcon, Link2, GripVertical } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDays, useRecs, useTrip, useHotels, dayEntriesQuery } from "@/hooks/use-trip";
import { useActiveTripId } from "@/hooks/use-active-trip";
import { hebDate, hebWeekday, hebWeekdayShort, daysBetween } from "@/lib/format";
import { getDestinationTheme } from "@/lib/destination-theme";
import { ENTRY_TYPES } from "@/lib/constants";
import { BottomSheet } from "@/components/BottomSheet";
import DayMap from "@/components/DayMap";
import { saveRecommendation, addRecommendationToDay } from "@/lib/recommendations";
import { parseLatLngFromMapsUrl, googleDirectionsUrl, mapsSearchUrl, walkTimeMin, TYPE_PIN_COLOR } from "@/lib/coords";
import { resolveMapsUrl } from "@/lib/maps-resolver.functions";
import { useServerFn } from "@tanstack/react-start";
import { haversine, fmtDistance } from "@/lib/geo";
import { PlacesSearch, type SelectedPlace } from "@/components/PlacesSearch";
import { toast } from "sonner";
import { assertOnline } from "@/hooks/use-online";
import { useDayWeather } from "@/hooks/use-weather";
import { WeatherIcon } from "@/components/WeatherIcon";

import { DateField } from "@/components/DateField";
import { HotelForm, type Hotel } from "@/components/HotelForm";
import { syncHotelToItinerary } from "@/lib/hotels";
import { ExportAISheet } from "@/components/ExportAISheet";
import { ImportAISheet } from "@/components/ImportAISheet";
import { DaySnapshotsSheet } from "@/components/DaySnapshotsSheet";
import { RatingSheet } from "@/components/RatingSheet";
import { generateDayAIPrompt } from "@/lib/export-to-ai";
import { Sparkles, Download, History, MoreHorizontal } from "lucide-react";


function DayWeatherLine({ city, date }: { city: string | null; date: string }) {
  const w = useDayWeather(city, date);
  if (!w) return null;
  return (
    <div className="flex flex-col items-end gap-0.5">
      <div className="inline-flex items-center gap-1 text-white/70 text-[10px]">
        <WeatherIcon condition={w.condition} size="sm" />
        <span dir="ltr" className="tabular-nums">{w.tempMax}° / {w.tempMin}°</span>
      </div>
      {w.precipitation > 5 && (
        <div className="inline-flex items-center gap-1 text-[10px] text-white bg-white/15 rounded-full px-2 py-0.5">
          💧 צפוי גשם
        </div>
      )}
    </div>
  );
}

/** Pure helper — "HH:MM" → minutes since midnight. */
function parseTime(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
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
  linked_hotel_id?: string | null;
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

function rome2rioUrl(from: string, to: string): string {
  const encode = (s: string) => encodeURIComponent(s.trim().replace(/\s+/g, "-"));
  return `https://www.rome2rio.com/map/${encode(from)}/${encode(to)}`;
}

function navitimeUrl(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
  fromName?: string,
  toName?: string,
): string {
  const params = new URLSearchParams();
  params.set("start", `${a.lat},${a.lng}`);
  if (fromName?.trim()) params.set("start_name", fromName.trim());
  params.set("goal", `${b.lat},${b.lng}`);
  if (toName?.trim()) params.set("goal_name", toName.trim());
  return `https://japantravel.navitime.com/en/area/jp/route/result/?${params.toString()}`;
}


function placeName(stop: EntryRow, fallbackCity?: string | null): string {
  return stop.location_name?.trim() || stop.title?.trim() || fallbackCity?.trim() || "";
}


type OptimizeResult = {
  isSuboptimal: boolean;
  optimalOrder: EntryRow[];
  currentDistKm: number;
  optimalDistKm: number;
  savedMinutes: number;
};

/**
 * Computes a nearest-neighbor route (starting from the first located entry)
 * and compares it with the current order. Returns the full suggested order —
 * entries without coordinates keep their relative position at the end.
 */
function isLodgingEntry(e: EntryRow): boolean {
  return e.entry_type === "hotel_checkin" || !!e.linked_hotel_id;
}

function computeOptimalOrder(entries: EntryRow[]): OptimizeResult {
  const none: OptimizeResult = {
    isSuboptimal: false,
    optimalOrder: entries,
    currentDistKm: 0,
    optimalDistKm: 0,
    savedMinutes: 0,
  };
  // Pin lodging entries at the start/end of the day — the day always begins
  // and ends at the hotel. Only the "day body" (activities in between) is reordered.
  const startAnchor = entries.length > 0 && isLodgingEntry(entries[0]) ? entries[0] : null;
  const endAnchor =
    entries.length > 1 && isLodgingEntry(entries[entries.length - 1]) && entries[entries.length - 1] !== startAnchor
      ? entries[entries.length - 1]
      : null;
  const body = entries.filter((e) => e !== startAnchor && e !== endAnchor);

  const withCoords = body.filter((e) => coordsOf(e) !== null);
  if (withCoords.length < 3) return none;
  const toPt = (e: EntryRow) => {
    const c = coordsOf(e)!;
    return { lat: c.lat, lon: c.lng };
  };
  const pathDist = (list: EntryRow[]) => {
    let d = 0;
    for (let i = 0; i < list.length - 1; i++) d += haversine(toPt(list[i]), toPt(list[i + 1]));
    return d;
  };

  // Include pinned lodging anchors (if they have coords) in the distance math,
  // so current vs optimal comparison reflects the real full-day path.
  const anchorPt = (e: EntryRow | null) => (e && coordsOf(e) ? e : null);
  const start = anchorPt(startAnchor);
  const end = anchorPt(endAnchor);
  const withAnchors = (list: EntryRow[]) =>
    [...(start ? [start] : []), ...list, ...(end ? [end] : [])];

  const currentDist = pathDist(withAnchors(withCoords));

  // Nearest-neighbor starting from the lodging anchor (or first body entry).
  const firstEntry = start ?? withCoords[0];
  const remaining = withCoords.filter((e) => e !== firstEntry);
  const optimized = start ? [] : [firstEntry];
  let last = firstEntry;
  while (remaining.length > 0) {
    let nearestIdx = 0;
    let nearestDist = Infinity;
    remaining.forEach((e, i) => {
      const d = haversine(toPt(last), toPt(e));
      if (d < nearestDist) {
        nearestDist = d;
        nearestIdx = i;
      }
    });
    last = remaining.splice(nearestIdx, 1)[0];
    optimized.push(last);
  }

  const optimalDist = pathDist(withAnchors(optimized));
  const savedKm = currentDist - optimalDist;

  const withoutCoords = body.filter((e) => coordsOf(e) === null);

  const optimalOrder = [
    ...(startAnchor ? [startAnchor] : []),
    ...optimized,
    ...withoutCoords,
    ...(endAnchor ? [endAnchor] : []),
  ];

  return {
    isSuboptimal: currentDist > optimalDist * 1.3 && savedKm > 0,
    optimalOrder,
    currentDistKm: Math.round(currentDist * 10) / 10,
    optimalDistKm: Math.round(optimalDist * 10) / 10,
    savedMinutes: Math.max(0, Math.round((savedKm / 30) * 60)),
  };
}

function DayDetail() {
  const { dayId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: days = [] } = useDays();
  const { data: trip } = useTrip();
  const destination = trip?.destination_country?.toLowerCase() ?? "";
  const isJapan = [
    "japan", "יפן", "tokyo", "טוקיו", "kyoto", "קיוטו", "osaka", "אוסקה",
    "hiroshima", "הירושימה", "kanazawa", "קאנאזאווה",
  ].some((k) => destination.includes(k));
  const day = days.find((d) => d.id === dayId);

  const { data: rawEntries = [], isLoading } = useQuery(dayEntriesQuery(dayId));
  const entries = sortEntries(rawEntries as EntryRow[]);

  const linkedRecIds = useMemo(
    () => entries.map((e) => e.linked_recommendation_id).filter((id): id is string => !!id),
    [entries]
  );

  const { data: linkedRecs = [] } = useQuery({
    queryKey: ["linked-recs", linkedRecIds.join(",")],
    queryFn: async () => {
      if (linkedRecIds.length === 0) return [];
      const { data, error } = await supabase
        .from("recommendations")
        .select("id, name, status, rating, review, city, notes, google_rating, google_maps_url, photo_url")
        .in("id", linkedRecIds);
      if (error) throw error;
      return data ?? [];
    },
    enabled: linkedRecIds.length > 0,
    staleTime: 30_000,
  });

  const recById = useMemo(() => {
    return Object.fromEntries(linkedRecs.map((r) => [r.id, r]));
  }, [linkedRecs]);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [entryType, setEntryType] = useState<EntryType | null>(null);
  const [editEntry, setEditEntry] = useState<EntryRow | null>(null);
  const [editLocationEntry, setEditLocationEntry] = useState<EntryRow | null>(null);
  const [detailsFor, setDetailsFor] = useState<EntryRow | null>(null);
  const [movingEntry, setMovingEntry] = useState<EntryRow | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [navigateOpen, setNavigateOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [snapshotsOpen, setSnapshotsOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [heroFailedUrl, setHeroFailedUrl] = useState<string | null>(null);

  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [ratingTarget, setRatingTarget] = useState<{
    recId: string;
    recName: string;
    initialRating?: number;
    initialReview?: string;
  } | null>(null);
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

  // View state — list / map are two modes of the same day.
  const [view, setView] = useState<"list" | "map">("list");
  const [sortMode, setSortMode] = useState(false);
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
  const [selectedSegment, setSelectedSegment] = useState<{ fromId: string; toId: string } | null>(null);
  const [segmentSheet, setSegmentSheet] = useState<{ fromId: string; toId: string } | null>(null);
  const listScrollTop = useRef(0);


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

  const applyOptimalOrder = useMutation({
    mutationFn: async (order: EntryRow[]) => {
      assertOnline();
      await Promise.all(
        order.map((entry, idx) =>
          supabase.from("day_entries").update({ display_order: idx }).eq("id", entry.id)
        )
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["day-entries", dayId] });
      qc.invalidateQueries({ queryKey: ["day-entries-summary"] });
      setShowOptimizePreview(false);
      setZigzagDismissed(true);
      toast.success("✅ המסלול סודר מחדש לפי מרחקים");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const moveEntry = useMutation({
    mutationFn: async ({ entryId, toDayId }: { entryId: string; toDayId: string }) => {
      const { error } = await supabase.from("day_entries").update({ day_id: toDayId }).eq("id", entryId);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["day-entries", dayId] });
      qc.invalidateQueries({ queryKey: ["day-entries", vars.toDayId] });
      qc.invalidateQueries({ queryKey: ["day-entries-summary"] });
      const target = days.find((d) => d.id === vars.toDayId);
      toast.success(`✅ הועבר ליום ${target?.day_number ?? ""}`.trim());
      setMovingEntry(null);
      setDetailsFor(null);
      navigate({ to: "/itinerary" });
    },
    onError: (e: Error) => toast.error(e.message),
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

  const quickAdd = useMutation({
    mutationFn: async (place: SelectedPlace) => {
      const { error } = await supabase.from("day_entries").insert({
        day_id: dayId,
        entry_type: "attraction",
        icon_emoji: TYPE_ICON.attraction,
        title: place.name,
        location_name: place.address || null,
        latitude: place.latitude,
        longitude: place.longitude,
        google_maps_url: place.google_maps_url,
        photo_url: place.photo_url,
        display_order: entries.length,
        time_of_day: null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["day-entries", dayId] });
      qc.invalidateQueries({ queryKey: ["day-entries-summary"] });
      toast.success("✅ נוסף למסלול");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addNavigate = useMutation({
    mutationFn: async ({ place, note }: { place: SelectedPlace | null; note: string }) => {
      if (!place && !note.trim()) throw new Error("בחר מקום או הוסף טקסט");
      const title = place ? `נווט אל: ${place.name}` : `נווט אל: ${note.trim().slice(0, 60)}`;
      const { error } = await supabase.from("day_entries").insert({
        day_id: dayId,
        entry_type: "transport",
        icon_emoji: "🧭",
        title,
        description: note.trim() || null,
        location_name: place?.address ?? null,
        latitude: place?.latitude ?? null,
        longitude: place?.longitude ?? null,
        google_maps_url: place?.google_maps_url ?? null,
        photo_url: place?.photo_url ?? null,
        display_order: entries.length,
        time_of_day: null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["day-entries", dayId] });
      qc.invalidateQueries({ queryKey: ["day-entries-summary"] });
      toast.success("✅ נוספה נקודת ניווט");
      setNavigateOpen(false);
    },
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

  async function handleMarkVisited(entry: EntryRow) {
    if (!entry.linked_recommendation_id) return;
    const { error } = await supabase
      .from("recommendations")
      .update({ status: "visited" })
      .eq("id", entry.linked_recommendation_id);
    if (error) {
      toast.error(error.message);
      return;
    }
    qc.invalidateQueries({ queryKey: ["linked-recs"] });
    qc.invalidateQueries({ queryKey: ["recs", tripId] });
    qc.invalidateQueries({ queryKey: ["recs"] });
    setDetailsFor(null);
    setRatingTarget({
      recId: entry.linked_recommendation_id,
      recName: entry.title,
    });
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { delay: 120, tolerance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 6 } }),
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

  // ⚠️ route optimization: is the current stop order much longer than a
  // nearest-neighbor order starting from the first stop?
  const [zigzagDismissed, setZigzagDismissed] = useState(false);
  const [showOptimizePreview, setShowOptimizePreview] = useState(false);
  const optimize = useMemo(() => computeOptimalOrder(entries), [entries]);
  useEffect(() => { setZigzagDismissed(false); setShowOptimizePreview(false); }, [dayId]);

  // Switching day clears any selection that belongs to the previous day.
  useEffect(() => {
    setSelectedStopId(null);
    setSelectedSegment(null);
    setSegmentSheet(null);
    setSortMode(false);
    setView("list");
  }, [dayId]);

  // Drop selections whose entries no longer exist (deleted / moved to another day).
  useEffect(() => {
    const ids = new Set(entries.map((e) => e.id));
    setSelectedStopId((cur) => (cur && !ids.has(cur) ? null : cur));
    setSelectedSegment((cur) => (cur && (!ids.has(cur.fromId) || !ids.has(cur.toId)) ? null : cur));
    setSegmentSheet((cur) => (cur && (!ids.has(cur.fromId) || !ids.has(cur.toId)) ? null : cur));
  }, [entries]);

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

  function showMap() {
    listScrollTop.current = listRef.current?.scrollTop ?? 0;
    setView("map");
  }

  function showList() {
    setView("list");
    // restore the previous scroll position of the list pane
    window.setTimeout(() => {
      if (listRef.current) listRef.current.scrollTop = listScrollTop.current;
    }, 0);
  }




  if (!day) return <div className="pt-6 text-center text-muted-foreground">יום לא נמצא</div>;

  const hasAnyEntries = entries.length > 0;



  const selectedEntry = selectedStopId ? entries.find((e) => e.id === selectedStopId) ?? null : null;
  const segmentEntries = segmentSheet
    ? {
        from: entries.find((e) => e.id === segmentSheet.fromId) ?? null,
        to: entries.find((e) => e.id === segmentSheet.toId) ?? null,
      }
    : null;

  return (
    <div className="-mx-4">
      {/* Day header — panoramic in list mode, compact in map mode */}
      {(() => {
        const theme = getDestinationTheme(trip?.destination_country ?? "");
        // Only photos that belong to this day are eligible for the header.
        const heroPhoto = entries.find((e) => e.photo_url)?.photo_url ?? null;
        const showPhoto = view === "list" && !!heroPhoto && heroFailedUrl !== heroPhoto;
        const totalLinked = entries.filter((e) => e.linked_recommendation_id).length;
        const visitedCount = entries.filter(
          (e) => e.linked_recommendation_id && recById[e.linked_recommendation_id]?.status === "visited"
        ).length;
        const pillBtn =
          "relative inline-flex items-center justify-center gap-1 rounded-full text-white text-[11px] min-h-0 " +
          "after:absolute after:-inset-2 after:content-['']";
        const pillBg = { background: "rgba(255,255,255,0.18)" } as const;
        return (
          <div
            className={
              "relative w-full overflow-hidden border-b border-border " +
              (view === "list" ? "h-[124px]" : "h-[78px]")
            }
            dir="rtl"
          >
            {/* Background */}
            {showPhoto ? (
              <>
                <img
                  src={heroPhoto!}
                  alt=""
                  aria-hidden
                  onError={() => setHeroFailedUrl(heroPhoto)}
                  className="absolute inset-0 w-full h-full object-cover"
                />
                <div
                  className="absolute inset-0"
                  style={{ background: "linear-gradient(to top, rgba(0,0,0,0.78) 12%, rgba(0,0,0,0.25) 60%, rgba(0,0,0,0.35))" }}
                />
              </>
            ) : (
              <div className="absolute inset-0" style={{ background: theme.heroGradient }} />
            )}

            <div className="relative h-full px-4 py-2.5 flex flex-col justify-between">
              {/* Top row — back (right) + more (left) */}
              <div className="flex items-center justify-between gap-2">
                <button
                  onClick={() => navigate({ to: "/itinerary" })}
                  aria-label="חזרה למסלול"
                  className="relative shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white/90 min-h-0 after:absolute after:-inset-1.5 after:content-['']"
                  style={pillBg}
                >
                  <ChevronRight size={18} />
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setMoreOpen(true)}
                    aria-label="פעולות נוספות"
                    className={pillBtn}
                    style={{ ...pillBg, height: 28, width: 28 }}
                  >
                    <MoreHorizontal size={14} />
                  </button>
                </div>
              </div>

              {/* Bottom section — title/date (right) + weather/city (left) */}
              <div className="flex items-end justify-between gap-2">
                <div className="min-w-0">
                  <h1 className={"text-white font-medium leading-tight " + (view === "list" ? "text-[22px]" : "text-[17px]")}>
                    יום {day.day_number}
                    {day.city_label ? <span className="text-white/85"> · <span dir="ltr">{day.city_label}</span></span> : null}
                  </h1>
                  <p className="text-white/70 text-[11px] leading-snug mt-0.5">
                    {hebWeekday(day.date)}, {hebDate(day.date)}
                  </p>
                  {view === "list" && totalLinked > 0 && (
                    <p className="text-white/60 text-[10px] mt-0.5">
                      ביקרתם ב-{visitedCount} מתוך {totalLinked} מקומות
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  {view === "list" && <DayWeatherLine city={day.city_label ?? null} date={day.date} />}
                  {editingCity ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        autoFocus
                        value={cityValue}
                        onChange={(e) => setCityValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveCity.mutate();
                          if (e.key === "Escape") { setEditingCity(false); setCityValue(day.city_label ?? ""); }
                        }}
                        dir="ltr"
                        placeholder="עיר / איזור"
                        className="text-[12px] bg-white/10 border border-white/30 text-white placeholder:text-white/50 rounded-full px-2.5 py-1 outline-none focus:border-white min-w-0 w-[130px]"
                      />
                      <button
                        onClick={() => saveCity.mutate()}
                        aria-label="שמור עיר"
                        className="w-7 h-7 rounded-full bg-white/20 border border-white/30 text-white flex items-center justify-center min-h-0 shrink-0"
                      >
                        <Check size={13} />
                      </button>
                      <button
                        onClick={() => { setEditingCity(false); setCityValue(day.city_label ?? ""); }}
                        aria-label="בטל עריכת עיר"
                        className="w-7 h-7 rounded-full border border-white/30 text-white flex items-center justify-center min-h-0 shrink-0"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setCityValue(day.city_label ?? ""); setEditingCity(true); }}
                      className="relative inline-flex items-center gap-1 rounded-full text-white text-[10px] px-2 py-1 min-h-0 max-w-[120px] after:absolute after:-inset-2 after:content-['']"
                      style={{ background: "rgba(255,255,255,0.2)" }}
                    >
                      <span dir="ltr" className="truncate">{day.city_label ? "עריכת עיר" : "הוסף עיר / אזור"}</span>
                      <Pencil size={10} className="shrink-0" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* View switch — same day, two modes */}
      <div className="px-4 pt-3" dir="rtl">
        <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[color:var(--surface-2)] border border-border" role="tablist">
          {([
            { key: "list", label: "מסלול" },
            { key: "map", label: "מפה" },
          ] as const).map((t) => {
            const active = view === t.key;
            return (
              <button
                key={t.key}
                role="tab"
                aria-selected={active}
                type="button"
                onClick={() => (t.key === "map" ? showMap() : showList())}
                className={
                  "min-h-11 rounded-lg text-[13px] font-medium transition-colors " +
                  (active ? "bg-[color:var(--accent)] text-white shadow-sm" : "text-muted-foreground")
                }
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {view === "list" && optimize.isSuboptimal && !zigzagDismissed && (
        <div className="mx-4 mt-2 rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/40 px-3.5 py-3">
          <div className="text-[13px] font-medium text-amber-800 dark:text-amber-200">⚠️ סדר המסלול לא אופטימלי</div>
          <div className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">
            חיסכון אפשרי: ~{optimize.savedMinutes} דקות נסיעה{" "}
            <span dir="ltr" className="tabular-nums">({optimize.currentDistKm} ק״מ → {optimize.optimalDistKm} ק״מ)</span>
          </div>
          <div className="flex gap-2 mt-3">
            <button
              type="button"
              className="flex-1 min-h-11 rounded-xl bg-amber-500 text-white text-[13px] font-medium"
              onClick={() => setShowOptimizePreview(true)}
            >
              ✨ הצג סדר מוצע
            </button>
            <button
              type="button"
              className="flex-1 min-h-11 rounded-xl bg-transparent border border-amber-300 text-amber-700 dark:text-amber-300 text-[13px]"
              onClick={() => setZigzagDismissed(true)}
            >
              השאר כמו שהוא
            </button>
          </div>
        </div>
      )}

      {view === "map" ? (
        <div className="relative" style={{ height: "calc(100dvh - 220px)" }}>
          {mapStops.length > 0 ? (
            <DayMap
              stops={mapStops}
              highlightId={selectedStopId}
              segmentIds={selectedSegment}
              bottomPadding={selectedEntry || selectedSegment ? 220 : 60}
              onPinTap={(id) => { setSelectedSegment(null); setSelectedStopId(id); }}
            />
          ) : (
            <div className="w-full h-full bg-muted/40 flex flex-col items-center justify-center text-center gap-2 px-6">
              <MapIcon size={28} className="text-muted-foreground" />
              <div className="text-sm text-muted-foreground">אין תחנות עם מיקום להצגה במפה</div>
              <div className="text-[11px] text-muted-foreground">התחנות ללא מיקום נשארות ברשימת המסלול.</div>
            </div>
          )}

          {/* The drawn line is an OSRM driving estimate — say so, don't imply walking/transit. */}
          {mapStops.length > 1 && !selectedEntry && !selectedSegment && (
            <div
              className="absolute bottom-2 inset-x-3 z-[500] text-[10px] text-center text-muted-foreground bg-card/85 border border-border rounded-full py-1 px-2"
              dir="rtl"
            >
              קו המסלול הוא הערכת נסיעה (OSRM · פרופיל נהיגה), לא מסלול הליכה או תחבורה ציבורית.
            </div>
          )}


          {/* Selected stop card */}
          {selectedEntry && (
            <MapStopCard
              entry={selectedEntry}
              pinIndex={stopIndexById[selectedEntry.id] ?? null}
              onClose={() => setSelectedStopId(null)}
              onEdit={() => setEditEntry(selectedEntry)}
              onMore={() => setDetailsFor(selectedEntry)}
            />
          )}

          {/* Selected segment card */}
          {!selectedEntry && selectedSegment && (() => {
            const from = entries.find((e) => e.id === selectedSegment.fromId);
            const to = entries.find((e) => e.id === selectedSegment.toId);
            const a = from ? coordsOf(from) : null;
            const b = to ? coordsOf(to) : null;
            if (!from || !to || !a || !b) return null;
            return (
              <div
                className="absolute inset-x-0 bottom-0 z-[600] bg-card border-t border-border rounded-t-2xl px-4 pt-3 shadow-lg"
                style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
                dir="rtl"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[15px] font-semibold">המעבר בין התחנות</div>
                    <div className="text-[12px] text-muted-foreground truncate">
                      {from.title} ← {to.title}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedSegment(null)}
                    aria-label="סגור"
                    className="w-9 h-9 -mt-1 rounded-full flex items-center justify-center text-muted-foreground"
                  >
                    <X size={16} />
                  </button>
                </div>
                <div className="pt-2">
                  <SegmentOptions a={a} b={b} from={from} to={to} isJapan={isJapan} city={day.city_label ?? ""} />
                </div>
              </div>
            );
          })()}
        </div>
      ) : isLoading ? (
        <div className="px-4 pt-3 space-y-2 animate-pulse">
          {[0, 1, 2].map((i) => <div key={i} className="h-20 bg-card border border-border rounded-2xl" />)}
        </div>
      ) : !hasAnyEntries ? (
        <div className="px-4 pt-3">
          <EmptyDay
            onAdd={openPicker}
            onPickSaved={() => { setEntryType("attraction"); setPickerOpen(true); }}
          />
        </div>
      ) : (
        <div className="relative flex flex-col" style={{ height: "calc(100dvh - 254px)" }}>
          {/* Summary + list actions */}
          <div className="px-4 pt-2 flex items-center justify-between gap-2" dir="rtl">
            <span className="text-[12px] text-muted-foreground">
              {entries.length} תחנות · סדר ידני
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSortMode((s) => !s)}
                className={
                  "min-h-9 px-3 rounded-full text-[12px] border inline-flex items-center gap-1 " +
                  (sortMode
                    ? "bg-[color:var(--accent)] text-white border-transparent"
                    : "bg-card text-foreground border-border")
                }
                aria-pressed={sortMode}
              >
                <GripVertical size={13} /> {sortMode ? "סיום סידור" : "סידור"}
              </button>
              <button
                type="button"
                onClick={() => setShowOptimizePreview(true)}
                disabled={optimize.optimalOrder === entries || entries.length < 3}
                className="min-h-9 px-3 rounded-full text-[12px] border border-[color:var(--accent)]/50 text-[color:var(--accent)] bg-card inline-flex items-center gap-1 disabled:opacity-40"
              >
                <Sparkles size={13} /> הצעת סדר
              </button>
            </div>
          </div>

          {/* List pane */}
          <div ref={listRef} className="flex-1 overflow-y-auto px-4 pt-3 pb-[120px] relative">

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={entries.map((e) => e.id)} strategy={verticalListSortingStrategy}>
                <div className="flex flex-col gap-4 overscroll-contain">
                  {entries.map((e, idx) => {
                    const b = coordsOf(e);
                    let prev: typeof e | null = null;
                    let a: ReturnType<typeof coordsOf> = null;
                    if (b) {
                      for (let i = idx - 1; i >= 0; i--) {
                        const c = coordsOf(entries[i]);
                        if (c) { prev = entries[i]; a = c; break; }
                      }
                    }

                    return (
                      <div key={e.id}>
                        {prev && a && b && (
                          <SegmentRow
                            a={a}
                            b={b}
                            onOpen={() => setSegmentSheet({ fromId: prev!.id, toId: e.id })}
                            onShowOnMap={() => {
                              setSelectedStopId(null);
                              setSelectedSegment({ fromId: prev!.id, toId: e.id });
                              showMap();
                            }}
                          />
                        )}
                        <SortableEntry
                          entry={e}
                          nextTime={entries[idx + 1]?.time_of_day ?? null}
                          pinIndex={stopIndexById[e.id] ?? null}
                          highlighted={highlightId === e.id}
                          sortMode={sortMode}
                          setRef={(el) => { cardRefs.current[e.id] = el; }}
                          onOpenDetails={() => setDetailsFor(e)}
                          onEdit={() => setEditEntry(e)}
                          recById={recById}
                        />

                      </div>
                    );
                  })}
                </div>
              </SortableContext>
            </DndContext>
          </div>

          {/* Floating action button — 56px circle */}
          <div
            className="fixed right-4 z-40"
            style={{ bottom: `calc(80px + env(safe-area-inset-bottom))` }}
          >
            <button
              onClick={openPicker}
              aria-label="הוספת מקום או פעילות"
              className="h-14 w-14 rounded-full bg-[color:var(--accent)] text-white shadow-md flex items-center justify-center min-h-0 active:scale-95 transition-transform motion-reduce:transition-none"
            >
              <Plus size={24} />
            </button>
          </div>


          {/* Sticky quick search bar */}
          <div
            className="sticky bottom-0 -mx-4 bg-card border-t border-border px-3 flex items-center"
            style={{ minHeight: 52, paddingBottom: "max(0.25rem, env(safe-area-inset-bottom))", paddingTop: "0.25rem" }}
          >
            <div className="flex-1 min-w-0 [&_input]:!h-10 [&_input]:!rounded-[20px] [&_input]:!text-[13px]">
              <PlacesSearch
                key={`quick-${entries.length}`}
                placeholder="חיפוש מהיר בגוגל..."
                onSelect={(place) => quickAdd.mutate(place)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Arrival options for a segment (list mode) */}
      <BottomSheet
        open={!!segmentSheet}
        onOpenChange={(o) => !o && setSegmentSheet(null)}
        title="אפשרויות הגעה"
      >
        {segmentEntries?.from && segmentEntries.to && (() => {
          const a = coordsOf(segmentEntries.from!);
          const b = coordsOf(segmentEntries.to!);
          if (!a || !b) return null;
          return (
            <div className="pb-3" dir="rtl">
              <div className="text-[12px] text-muted-foreground mb-3 break-words">
                {segmentEntries.from!.title} ← {segmentEntries.to!.title}
              </div>
              <SegmentOptions
                a={a}
                b={b}
                from={segmentEntries.from!}
                to={segmentEntries.to!}
                isJapan={isJapan}
                city={day.city_label ?? ""}
              />
            </div>
          );
        })()}
      </BottomSheet>





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

      {/* Quick note sheet */}
      <BottomSheet open={noteOpen} onOpenChange={setNoteOpen} title="הערה מהירה">
        {noteOpen && (
          <EntryForm
            key="quick-note"
            dayId={day.id}
            entryType="note"
            defaultOrder={entries.length}
            onDone={() => setNoteOpen(false)}
          />
        )}
      </BottomSheet>

      {/* Navigate-to sheet */}
      <BottomSheet open={navigateOpen} onOpenChange={setNavigateOpen} title="נווט אל">
        {navigateOpen && (
          <NavigateToForm
            pending={addNavigate.isPending}
            onSubmit={(place, note) => addNavigate.mutate({ place, note })}
          />
        )}
      </BottomSheet>

      {/* Entry details sheet */}
      <BottomSheet
        open={!!detailsFor}
        onOpenChange={(o) => !o && setDetailsFor(null)}
        title={detailsFor?.title}
      >
        {detailsFor && (
          <EntryDetails
            entry={detailsFor}
            dayId={dayId}
            onEdit={() => { setEditEntry(detailsFor); setDetailsFor(null); }}
            onUpdateLocation={() => { setEditLocationEntry(detailsFor); setDetailsFor(null); }}
            onMove={() => { setMovingEntry(detailsFor); setDetailsFor(null); }}
            onDelete={() => {
              if (confirm("למחוק פריט?")) {
                del.mutate(detailsFor.id);
                setDetailsFor(null);
              }
            }}
            onClose={() => setDetailsFor(null)}
            recById={recById}
            onMarkVisited={handleMarkVisited}
          />
        )}
      </BottomSheet>

      {/* Move to another day sheet */}
      <BottomSheet
        open={!!movingEntry}
        onOpenChange={(o) => !o && setMovingEntry(null)}
        title={movingEntry ? `העבר את ${movingEntry.title} ליום...` : ""}
      >
        {movingEntry && (
          <div className="pt-1 pb-4 space-y-1.5" dir="rtl">
            {days.map((d) => {
              const isCurrent = d.id === dayId;
              return (
                <button
                  key={d.id}
                  type="button"
                  disabled={isCurrent || moveEntry.isPending}
                  onClick={() => moveEntry.mutate({ entryId: movingEntry.id, toDayId: d.id })}
                  className={
                    "w-full h-[52px] px-3 rounded-xl border border-border bg-card flex items-center justify-between gap-2 text-right text-sm min-h-0 " +
                    (isCurrent ? "opacity-50 pointer-events-none" : "hover:bg-muted/50 active:bg-muted")
                  }
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="font-semibold shrink-0">יום {d.day_number}</span>
                    <span className="text-muted-foreground text-[12px] shrink-0">·</span>
                    <span className="text-[12px] text-muted-foreground shrink-0">{hebWeekdayShort(d.date)}</span>
                    <span className="text-muted-foreground text-[12px] shrink-0">·</span>
                    <span className="text-[12px] shrink-0">{hebDate(d.date)}</span>
                    {d.city_label && (
                      <>
                        <span className="text-muted-foreground text-[12px] shrink-0">·</span>
                        <span className="text-[12px] text-muted-foreground truncate" dir="ltr">{d.city_label}</span>
                      </>
                    )}
                  </span>
                  {isCurrent && (
                    <span className="text-[11px] text-muted-foreground shrink-0">(היום הנוכחי)</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </BottomSheet>


      {/* Day map sheet */}
      <ExportAISheet
        open={exportOpen}
        onOpenChange={setExportOpen}
        title="🤖 ייצא את היום ל-AI"
        subtitle="קבל ניתוח מקצועי של היום הזה"
        queryKey={["ai-export-day", dayId]}
        generate={() => generateDayAIPrompt(tripId, dayId)}
        chips={(st) => [
          `יום ${day?.day_number ?? ""}`.trim(),
          `${st.entryCount} פעילויות`,
          st.hotelCount ? "מלון ✓" : "ללא מלון",
        ]}
      />

      <DaySnapshotsSheet
        open={snapshotsOpen}
        onOpenChange={setSnapshotsOpen}
        dayId={dayId}
        tripId={tripId}
      />



      {day && (
        <ImportAISheet
          open={importOpen}
          onOpenChange={setImportOpen}
          tripId={tripId}
          mode="day"
          fixedDayNumber={day.day_number}
          days={[{
            id: day.id,
            day_number: day.day_number,
            date: day.date,
            city_label: day.city_label,
          }]}
        />
      )}

      <BottomSheet open={moreOpen} onOpenChange={setMoreOpen} title="פעולות נוספות">
        <div className="flex flex-col gap-2 pb-2">
          {[
            { icon: <span className="text-base">📝</span>, label: "הערה מהירה", onClick: () => setNoteOpen(true) },
            { icon: <span className="text-base">🧭</span>, label: "נווט אל", onClick: () => setNavigateOpen(true) },
            { icon: <Sparkles size={16} />, label: "ייצא ל-AI", onClick: () => setExportOpen(true) },
            { icon: <Download size={16} />, label: "ייבא מ-AI", onClick: () => setImportOpen(true) },
            { icon: <History size={16} />, label: "גרסאות ונקודות שחזור", onClick: () => setSnapshotsOpen(true) },
          ].map((a) => (
            <button
              key={a.label}
              type="button"
              onClick={() => { setMoreOpen(false); a.onClick(); }}
              className="w-full flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-right text-sm text-foreground"
            >
              <span className="text-muted-foreground">{a.icon}</span>
              <span className="flex-1">{a.label}</span>
              <ChevronRight size={16} className="text-muted-foreground rotate-180" />
            </button>
          ))}
        </div>
      </BottomSheet>

      {ratingTarget && (
        <RatingSheet
          recId={ratingTarget.recId}
          recName={ratingTarget.recName}
          initialRating={ratingTarget.initialRating}
          initialReview={ratingTarget.initialReview}
          onClose={() => setRatingTarget(null)}
        />
      )}




      <BottomSheet open={showOptimizePreview} onOpenChange={setShowOptimizePreview} title="סדר מסלול מוצע">
        <div className="text-[12px] text-muted-foreground mb-3">
          חיסכון של ~{optimize.savedMinutes} דקות נסיעה ·{" "}
          <span dir="ltr" className="tabular-nums">{optimize.currentDistKm} ק״מ → {optimize.optimalDistKm} ק״מ</span>
        </div>
        <div className="flex flex-col pb-3">
          {optimize.optimalOrder.map((entry, idx) => {
            const oldPos = entries.findIndex((e) => e.id === entry.id);
            const moved = oldPos !== -1 && oldPos !== idx;
            return (
              <div key={entry.id} className="flex items-center gap-2.5 py-2 border-b border-border/60 last:border-b-0">
                <span className="w-6 h-6 rounded-full bg-accent text-white text-[11px] font-medium flex items-center justify-center shrink-0 tabular-nums">
                  {idx + 1}
                </span>
                {entry.photo_url ? (
                  <img src={entry.photo_url} alt="" onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} onLoad={(e) => { e.currentTarget.style.visibility = "visible"; }} className="w-9 h-9 rounded-lg object-cover shrink-0" />
                ) : (
                  <span className="w-9 h-9 rounded-lg bg-muted/60 flex items-center justify-center text-[16px] shrink-0">
                    {entry.icon_emoji ?? TYPE_ICON[entry.entry_type] ?? "📍"}
                  </span>
                )}
                <span className="flex-1 min-w-0 text-[13px] truncate">{entry.title}</span>
                {moved && (
                  <span className="text-[10px] bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded-full shrink-0">
                    ↕ היה מקום {oldPos + 1}
                  </span>
                )}
              </div>
            );
          })}
        </div>
        <div className="sticky bottom-0 bg-card pt-2 pb-1 flex flex-col gap-2">
          <button
            type="button"
            disabled={applyOptimalOrder.isPending}
            className="w-full h-12 rounded-xl bg-accent text-white text-[14px] font-medium disabled:opacity-50"
            onClick={() => applyOptimalOrder.mutate(optimize.optimalOrder)}
          >
            {applyOptimalOrder.isPending ? "מעדכן…" : "✅ אשר ועדכן סדר"}
          </button>
          <button
            type="button"
            className="w-full h-10 text-[13px] text-muted-foreground"
            onClick={() => setShowOptimizePreview(false)}
          >
            ביטול
          </button>
        </div>
      </BottomSheet>

    </div>
  );
}

/** Compact segment row in the list: air distance + entry into arrival options. */
function SegmentRow({
  a,
  b,
  onOpen,
  onShowOnMap,
}: {
  a: { lat: number; lng: number };
  b: { lat: number; lng: number };
  onOpen: () => void;
  onShowOnMap: () => void;
}) {
  const km = haversine({ lat: a.lat, lon: a.lng }, { lat: b.lat, lon: b.lng });
  const walkMin = walkTimeMin(km);
  return (
    <div className="my-1 flex items-center gap-2 flex-nowrap min-w-0" dir="rtl" style={{ paddingInlineStart: 72 }}>
      <span className="text-[11px] text-muted-foreground truncate shrink">
        מרחק אווירי {fmtDistance(km)} · ~{walkMin} דק׳ הליכה
      </span>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onOpen(); }}
        onPointerDown={(e) => e.stopPropagation()}
        className="shrink-0 min-h-9 px-2.5 rounded-full border border-border bg-card text-[11px] text-muted-foreground inline-flex items-center gap-1"
      >
        פרטי מעבר <ChevronRight size={12} className="rotate-180" />
      </button>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onShowOnMap(); }}
        onPointerDown={(e) => e.stopPropagation()}
        aria-label="הצג מעבר במפה"
        className="shrink-0 w-9 h-9 rounded-full border border-border bg-card text-muted-foreground inline-flex items-center justify-center"
      >
        <MapIcon size={13} />
      </button>
    </div>
  );
}

/**
 * Arrival options for a segment. These are external links only — they do not
 * change the day's order, and they do not change the route line drawn on the map.
 */
function SegmentOptions({
  a,
  b,
  from,
  to,
  isJapan,
  city,
}: {
  a: { lat: number; lng: number };
  b: { lat: number; lng: number };
  from: EntryRow;
  to: EntryRow;
  isJapan?: boolean;
  city?: string;
}) {
  const km = haversine({ lat: a.lat, lon: a.lng }, { lat: b.lat, lon: b.lng });
  const base = `https://www.google.com/maps/dir/?api=1&origin=${a.lat},${a.lng}&destination=${b.lat},${b.lng}`;
  const fromName = placeName(from, city);
  const toName = placeName(to, city);
  const hasNames = fromName && toName;

  const linkCls =
    "min-h-11 rounded-xl border border-border bg-card text-[12px] inline-flex items-center justify-center gap-1.5 px-3";

  return (
    <div className="flex flex-col gap-2.5" dir="rtl">
      <div className="rounded-xl bg-[color:var(--surface-2)] px-3 py-2 text-[12px] text-muted-foreground">
        מרחק אווירי <span dir="ltr" className="tabular-nums">{fmtDistance(km)}</span> · ~{walkTimeMin(km)} דק׳ הליכה משוערות.
        <div className="text-[11px] mt-0.5 opacity-80">זהו מרחק בקו ישר, לא אורך מסלול בפועל.</div>
      </div>

      <div className="text-[11px] text-muted-foreground">פתיחה בשירות חיצוני (לא משנה את סדר היום או את המפה):</div>
      <div className="grid grid-cols-2 gap-2">
        <a href={`${base}&travelmode=walking`} target="_blank" rel="noopener noreferrer" className={linkCls}>
          🚶 הליכה ב-Google Maps <ExternalLink size={11} />
        </a>
        <a href={`${base}&travelmode=transit`} target="_blank" rel="noopener noreferrer" className={linkCls}>
          🚌 תחבורה ציבורית ב-Google Maps <ExternalLink size={11} />
        </a>
      </div>

      <div className="text-[11px] text-muted-foreground pt-1">שירותי תכנון נסיעה:</div>
      <div className="grid grid-cols-2 gap-2">
        <a
          href={hasNames ? rome2rioUrl(fromName, toName) : `https://www.rome2rio.com/map/${a.lat},${a.lng}/${b.lat},${b.lng}`}
          target="_blank"
          rel="noopener noreferrer"
          className={linkCls}
        >
          🗺 Rome2Rio <ExternalLink size={11} />
        </a>
        {isJapan && (
          <a href={navitimeUrl(a, b, fromName, toName)} target="_blank" rel="noopener noreferrer" className={linkCls}>
            🚄 NAVITIME <ExternalLink size={11} />
          </a>
        )}
      </div>
    </div>
  );
}






function SortableEntry({
  entry, nextTime, pinIndex, highlighted, setRef, onOpenDetails, onEdit, sortMode, hintHandle, recById,
}: {
  entry: EntryRow;
  nextTime?: string | null;
  pinIndex: number | null;
  highlighted: boolean;
  setRef: (el: HTMLDivElement | null) => void;
  onOpenDetails: () => void;
  onEdit: () => void;
  sortMode?: boolean;
  hintHandle?: boolean;
  recById?: Record<string, { status: string; rating: number | null }>;
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
  const linkedRec = entry.linked_recommendation_id ? recById?.[entry.linked_recommendation_id] : undefined;
  const isVisited = linkedRec?.status === "visited";

  // Duration until next stop — only when BOTH times exist and result is positive.
  const duration = (() => {
    if (!entry.time_of_day || !nextTime) return null;
    const mins = parseTime(nextTime) - parseTime(entry.time_of_day);
    if (mins <= 0) return null;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `⏱ ${h}h${m > 0 ? ` ${m}m` : ""}` : `⏱ ${m} דקות`;
  })();

  const notesSnippet = entry.description
    ? entry.description.length > 60
      ? entry.description.slice(0, 60) + "..."
      : entry.description
    : null;

  const [pulse, setPulse] = useState(!!hintHandle);
  useEffect(() => {
    if (!hintHandle) return;
    const t = setTimeout(() => setPulse(false), 2000);
    return () => clearTimeout(t);
  }, [hintHandle]);

  return (
    <div ref={(el) => { setNodeRef(el); setRef(el); }} style={style} dir="rtl" className="relative flex items-stretch gap-2">
      {/* Timeline rail (right in RTL) */}
      <div className="w-[72px] shrink-0 relative flex flex-col items-center pt-1">
        {/* Dashed line running through the rail */}
        <div
          className="absolute right-1/2 translate-x-1/2 top-0 bottom-[-16px] w-0 opacity-40"
          style={{ borderRight: "2px dashed var(--border-strong)" }}
          aria-hidden
        />
        <span
          className={`relative w-[44px] text-right text-[11px] tabular-nums bg-background ${entry.time_of_day ? "font-medium text-foreground" : "text-muted-foreground"}`}
          dir="ltr"
        >
          {entry.time_of_day || "—"}
        </span>
        <span
          className="relative mt-1.5 w-2.5 h-2.5 rounded-full"
          style={{ background: hasCoords ? pinColor : "var(--border-strong)", border: "1.5px solid rgba(255,255,255,0.9)" }}
        />
      </div>

      <motion.div
        role="button"
        tabIndex={0}
        onClick={onOpenDetails}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpenDetails(); } }}
        animate={highlighted ? { boxShadow: `0 0 0 2px ${pinColor}` } : { boxShadow: "0 0 0 0px transparent" }}
        transition={{ duration: 0.35 }}
        className="relative flex-1 min-w-0 bg-card rounded-[12px] shadow-sm overflow-hidden cursor-pointer"
        style={{ border: "0.5px solid var(--border)" }}
      >
        {/* Drag handle — the ONLY drag surface (always available; emphasised in sort mode) */}
        <button
          type="button"
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
          aria-label="גרור לשינוי סדר"
          className={
            "absolute left-1 top-1 z-10 w-8 h-8 flex items-center justify-center rounded-md touch-none cursor-grab active:cursor-grabbing hover:bg-muted/60 " +
            (sortMode ? "text-[color:var(--accent)] bg-[color:var(--surface-2)] " : "text-muted-foreground/70 ") +
            (pulse ? "animate-pulse text-[color:var(--accent)]" : "")
          }
        >
          <GripVertical size={16} />
        </button>

        {/* Edit — opens the real edit form */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label={`עריכת ${entry.title}`}
          className="absolute left-1 bottom-1 z-10 min-h-9 px-2 rounded-md text-[11px] text-muted-foreground inline-flex items-center gap-1 hover:bg-muted/60"
        >
          <Pencil size={12} /> עריכה
        </button>


        {/* Variant A: photo header (fixed 80px) */}
        {entry.photo_url && (
          <img
            src={entry.photo_url}
            alt=""
            loading="lazy"
            onError={(e) => { e.currentTarget.style.visibility = "hidden"; }}
            onLoad={(e) => { e.currentTarget.style.visibility = "visible"; }}
            className="w-full h-20 object-cover"
          />
        )}

        <div className="p-3 pl-9">
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="entry-title text-[14px] font-medium leading-tight text-right">{entry.title}</span>
                {entry.photo_url && <span className="text-[14px] shrink-0">{icon}</span>}
                {hasCoords && (
                  <span
                    aria-label="במפה"
                    className="inline-flex items-center justify-center w-[18px] h-[18px] rounded-full text-[10px] font-semibold text-white shrink-0"
                    style={{ background: pinColor }}
                  >
                    {pinIndex}
                  </span>
                )}
                {isVisited && (
                  <>
                    <span
                      className="inline-flex w-2 h-2 rounded-full shrink-0"
                      style={{ background: "#10B981" }}
                      title="ביקרתם כאן"
                    />
                    {typeof linkedRec?.rating === "number" && (
                      <span className="text-[11px] font-medium text-[color:var(--accent)]">★{linkedRec.rating}</span>
                    )}
                  </>
                )}
                {isLinked && !isVisited && (
                  <span title="מסונכרן עם המלצות" className="inline-flex text-[color:var(--accent-3)] shrink-0">
                    <Link2 size={12} aria-label="מסונכרן עם המלצות" />
                  </span>
                )}
              </div>

              {entry.location_name && (
                <div className="entry-subtitle mt-1 text-[11px] text-muted-foreground truncate">
                  <span>📍 </span>
                  <span dir="ltr">{entry.location_name}</span>
                </div>
              )}

              {duration && (
                <div className="mt-1 text-[10px] text-muted-foreground">{duration}</div>
              )}

              {notesSnippet && (
                <div className="text-[10px] text-muted-foreground italic mt-1 truncate">
                  {notesSnippet}
                </div>
              )}
            </div>

            {/* Variant B: 48×48 icon when no photo */}
            {!entry.photo_url && (
              <div
                className="w-12 h-12 rounded-lg flex items-center justify-center text-[22px] shrink-0"
                style={{ background: `color-mix(in oklab, ${tint} 14%, var(--surface-2))` }}
              >
                {icon}
              </div>
            )}
          </div>
        </div>

        {/* Subtle chevron — whole card is tappable */}
        <span className="absolute bottom-1 left-2 text-muted-foreground/60 text-[14px] leading-none" aria-hidden>›</span>
      </motion.div>
    </div>
  );
}


function EntryDetails({
  entry, dayId, onEdit, onUpdateLocation, onMove, onDelete, onClose, recById, onMarkVisited,
}: {
  entry: EntryRow;
  dayId: string;
  onEdit: () => void;
  onUpdateLocation: () => void;
  onMove: () => void;
  onDelete: () => void;
  onClose: () => void;
  recById?: Record<string, { status: string; rating: number | null; city: string | null; notes: string | null; google_rating: number | null; google_maps_url: string | null; photo_url: string | null }>;
  onMarkVisited?: (entry: EntryRow) => void;
}) {

  const qc = useQueryClient();
  const [editingTime, setEditingTime] = useState(false);
  const [timeDraft, setTimeDraft] = useState(entry.time_of_day ?? "");
  useEffect(() => { setTimeDraft(entry.time_of_day ?? ""); setEditingTime(false); }, [entry.id, entry.time_of_day]);
  const [savingTime, setSavingTime] = useState(false);
  async function saveTime() {
    setSavingTime(true);
    try {
      const v = timeDraft.trim() || null;
      const { error } = await supabase.from("day_entries").update({ time_of_day: v }).eq("id", entry.id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["day-entries", dayId] });
      qc.invalidateQueries({ queryKey: ["day-entries-summary"] });
      toast.success("⏰ שעה עודכנה");
      setEditingTime(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setSavingTime(false);
    }
  }
  const tint = TYPE_COLOR[entry.entry_type] ?? "var(--chart-6)";
  const pinColor = TYPE_PIN_COLOR[entry.entry_type] ?? "#6C63FF";
  const icon = entry.icon_emoji || TYPE_ICON[entry.entry_type] || "•";
  const typeLabel = ENTRY_TYPES.find((t) => t.type === entry.entry_type)?.label ?? entry.entry_type;
  const hasCoords = coordsOf(entry) != null;
  const mapHref = hasCoords && entry.latitude != null && entry.longitude != null
    ? mapsSearchUrl(Number(entry.latitude), Number(entry.longitude))
    : entry.google_maps_url;

  const linkedRec = entry.linked_recommendation_id ? recById?.[entry.linked_recommendation_id] : undefined;
  const isVisited = linkedRec?.status === "visited";

  return (
    <div className="pt-1 pb-4 space-y-4" dir="rtl">
      {/* Media */}
      {entry.photo_url ? (
        <img
          src={entry.photo_url}
          alt=""
          onError={(e) => { e.currentTarget.style.visibility = "hidden"; }}
          onLoad={(e) => { e.currentTarget.style.visibility = "visible"; }}
          className="w-full h-44 rounded-xl object-cover"
        />
      ) : (
        <div
          className="w-full h-32 rounded-xl flex items-center justify-center text-5xl"
          style={{ background: `color-mix(in oklab, ${tint} 14%, var(--surface-2))` }}
        >
          {icon}
        </div>
      )}

      {/* Meta row */}
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className="inline-flex items-center gap-1.5 text-[12px] font-medium px-2 py-1 rounded-full text-white"
          style={{ background: pinColor }}
        >
          <span>{icon}</span>
          <span>{typeLabel}</span>
        </span>
        {editingTime ? (
          <span className="inline-flex items-center gap-1">
            <input
              type="time"
              value={timeDraft}
              onChange={(e) => setTimeDraft(e.target.value)}
              dir="ltr"
              autoFocus
              className="text-[12px] font-semibold tabular-nums px-2 py-1 rounded-full bg-muted text-foreground border border-border outline-none"
            />
            <button
              type="button"
              onClick={saveTime}
              disabled={savingTime}
              className="w-7 h-7 rounded-full bg-[color:var(--accent)] text-white flex items-center justify-center disabled:opacity-60"
              aria-label="שמור שעה"
            >
              <Check size={14} />
            </button>
            <button
              type="button"
              onClick={() => { setTimeDraft(entry.time_of_day ?? ""); setEditingTime(false); }}
              className="w-7 h-7 rounded-full bg-muted text-foreground flex items-center justify-center"
              aria-label="בטל"
            >
              <X size={14} />
            </button>
          </span>
        ) : entry.time_of_day ? (
          <button
            type="button"
            onClick={() => setEditingTime(true)}
            className="inline-flex items-center text-[12px] font-semibold tabular-nums px-2 py-1 rounded-full bg-muted text-foreground hover:bg-muted/70"
            dir="ltr"
            aria-label="ערוך שעה"
          >
            {entry.time_of_day}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setEditingTime(true)}
            className="inline-flex items-center text-[12px] text-[color:var(--accent)] hover:underline"
          >
            + הוסף שעה
          </button>
        )}
        {entry.linked_recommendation_id && (
          <span className="inline-flex items-center gap-1 text-[11px] text-[color:var(--accent-3)]">
            <Link2 size={12} /> מסונכרן עם המלצות
          </span>
        )}
      </div>

      {/* Location */}
      {entry.location_name && (
        mapHref ? (
          <a
            href={mapHref}
            target="_blank"
            rel="noreferrer"
            className="flex items-start gap-2 text-[13px] text-foreground hover:text-[color:var(--accent)]"
          >
            <span>📍</span>
            <span className="flex-1 min-w-0" dir="ltr">{entry.location_name}</span>
            <ExternalLink size={14} className="mt-0.5 opacity-60 shrink-0" />
          </a>
        ) : (
          <div className="flex items-start gap-2 text-[13px] text-muted-foreground">
            <span>📍</span>
            <span className="flex-1 min-w-0" dir="ltr">{entry.location_name}</span>
          </div>
        )
      )}

      {/* Description */}
      {entry.description && (
        <div className="text-[14px] leading-relaxed text-foreground whitespace-pre-line break-words">
          {entry.description}
        </div>
      )}

      {/* Linked recommendation info */}
      {linkedRec && (
        <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-1.5">
          <div className="text-[11px] font-medium text-muted-foreground">
            {isVisited ? "✅ ביקרתם כאן" : "⭐ מתוך ההמלצות שלך"}
          </div>
          <div className="flex items-center gap-2 flex-wrap text-[12px]">
            {typeof linkedRec.google_rating === "number" && (
              <span className="font-semibold">★ {linkedRec.google_rating.toFixed(1)}</span>
            )}
            {typeof linkedRec.rating === "number" && (
              <span className="font-semibold text-[color:var(--accent)]">★ {linkedRec.rating} שלך</span>
            )}
            {linkedRec.city && <span className="text-muted-foreground">· {linkedRec.city}</span>}
          </div>
          {linkedRec.notes && (
            <div className="text-[13px] text-foreground whitespace-pre-line">{linkedRec.notes}</div>
          )}
        </div>
      )}

      {!hasCoords && entry.entry_type !== "note" && !entry.location_name && (
        <div className="text-[12px] text-muted-foreground italic">אין מיקום שמור לפריט זה</div>
      )}

      {/* Actions */}
      <div className="pt-2 border-t border-border grid grid-cols-2 gap-2">
        {entry.linked_recommendation_id && onMarkVisited && (
          isVisited ? (
            <button
              type="button"
              onClick={() => onMarkVisited(entry)}
              className="col-span-2 h-12 rounded-xl bg-[color:var(--accent)]/15 text-[color:var(--accent)] font-medium text-[15px] flex items-center justify-center gap-2 mb-1"
            >
              ✅ ביקרנו
              {typeof linkedRec?.rating === "number" && ` · ★${linkedRec.rating}`}
              · עריכת דירוג
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onMarkVisited(entry)}
              className="col-span-2 h-12 rounded-xl bg-[color:var(--accent)] text-white font-semibold text-[15px] flex items-center justify-center gap-2 mb-1"
            >
              📍 היינו כאן!
            </button>
          )
        )}
        <button
          onClick={onEdit}
          className="h-11 rounded-lg border border-border bg-background flex items-center justify-center gap-2 text-sm min-h-0"
        >
          <Pencil size={14} /> ערוך
        </button>
        {mapHref ? (
          <a
            href={mapHref}
            target="_blank"
            rel="noreferrer"
            onClick={onClose}
            className="h-11 rounded-lg border border-border bg-background flex items-center justify-center gap-2 text-sm min-h-0"
          >
            <ExternalLink size={14} /> פתח במפה
          </a>
        ) : entry.entry_type !== "note" ? (
          <button
            onClick={onUpdateLocation}
            className="h-11 rounded-lg border border-border bg-background flex items-center justify-center gap-2 text-sm min-h-0"
          >
            <MapIcon size={14} /> עדכן מיקום
          </button>
        ) : (
          <span />
        )}
        <button
          onClick={onMove}
          className="col-span-2 h-11 rounded-lg border border-border bg-background flex items-center justify-center gap-2 text-sm min-h-0"
        >
          📅 העבר ליום אחר
        </button>
        <button
          onClick={onDelete}
          className="col-span-2 h-11 rounded-lg border border-[color:var(--accent-2)]/40 text-[color:var(--accent-2)] flex items-center justify-center gap-2 text-sm min-h-0"
        >
          <Trash2 size={14} /> מחק
        </button>

      </div>
    </div>
  );
}

function NavigateToForm({
  pending,
  onSubmit,
}: {
  pending: boolean;
  onSubmit: (place: SelectedPlace | null, note: string) => void;
}) {
  const [place, setPlace] = useState<SelectedPlace | null>(null);
  const [note, setNote] = useState("");
  const canSubmit = (!!place || note.trim().length > 0) && !pending;
  return (
    <div className="pt-2 pb-4 space-y-3" dir="rtl">
      <div>
        <label className="block text-[12px] text-muted-foreground mb-1">חיפוש כתובת / מקום בגוגל מפות</label>
        {place ? (
          <div className="flex items-start gap-2 p-2 rounded-lg border border-border bg-muted/40">
            <span className="text-lg">📍</span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate" dir="ltr">{place.name}</div>
              <div className="text-[11px] text-muted-foreground truncate" dir="ltr">{place.address}</div>
            </div>
            <button
              type="button"
              onClick={() => setPlace(null)}
              className="text-[11px] text-muted-foreground underline min-h-0"
            >
              נקה
            </button>
          </div>
        ) : (
          <PlacesSearch onSelect={(p) => setPlace(p)} placeholder="חפש כתובת או מקום..." />
        )}
      </div>

      <div>
        <label className="block text-[12px] text-muted-foreground mb-1">טקסט חופשי (אופציונלי)</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="למשל: לאסוף מזוודות בדרך"
          className="w-full rounded-lg bg-background border border-input px-3 py-2 text-sm outline-none focus:border-[color:var(--accent)]"
        />
      </div>

      <button
        type="button"
        disabled={!canSubmit}
        onClick={() => onSubmit(place, note)}
        className="w-full h-11 rounded-lg bg-[color:var(--accent)] text-white font-semibold text-sm disabled:opacity-50 min-h-0"
      >
        {pending ? "מוסיף..." : "הוסף למסלול"}
      </button>
    </div>
  );
}


function EmptyDay({ onAdd, onPickSaved }: { onAdd: () => void; onPickSaved?: () => void }) {
  return (
    <div className="text-center py-8 space-y-4 flex flex-col items-center" dir="rtl">
      <svg viewBox="0 0 96 96" width="72" height="72" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" className="text-[color:var(--accent)]">
        <path d="M48 22c-9 0-16 7-16 16 0 12 16 26 16 26s16-14 16-26c0-9-7-16-16-16z" />
        <circle cx="48" cy="38" r="5" />
        <path d="M22 74h52" />
      </svg>
      <div className="space-y-1">
        <div className="text-[17px] font-semibold">איך מתחילים את היום?</div>
        <div className="text-[12px] text-muted-foreground max-w-[280px]">מקום אחד שמסקרן אתכם הוא התחלה טובה.</div>
      </div>
      <button
        onClick={onAdd}
        className="w-full max-w-[320px] min-h-12 px-6 rounded-xl bg-[color:var(--accent)] text-white font-medium inline-flex items-center justify-center gap-2"
      >
        <Plus size={18} /> הוספת מקום או פעילות
      </button>
      {onPickSaved && (
        <button
          onClick={onPickSaved}
          className="w-full max-w-[320px] min-h-12 px-4 rounded-xl border border-border bg-card text-[13px] inline-flex items-center justify-between"
        >
          <span className="inline-flex items-center gap-2">בחירה מהמקומות ששמרתם</span>
          <ChevronRight size={16} className="text-muted-foreground" />
        </button>
      )}
      <div className="text-[11px] text-muted-foreground pt-2">🌿 גם יום חופשי הוא חלק מהטיול.</div>
    </div>
  );
}

/** Bottom card for the stop selected on the map. */
function MapStopCard({
  entry,
  pinIndex,
  onClose,
  onEdit,
  onMore,
}: {
  entry: EntryRow;
  pinIndex: number | null;
  onClose: () => void;
  onEdit: () => void;
  onMore: () => void;
}) {
  const coords = coordsOf(entry);
  const icon = entry.icon_emoji || TYPE_ICON[entry.entry_type] || "•";
  return (
    <div
      className="absolute inset-x-0 bottom-0 z-[600] bg-card border-t border-border rounded-t-2xl px-4 pt-3 shadow-lg"
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      dir="rtl"
    >
      <div className="flex items-start gap-3">
        {entry.photo_url ? (
          <img
            src={entry.photo_url}
            alt=""
            onError={(e) => { e.currentTarget.style.display = "none"; }}
            className="w-[76px] h-[64px] rounded-xl object-cover shrink-0"
          />
        ) : (
          <div className="w-[76px] h-[64px] rounded-xl bg-[color:var(--surface-2)] flex items-center justify-center text-[24px] shrink-0">
            {icon}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-semibold truncate">
            {pinIndex != null ? `${pinIndex} · ` : ""}{entry.title}
          </div>
          <div className="text-[12px] text-muted-foreground truncate">
            {[ENTRY_TYPES.find((t) => t.type === entry.entry_type)?.label, entry.time_of_day].filter(Boolean).join(" · ")}
          </div>
          {entry.location_name && (
            <div className="text-[11px] text-muted-foreground truncate" dir="ltr">{entry.location_name}</div>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="סגור כרטיס"
          className="w-9 h-9 -mt-1 rounded-full flex items-center justify-center text-muted-foreground shrink-0"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex items-center gap-2 pt-3">
        <button
          type="button"
          onClick={onEdit}
          className="flex-1 min-h-11 rounded-xl bg-[color:var(--accent)] text-white text-[13px] font-medium inline-flex items-center justify-center gap-1.5"
        >
          <Pencil size={14} /> עריכת התחנה
        </button>
        {coords && (
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${coords.lat},${coords.lng}`}
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-11 px-4 rounded-xl border border-border bg-card text-[13px] inline-flex items-center gap-1.5"
          >
            ניווט <ExternalLink size={12} />
          </a>
        )}
        <button
          type="button"
          onClick={onMore}
          aria-label="פרטי התחנה ופעולות נוספות"
          className="w-11 h-11 rounded-xl border border-border bg-card inline-flex items-center justify-center text-muted-foreground"
        >
          <MoreHorizontal size={16} />
        </button>
      </div>
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
      {entryType === "hotel_checkin" && <HotelEntrySection {...props} />}
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
      if (!assertOnline()) return;
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


function HotelEntrySection(props: {
  dayId: string;
  entryType: EntryType;
  defaultOrder: number;
  existing?: EntryRow;
  onDone: () => void;
}) {
  const { existing, onDone } = props;
  const qc = useQueryClient();
  const { data: hotels = [] } = useHotels();
  const { data: days = [] } = useDays();
  const currentDay = days.find((d) => d.id === props.dayId);
  const currentDate = currentDay?.date ?? null;
  const [mode, setMode] = useState<"pick" | "new" | "editHotel" | "legacy">(() => {
    if (!existing) return "pick";
    if (existing.linked_hotel_id) return "editHotel";
    return "legacy";
  });
  const [pending, setPending] = useState<Hotel | null>(null);
  const [editOverride, setEditOverride] = useState<Hotel | null>(null);
  const [singleForm, setSingleForm] = useState<null | {
    type: "hotel_checkin" | "attraction";
    title: string;
    time: string;
    notes: string;
  }>(null);
  const [savingSingle, setSavingSingle] = useState(false);
  const linkedHotel = existing?.linked_hotel_id
    ? (hotels.find((h) => h.id === existing.linked_hotel_id) as Hotel | undefined)
    : undefined;
  const hotelToEdit = editOverride ?? linkedHotel;

  async function chooseHotel(h: Hotel) {
    const isWithinRange = !!(
      currentDate &&
      h.checkin_date &&
      h.checkout_date &&
      currentDate >= h.checkin_date &&
      currentDate < h.checkout_date
    );
    if (!isWithinRange) {
      setPending(h);
      setSingleForm(null);
      return;
    }
    try {
      await syncHotelToItinerary(h, days as any);
      qc.invalidateQueries({ queryKey: ["day-entries"] });
      qc.invalidateQueries({ queryKey: ["day-entries-summary"] });
      qc.invalidateQueries({ queryKey: ["expenses"] });
      toast.success("המלון סונכרן למסלול");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "שגיאה");
    }
  }

  function openSingleForm(h: Hotel) {
    setSingleForm({
      type: "hotel_checkin",
      title: `לינה: ${h.hotel_name}`,
      time: "20:00",
      notes: "",
    });
  }

  function switchSingleType(t: "hotel_checkin" | "attraction") {
    setSingleForm((prev) => {
      if (!prev || !pending) return prev;
      const wasDefaultTitle =
        prev.title === `לינה: ${pending.hotel_name}` || prev.title === pending.hotel_name;
      const wasDefaultTime = prev.time === "20:00" || prev.time === "09:00";
      return {
        type: t,
        title: wasDefaultTitle
          ? t === "hotel_checkin"
            ? `לינה: ${pending.hotel_name}`
            : pending.hotel_name
          : prev.title,
        time: wasDefaultTime ? (t === "hotel_checkin" ? "20:00" : "09:00") : prev.time,
        notes: prev.notes,
      };
    });
  }

  async function submitSingle() {
    if (!assertOnline()) return;
    if (!pending || !singleForm) return;
    const h = pending;
    const f = singleForm;
    setSavingSingle(true);
    try {
      const { count } = await supabase
        .from("day_entries")
        .select("id", { count: "exact", head: true })
        .eq("day_id", props.dayId);
      const { error } = await supabase.from("day_entries").insert({
        day_id: props.dayId,
        entry_type: f.type,
        title: f.title.trim() || h.hotel_name,
        time_of_day: f.time || null,
        description: f.notes.trim() || null,
        location_name: h.city ?? null,
        latitude: h.latitude != null ? Number(h.latitude) : null,
        longitude: h.longitude != null ? Number(h.longitude) : null,
        google_maps_url: h.google_maps_url ?? null,
        photo_url: h.photo_url ?? null,
        linked_hotel_id: f.type === "hotel_checkin" ? h.id : null,
        icon_emoji: f.type === "hotel_checkin" ? "🏨" : "📍",
        display_order: count ?? 0,
      });
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["day-entries", props.dayId] });
      qc.invalidateQueries({ queryKey: ["day-entries-summary"] });
      toast.success(f.type === "hotel_checkin" ? "✅ לינה נוספה ליום" : "✅ נוסף ליום");
      setSingleForm(null);
      setPending(null);
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setSavingSingle(false);
    }
  }

  async function onHotelSaved(hotelId: string) {
    // Re-fetch and sync into itinerary
    const { data } = await supabase.from("hotels").select("*").eq("id", hotelId).maybeSingle();
    if (data) {
      try {
        await syncHotelToItinerary(data as any, days as any);
        qc.invalidateQueries({ queryKey: ["day-entries"] });
        qc.invalidateQueries({ queryKey: ["day-entries-summary"] });
        qc.invalidateQueries({ queryKey: ["expenses"] });
      } catch {}
    }
    onDone();
  }

  if (mode === "editHotel" && hotelToEdit) {
    return (
      <div>
        <div className="text-xs text-muted-foreground mb-2">עריכה תעדכן גם את המסלול וההוצאות</div>
        <HotelForm existing={hotelToEdit} onDone={onDone} onSaved={onHotelSaved} />
      </div>
    );
  }

  if (mode === "new") {
    return (
      <div>
        <div className="flex items-center justify-between mb-2">
          <button type="button" onClick={() => setMode("pick")} className="text-xs text-muted-foreground">← חזור</button>
          <div className="text-sm font-medium">מלון חדש</div>
        </div>
        <HotelForm onDone={onDone} onSaved={onHotelSaved} />
      </div>
    );
  }

  if (mode === "legacy") {
    return <LodgingForm {...props} />;
  }

  // pick mode
  return (
    <>
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => setMode("new")}
          className="w-full h-12 rounded-xl border-2 border-dashed border-[color:var(--accent)] text-[color:var(--accent)] font-medium"
        >
          ➕ הוסף מלון חדש
        </button>
        {hotels.length > 0 && (
          <div>
            <div className="text-xs text-muted-foreground mb-2">או בחר מלון שמור</div>
            <div className="space-y-2">
              {hotels.map((h: any) => (
                <button
                  key={h.id}
                  type="button"
                  onClick={() => chooseHotel(h as Hotel)}
                  className="w-full text-right rounded-xl border border-border bg-card p-3 hover:bg-muted/40 transition-colors flex items-center gap-3"
                >
                  {h.photo_url ? (
                    <img src={h.photo_url} alt="" onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} onLoad={(e) => { e.currentTarget.style.visibility = "visible"; }} className="w-12 h-12 rounded-lg object-cover shrink-0" />
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center shrink-0">🏨</div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{h.hotel_name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {[h.city, h.checkin_date && h.checkout_date ? `${hebDate(h.checkin_date)} – ${hebDate(h.checkout_date)}` : null].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
        {hotels.length === 0 && (
          <div className="text-xs text-muted-foreground text-center py-2">
            אין מלונות שמורים. הוסף חדש למעלה או שמור מלון בעמוד ההמלצות.
          </div>
        )}
      </div>

      <BottomSheet
        open={!!pending}
        onOpenChange={(o) => {
          if (!o) {
            setPending(null);
            setSingleForm(null);
          }
        }}
        title={
          pending
            ? singleForm
              ? `הוסף ${pending.hotel_name} ליום`
              : `🏨 ${pending.hotel_name}`
            : ""
        }
      >
        {pending && !singleForm && (
          <div>
            <div className="rounded-xl bg-muted/60 p-3 mb-4 text-sm text-muted-foreground space-y-1">
              <div>
                📅 שמור לתאריכים:{" "}
                {pending.checkin_date && pending.checkout_date
                  ? `${hebDate(pending.checkin_date)} – ${hebDate(pending.checkout_date)}`
                  : "לא הוגדרו תאריכים"}
              </div>
              <div>📅 היום במסלול: {currentDate ? hebDate(currentDate) : "—"}</div>
            </div>
            <div className="text-sm mb-3">מה תרצה לעשות?</div>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => openSingleForm(pending)}
                className="h-12 rounded-xl bg-[color:var(--accent)] text-white font-medium"
              >
                📌 רשום לינה ביום זה בלבד
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditOverride(pending);
                  setMode("editHotel");
                  setPending(null);
                  setSingleForm(null);
                }}
                className="h-11 rounded-xl bg-card border border-border"
              >
                ✏️ עדכן את תאריכי המלון
              </button>
              <button
                type="button"
                onClick={() => setPending(null)}
                className="h-10 text-muted-foreground"
              >
                ביטול
              </button>
            </div>
          </div>
        )}
        {pending && singleForm && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submitSingle();
            }}
            className="space-y-4"
          >
            <div>
              <div className="text-xs text-muted-foreground mb-1.5">סוג פעילות</div>
              <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
                <button
                  type="button"
                  onClick={() => switchSingleType("hotel_checkin")}
                  className={`h-10 rounded-lg text-sm font-medium transition-colors ${
                    singleForm.type === "hotel_checkin"
                      ? "bg-[color:var(--accent)] text-white"
                      : "text-foreground"
                  }`}
                >
                  🏨 לינה
                </button>
                <button
                  type="button"
                  onClick={() => switchSingleType("attraction")}
                  className={`h-10 rounded-lg text-sm font-medium transition-colors ${
                    singleForm.type === "attraction"
                      ? "bg-[color:var(--accent)] text-white"
                      : "text-foreground"
                  }`}
                >
                  📍 ניווט למלון
                </button>
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1.5">כותרת</div>
              <input
                value={singleForm.title}
                onChange={(e) =>
                  setSingleForm((p) => (p ? { ...p, title: e.target.value } : p))
                }
                className={inputCls}
              />
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1.5">שעה (אופציונלי)</div>
              <input
                type="time"
                value={singleForm.time}
                onChange={(e) =>
                  setSingleForm((p) => (p ? { ...p, time: e.target.value } : p))
                }
                dir="ltr"
                className={inputCls}
              />
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1.5">הערות (אופציונלי)</div>
              <input
                value={singleForm.notes}
                onChange={(e) =>
                  setSingleForm((p) => (p ? { ...p, notes: e.target.value } : p))
                }
                className={inputCls}
              />
            </div>
            <div className="flex flex-col gap-2 pt-1">
              <button
                type="submit"
                disabled={savingSingle}
                className="h-12 rounded-xl bg-[color:var(--accent)] text-white font-medium disabled:opacity-60"
              >
                {savingSingle ? "שומר..." : "שמור"}
              </button>
              <button
                type="button"
                onClick={() => setSingleForm(null)}
                className="h-10 text-muted-foreground"
              >
                ביטול
              </button>
            </div>
          </form>
        )}
      </BottomSheet>
    </>
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
      if (!assertOnline()) return;
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
      <div><L>תאריך ביטול חינם</L><DateField value={cancel} onChange={setCancel} /></div>
      <div><L>הערות</L><textarea value={notes} onChange={(e) => setNotes(e.target.value)} className={textareaCls} /></div>
      <button type="submit" disabled={mut.isPending} className={btnCls}>{mut.isPending ? "שומר..." : "שמור"}</button>
    </form>
  );
}

function SavedRecsPicker({
  recType, dayId, onAdded,
}: { recType: "attraction" | "food"; dayId: string; onAdded: () => void }) {
  const qc = useQueryClient();
  const tripId = useActiveTripId();
  const { data: recs = [] } = useRecs();
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const pool = useMemo(
    () => (recs as Array<Record<string, unknown>>).filter((r) => r.type === recType),
    [recs, recType],
  );

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return pool;
    return pool.filter((r) => {
      const hay = [r.name, r.city, r.address, r.notes]
        .filter(Boolean).map((x) => String(x).toLowerCase()).join(" ");
      return hay.includes(s);
    });
  }, [pool, q]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function addSelected() {
    if (progress || selected.size === 0) return;
    const byId = new Map(pool.map((r) => [String(r.id), r]));
    const ids = Array.from(selected);
    setProgress({ done: 0, total: ids.length });
    const failedIds: string[] = [];
    let successCount = 0;
    for (let i = 0; i < ids.length; i++) {
      const r = byId.get(ids[i]);
      if (!r) { failedIds.push(ids[i]); continue; }
      try {
        await addRecommendationToDay({
          id: String(r.id),
          type: String(r.type),
          name: String(r.name),
          city: (r.city as string | null) ?? null,
          google_maps_url: (r.google_maps_url as string | null) ?? null,
          latitude: (r.latitude as number | null) ?? null,
          longitude: (r.longitude as number | null) ?? null,
          photo_url: (r.photo_url as string | null) ?? null,
        }, dayId);
        successCount++;
      } catch (e) {
        failedIds.push(ids[i]);
        toast.error(`${String(r.name)}: ${(e as Error).message}`);
      } finally {
        setProgress({ done: i + 1, total: ids.length });
      }
    }
    qc.invalidateQueries({ queryKey: ["day-entries", dayId] });
    qc.invalidateQueries({ queryKey: ["day-entries-summary", tripId] });
    if (successCount > 0) toast.success(`✅ נוספו ${successCount} פעילויות למסלול`);
    setSelected(new Set(failedIds));
    setProgress(null);
    if (failedIds.length === 0) onAdded();
  }

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-2 space-y-2">
      <div className="text-[11px] font-medium text-muted-foreground px-1">
        הוסף פעילויות מההמלצות השמורות
      </div>
      {pool.length === 0 ? (
        <div className="text-[11px] text-muted-foreground px-1 py-1">
          אין המלצות שמורות ב{recType === "food" ? "אוכל" : "אטרקציות"}
        </div>
      ) : (
        <>
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={recType === "food" ? "חפש בהמלצות: סושי, ראמן..." : "חפש בהמלצות: מוזיאון, פארק..."}
            dir="rtl"
            className="w-full rounded-md bg-background border border-input px-2 h-9 text-sm outline-none focus:border-[color:var(--accent)]"
          />
          <div className="max-h-[220px] overflow-y-auto space-y-1">
            {filtered.length === 0 && (
              <div className="text-[11px] text-muted-foreground px-1 py-1">לא נמצאו התאמות</div>
            )}
            {filtered.map((r) => {
              const id = String(r.id);
              const photo = (r.photo_url as string | null) ?? null;
              const rating = typeof r.google_rating === "number" ? (r.google_rating as number) : null;
              const notes = (r.notes as string | null) ?? null;
              const isSelected = selected.has(id);
              return (
                <button
                  key={id}
                  type="button"
                  disabled={!!progress}
                  onClick={() => toggle(id)}
                  className={`w-full text-right flex items-center gap-2 p-1.5 rounded-md border min-h-0 disabled:opacity-60 ${
                    isSelected
                      ? "bg-[color:var(--accent)]/10 border-[color:var(--accent)]"
                      : "bg-background hover:bg-muted border-transparent hover:border-border"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    readOnly
                    tabIndex={-1}
                    className="w-4 h-4 accent-[color:var(--accent)] shrink-0 pointer-events-none"
                  />
                  {photo ? (
                    <img src={photo} alt="" loading="lazy" className="w-9 h-9 rounded-md object-cover shrink-0" />
                  ) : (
                    <div className="w-9 h-9 rounded-md bg-muted shrink-0 flex items-center justify-center text-sm">
                      {recType === "food" ? "🍜" : "⛩"}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate flex items-center gap-1">
                      <span className="text-[10px] px-1 py-px rounded bg-[color:var(--accent-3)]/20 text-[color:var(--accent-3)] shrink-0">⭐ שמור</span>
                      <span className="truncate">{String(r.name)}</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate flex items-center gap-1">
                      {r.city ? <span>{String(r.city)}</span> : null}
                      {rating != null && <span>· ★ {rating.toFixed(1)}</span>}
                    </div>
                    {notes && (
                      <div className="text-[11px] text-muted-foreground/80 line-clamp-2 leading-tight mt-0.5">
                        {notes}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
          <div className="sticky bottom-0 -mx-2 -mb-2 px-2 py-2 bg-muted/80 backdrop-blur border-t border-border flex items-center gap-2">
            <div className="text-[12px] text-muted-foreground flex-1">
              {progress
                ? `מוסיף ${progress.done} מתוך ${progress.total}...`
                : `נבחרו ${selected.size}`}
            </div>
            {selected.size > 0 && !progress && (
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="text-[12px] text-muted-foreground px-2 h-8 rounded-md hover:bg-background min-h-0"
              >
                נקה
              </button>
            )}
            <button
              type="button"
              disabled={selected.size === 0 || !!progress}
              onClick={() => void addSelected()}
              className="text-[13px] font-medium px-3 h-8 rounded-md bg-[color:var(--accent)] text-white disabled:opacity-50 min-h-0"
            >
              ➕ הוסף את כל הנבחרים
            </button>
          </div>
        </>
      )}
    </div>
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
      if (!assertOnline()) return;
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
      {!manualMode && !placeSelected && !existing && (
        <SavedRecsPicker
          recType={recType}
          dayId={dayId}
          onAdded={onDone}
        />
      )}
      {!manualMode && !placeSelected && (
        <>
          <div className="text-[11px] text-muted-foreground px-1">או חפש מקום חדש בגוגל</div>
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
      if (!assertOnline()) return;
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
      if (!assertOnline()) return;
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
