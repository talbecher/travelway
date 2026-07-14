import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ExternalLink, Plus, Navigation, Pencil, Trash2, List, Map as MapIcon, Download } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRecs, useHotels, useDays } from "@/hooks/use-trip";
import { TRIP_ID } from "@/lib/constants";
import { haversine, fmtDistance } from "@/lib/geo";
import { hebDate, ils, daysBetween, todayISO } from "@/lib/format";
import { BottomSheet } from "@/components/BottomSheet";
import { EmptyState } from "@/components/EmptyState";
import { ClientOnly } from "@/components/ClientOnly";
import { MapSkeleton } from "@/components/MapSkeleton";
import { addRecommendationToDay, type RecType } from "@/lib/recommendations";
import { parseLatLngFromMapsUrl } from "@/lib/coords";
import { toast } from "sonner";
import { z } from "zod";
import { PlacesSearch, type SelectedPlace } from "@/components/PlacesSearch";
import { ImportFromMyMapsSheet } from "@/components/ImportFromMyMapsSheet";

const RecsMap = lazy(() => import("@/components/RecsMap"));

type Tab = "all" | "food" | "attractions" | "hotels";
const searchSchema = z.object({ tab: z.enum(["all", "food", "attractions", "hotels"]).optional() });

export const Route = createFileRoute("/recommendations")({
  validateSearch: searchSchema,
  component: Recs,
});

type Rec = {
  id: string; name: string; type: string; city: string | null; address: string | null;
  google_maps_url: string | null; status: string; rating: number | null; review: string | null;
  notes: string | null; latitude: number | string | null; longitude: number | string | null;
  photo_url?: string | null;
  google_rating?: number | string | null;
  google_rating_count?: number | null;
  created_at?: string;
};

const TAB_TYPE: Record<Exclude<Tab, "all" | "hotels">, RecType> = { food: "food", attractions: "attraction" };

function Recs() {
  const search = Route.useSearch();
  const [tab, setTab] = useState<Tab>((search.tab as Tab | undefined) ?? "all");
  const [city, setCity] = useState<string>("all");
  const [view, setView] = useState<"list" | "map">("list");
  const [addOpen, setAddOpen] = useState(false);
  const [editRec, setEditRec] = useState<Rec | null>(null);
  const [mapPickRec, setMapPickRec] = useState<Rec | null>(null);
  const { data: recs = [] } = useRecs();

  useEffect(() => { if (search.tab) setTab(search.tab as Tab); }, [search.tab]);

  const typeFilter = (r: Rec): boolean => {
    if (tab === "all") return r.type === "food" || r.type === "attraction";
    if (tab === "food") return r.type === "food";
    if (tab === "attractions") return r.type === "attraction";
    return r.type === "hotel";
  };

  const cities = useMemo(() => {
    const set = new Set<string>();
    for (const r of recs as Rec[]) {
      if (typeFilter(r) && r.city) set.add(r.city);
    }
    return Array.from(set).sort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recs, tab]);

  useEffect(() => { setCity("all"); }, [tab]);
  useEffect(() => { if (tab === "hotels") setView("list"); }, [tab]);

  const mapPins = useMemo(() => {
    return (recs as Rec[])
      .filter(typeFilter)
      .filter((r) => city === "all" || r.city === city)
      .filter((r) => r.latitude != null && r.longitude != null)
      .map((r) => ({
        id: r.id,
        lat: Number(r.latitude),
        lng: Number(r.longitude),
        type: r.type,
        name: r.name,
        city: r.city,
        address: r.address,
        status: r.status,
        rating: r.rating,
        google_maps_url: r.google_maps_url,
      }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recs, tab, city]);


  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    if (view !== "map" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (p) => setUserPos({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => {},
      { timeout: 5000, maximumAge: 60_000 },
    );
  }, [view]);

  const defaultFormType: RecType = tab === "food" ? "food" : tab === "hotels" ? "hotel" : "attraction";
  const listType: "food" | "attraction" | "all" =
    tab === "food" ? "food" : tab === "attractions" ? "attraction" : "all";

  return (
    <div className="pt-2 space-y-4 pb-4">
      <div className="flex items-center justify-between gap-2">
        <h1>המלצות</h1>
        {tab !== "hotels" && (
          <div className="flex gap-1 bg-muted rounded-lg p-1">
            <button onClick={() => setView("list")} aria-label="תצוגת רשימה"
              className={`w-9 h-9 rounded-md flex items-center justify-center min-h-0 ${view === "list" ? "bg-card" : "text-muted-foreground"}`}>
              <List size={16} />
            </button>
            <button onClick={() => setView("map")} aria-label="תצוגת מפה"
              className={`w-9 h-9 rounded-md flex items-center justify-center min-h-0 ${view === "map" ? "bg-card" : "text-muted-foreground"}`}>
              <MapIcon size={16} />
            </button>
          </div>
        )}
      </div>

      <div className="flex gap-1 bg-muted rounded-lg p-1">
        <TabBtn active={tab === "all"} onClick={() => setTab("all")}>הכל</TabBtn>
        <TabBtn active={tab === "food"} onClick={() => setTab("food")}>🍜 אוכל</TabBtn>
        <TabBtn active={tab === "attractions"} onClick={() => setTab("attractions")}>⛩ אטרקציות</TabBtn>
        <TabBtn active={tab === "hotels"} onClick={() => setTab("hotels")}>🏨 לינה</TabBtn>
      </div>

      {tab !== "hotels" && cities.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4">
          <Pill active={city === "all"} onClick={() => setCity("all")}>הכל</Pill>
          {cities.map((c) => (
            <Pill key={c} active={city === c} onClick={() => setCity(c)}>{c}</Pill>
          ))}
        </div>
      )}

      {tab === "hotels" ? (
        <HotelsList onEdit={setEditRec} />
      ) : view === "map" ? (
        <div className="-mx-4 rounded-none overflow-hidden" style={{ height: "calc(100vh - 180px)" }}>
          <ClientOnly fallback={<MapSkeleton />}>
            <Suspense fallback={<MapSkeleton />}>
              <RecsMap
                pins={mapPins}
                userPos={userPos}
                onAddToDay={(id: string) => {
                  const found = (recs as Rec[]).find((r) => r.id === id);
                  if (found) setMapPickRec(found);
                }}
              />
            </Suspense>
          </ClientOnly>
        </div>
      ) : (
        <PlacesList type={listType} cityFilter={city} onEdit={setEditRec} />
      )}

      <button onClick={() => setAddOpen(true)} aria-label="הוסף המלצה"
        className="fixed bottom-[84px] right-4 z-40 w-14 h-14 rounded-full bg-[color:var(--accent)] text-white flex items-center justify-center shadow-lg">
        <Plus size={26} strokeWidth={1.8} />
      </button>

      <BottomSheet open={addOpen} onOpenChange={setAddOpen} title="הוסף המלצה">
        <RecForm defaultType={defaultFormType} onDone={() => setAddOpen(false)} />
      </BottomSheet>

      <BottomSheet open={!!editRec} onOpenChange={(o) => !o && setEditRec(null)} title="ערוך המלצה">
        {editRec && <RecForm defaultType={editRec.type as RecType} existing={editRec} onDone={() => setEditRec(null)} />}
      </BottomSheet>

      <BottomSheet open={!!mapPickRec} onOpenChange={(o) => !o && setMapPickRec(null)} title={mapPickRec?.name}>
        {mapPickRec && <MapPickCard rec={mapPickRec} onDone={() => setMapPickRec(null)} />}
      </BottomSheet>
    </div>
  );
}

function MapPickCard({ rec, onDone }: { rec: Rec; onDone: () => void }) {
  const qc = useQueryClient();
  const { data: days = [] } = useDays();
  const [dayPickerOpen, setDayPickerOpen] = useState(false);
  const typeChipColor = rec.type === "food" ? "var(--accent-2)" : rec.type === "hotel" ? "var(--accent-3)" : "var(--accent)";
  const typeLabel = rec.type === "food" ? "אוכל" : rec.type === "hotel" ? "לינה" : "אטרקציה";
  const addToDay = useMutation({
    mutationFn: async (dayId: string) => addRecommendationToDay(rec, dayId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["day-entries-summary"] });
      qc.invalidateQueries({ queryKey: ["day-entries"] });
      toast.success("נוסף ליום");
      setDayPickerOpen(false);
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="pt-1 pb-2 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-[10px] px-2 py-0.5 rounded-full"
          style={{ background: `color-mix(in oklab, ${typeChipColor} 20%, transparent)`, color: typeChipColor }}>{typeLabel}</span>
        {rec.city && <span className="text-xs text-muted-foreground" dir="ltr">{rec.city}{rec.address ? ` · ${rec.address}` : ""}</span>}
      </div>
      {rec.notes && <div className="text-sm text-muted-foreground whitespace-pre-line">{rec.notes}</div>}
      <div className="flex gap-2">
        {rec.google_maps_url && (
          <a href={rec.google_maps_url} target="_blank" rel="noreferrer"
            className="flex-1 h-10 rounded-md border border-border flex items-center justify-center gap-1 text-sm">
            <Navigation size={14} /> ניווט
          </a>
        )}
        <button onClick={() => setDayPickerOpen(true)}
          className="flex-1 h-10 rounded-md bg-[color:var(--accent)] text-white text-sm min-h-0">
          + הוסף ליום
        </button>
      </div>
      <BottomSheet open={dayPickerOpen} onOpenChange={setDayPickerOpen} title={`הוסף את ${rec.name} ליום`}>
        <div className="space-y-1 pt-2 max-h-[60vh] overflow-y-auto">
          {days.length === 0 && <div className="text-sm text-muted-foreground py-4 text-center">אין ימים במסלול</div>}
          {days.map((d) => (
            <button key={d.id} onClick={() => addToDay.mutate(d.id)}
              className="w-full text-right flex justify-between items-center bg-background border border-border rounded-lg px-3 py-2 min-h-0">
              <span className="text-sm">יום {d.day_number} · {hebDate(d.date)}</span>
              <span className="text-xs text-muted-foreground" dir="ltr">{d.city_label}</span>
            </button>
          ))}
        </div>
      </BottomSheet>
    </div>
  );
}

function TabBtn({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`flex-1 h-10 rounded-md text-sm min-h-0 ${active ? "bg-card text-foreground" : "text-muted-foreground"}`}>
      {children}
    </button>
  );
}

function Pill({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs whitespace-nowrap border min-h-0 h-auto ${active ? "bg-[color:var(--accent)] text-white border-[color:var(--accent)]" : "border-border text-muted-foreground"}`}>
      {children}
    </button>
  );
}

function PlacesList({ type, cityFilter, onEdit }: { type: "food" | "attraction" | "all"; cityFilter: string; onEdit: (r: Rec) => void }) {
  const { data: recs = [], isLoading } = useRecs();
  const [pos, setPos] = useState<{ lat: number; lon: number } | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (p) => setPos({ lat: p.coords.latitude, lon: p.coords.longitude }),
      () => {},
      { timeout: 5000, maximumAge: 60_000 },
    );
  }, []);

  const list = useMemo(() => {
    let items = (recs as Rec[]).filter((r) =>
      type === "all" ? (r.type === "food" || r.type === "attraction") : r.type === type,
    );
    if (cityFilter !== "all") items = items.filter((r) => r.city === cityFilter);
    if (type === "all") {
      items = [...items].sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
    } else if (pos) {
      items = [...items].sort((a, b) => {
        const da = a.latitude && a.longitude ? haversine(pos, { lat: Number(a.latitude), lon: Number(a.longitude) }) : Infinity;
        const db = b.latitude && b.longitude ? haversine(pos, { lat: Number(b.latitude), lon: Number(b.longitude) }) : Infinity;
        if (da !== db) return da - db;
        return a.name.localeCompare(b.name);
      });
    } else {
      items = [...items].sort((a, b) => a.name.localeCompare(b.name));
    }
    return items;
  }, [recs, type, cityFilter, pos]);

  if (isLoading) return <ListSkeleton />;
  if (list.length === 0) {
    const title = type === "food" ? "אין המלצות אוכל עדיין"
      : type === "attraction" ? "אין אטרקציות עדיין"
      : "אין המלצות עדיין";
    return <EmptyState variant="recs" title={title} hint="הוסף המלצה עם הכפתור בפינה" />;
  }

  return (
    <div className="space-y-2">
      {list.map((r) => (
        <PlaceCard
          key={r.id}
          rec={r}
          onEdit={() => onEdit(r)}
          showTypeBadge={type === "all"}
          distance={type !== "all" && pos && r.latitude && r.longitude ? haversine(pos, { lat: Number(r.latitude), lon: Number(r.longitude) }) : null}
        />
      ))}
    </div>
  );
}

function PlaceCard({ rec, distance, onEdit, showTypeBadge = false }: { rec: Rec; distance: number | null; onEdit: () => void; showTypeBadge?: boolean }) {
  const qc = useQueryClient();
  const { data: days = [] } = useDays();
  const [dayPickerOpen, setDayPickerOpen] = useState(false);

  const setStatus = useMutation({
    mutationFn: async (status: "wishlist" | "visited" | "skipped") => {
      const { error } = await supabase.from("recommendations").update({ status }).eq("id", rec.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["recs"] }),
  });

  const del = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("recommendations").delete().eq("id", rec.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["recs"] }); toast.success("נמחק"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const addToDay = useMutation({
    mutationFn: async (dayId: string) => addRecommendationToDay(rec, dayId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["day-entries-summary"] });
      qc.invalidateQueries({ queryKey: ["day-entries"] });
      toast.success("נוסף ליום");
      setDayPickerOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const typeChipColor = rec.type === "food" ? "var(--accent-2)" : rec.type === "hotel" ? "var(--accent-3)" : "var(--accent)";
  const typeLabel = rec.type === "food" ? "אוכל" : rec.type === "hotel" ? "לינה" : "אטרקציה";
  const typeEmoji = rec.type === "food" ? "🍜" : rec.type === "hotel" ? "🏨" : "⛩";
  const typeBg = rec.type === "food" ? "#FF6B6B22" : rec.type === "hotel" ? "#FFD93D22" : "#6C63FF22";

  const statusBadge = {
    wishlist: { label: "רשימה", cls: "bg-muted text-muted-foreground" },
    visited: { label: "ביקרנו", cls: "text-[color:var(--accent-3)]", style: { background: "color-mix(in oklab, var(--accent-3) 18%, transparent)" } },
    skipped: { label: "דילגנו", cls: "bg-muted text-muted-foreground line-through" },
  }[rec.status as "wishlist" | "visited" | "skipped"];

  const stop = (e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); };
  const googleRating = rec.google_rating != null ? Number(rec.google_rating) : null;

  const cardInner = (
    <div className="bg-card border border-border rounded-2xl p-3 relative">
      {showTypeBadge && (
        <span
          className="absolute top-2 right-2 z-[1] text-[11px] px-2 py-0.5 rounded-full font-medium"
          style={{ background: typeBg, color: typeChipColor }}
        >
          {typeEmoji} {typeLabel}
        </span>
      )}
      <div className="absolute top-2 left-2 z-[1] flex flex-col gap-1">
        <button onClick={(e) => { stop(e); onEdit(); }} aria-label="ערוך"
          className="w-7 h-7 rounded-full border border-border bg-card flex items-center justify-center text-muted-foreground min-h-0">
          <Pencil size={12} />
        </button>
        <button onClick={(e) => { stop(e); if (confirm(`למחוק את ${rec.name}?`)) del.mutate(); }} aria-label="מחק"
          className="w-7 h-7 rounded-full border border-border bg-card flex items-center justify-center text-[color:var(--accent-2)] min-h-0">
          <Trash2 size={12} />
        </button>
      </div>
      <div className="flex items-start gap-2 pl-10 pr-2">
        {rec.photo_url && (
          <img
            src={rec.photo_url}
            alt=""
            loading="lazy"
            className="w-[60px] h-[60px] rounded-lg object-cover shrink-0"
          />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {!showTypeBadge && (
              <span
                className="text-[10px] px-2 py-0.5 rounded-full"
                style={{ background: `color-mix(in oklab, ${typeChipColor} 20%, transparent)`, color: typeChipColor }}
              >{typeLabel}</span>
            )}
            <motion.span
              key={rec.status}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              style={"style" in statusBadge ? statusBadge.style : undefined}
              className={`text-[10px] px-2 py-0.5 rounded-full ${statusBadge.cls}`}
            >{statusBadge.label}</motion.span>
          </div>
          <div className="font-medium mt-1" dir="ltr">{rec.name}</div>
          <div className="text-xs text-muted-foreground" dir="ltr">
            {rec.city}{rec.address ? ` · ${rec.address}` : ""}
          </div>
          {googleRating != null && (
            <div className="text-[11px] text-muted-foreground mt-0.5" dir="ltr">
              ★ {googleRating.toFixed(1)} גוגל
            </div>
          )}
          {distance != null && Number.isFinite(distance) && (
            <div className="text-xs text-muted-foreground mt-0.5">{fmtDistance(distance)}</div>
          )}
          {rec.status === "visited" && rec.rating && (
            <div className="text-xs mt-1 text-[color:var(--accent-2)]">{"★".repeat(rec.rating)}{"☆".repeat(5 - rec.rating)}</div>
          )}
          {rec.status === "visited" && rec.review && (
            <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{rec.review}</div>
          )}
        </div>
      </div>
      <div className="flex gap-2 mt-3">
        {rec.google_maps_url && (
          <a href={rec.google_maps_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
            className="flex-1 h-9 rounded-md border border-border flex items-center justify-center gap-1 text-xs">
            <Navigation size={12} /> ניווט
          </a>
        )}
        <button onClick={(e) => { stop(e); setDayPickerOpen(true); }}
          className="flex-1 h-9 rounded-md bg-[color:var(--accent)] text-white text-xs min-h-0">
          + הוסף ליום
        </button>
      </div>
      <div className="flex gap-3 mt-2 text-xs flex-wrap">
        {rec.status !== "visited" && <button onClick={(e) => { stop(e); setStatus.mutate("visited"); }} className="text-muted-foreground min-h-0 h-auto p-0">סמן שביקרנו</button>}
        {rec.status !== "skipped" && <button onClick={(e) => { stop(e); setStatus.mutate("skipped"); }} className="text-muted-foreground min-h-0 h-auto p-0">דילגנו</button>}
        {rec.status !== "wishlist" && <button onClick={(e) => { stop(e); setStatus.mutate("wishlist"); }} className="text-muted-foreground min-h-0 h-auto p-0">חזרה לרשימה</button>}
      </div>
    </div>
  );


  return (
    <>
      {rec.google_maps_url ? (
        <a
          href={rec.google_maps_url}
          target="_blank"
          rel="noreferrer"
          style={{ display: "block", textDecoration: "none", color: "inherit" }}
        >
          {cardInner}
        </a>
      ) : (
        cardInner
      )}

      <BottomSheet open={dayPickerOpen} onOpenChange={setDayPickerOpen} title={`הוסף את ${rec.name} ליום`}>
        <div className="space-y-1 pt-2 max-h-[60vh] overflow-y-auto">
          {days.length === 0 && <div className="text-sm text-muted-foreground py-4 text-center">אין ימים במסלול</div>}
          {days.map((d) => (
            <button key={d.id} onClick={() => addToDay.mutate(d.id)}
              className="w-full text-right flex justify-between items-center bg-background border border-border rounded-lg px-3 py-2 min-h-0">
              <span className="text-sm">יום {d.day_number} · {hebDate(d.date)}</span>
              <span className="text-xs text-muted-foreground" dir="ltr">{d.city_label}</span>
            </button>
          ))}
        </div>
      </BottomSheet>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────
// Add / Edit form (food / attraction / hotel base fields)
// ─────────────────────────────────────────────────────────────────

function RecForm({ defaultType, existing, onDone }: { defaultType: RecType; existing?: Rec; onDone: () => void }) {
  const qc = useQueryClient();
  const [type, setType] = useState<RecType>((existing?.type as RecType) ?? defaultType);
  const [name, setName] = useState(existing?.name ?? "");
  const [city, setCity] = useState(existing?.city ?? "");
  const [address, setAddress] = useState(existing?.address ?? "");
  const [url, setUrl] = useState(existing?.google_maps_url ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [photoUrl, setPhotoUrl] = useState<string | null>(existing?.photo_url ?? null);
  const [googleRating, setGoogleRating] = useState<number | null>(
    existing?.google_rating != null ? Number(existing.google_rating) : null,
  );
  const [googleRatingCount, setGoogleRatingCount] = useState<number | null>(
    existing?.google_rating_count ?? null,
  );
  const [selectedCoords, setSelectedCoords] = useState<{ lat: number; lng: number } | null>(
    existing?.latitude != null && existing?.longitude != null
      ? { lat: Number(existing.latitude), lng: Number(existing.longitude) }
      : null,
  );
  const [placeSelected, setPlaceSelected] = useState<{ name: string; address: string } | null>(
    existing ? { name: existing.name, address: existing.address ?? "" } : null,
  );
  const [manualMode, setManualMode] = useState(!!existing);

  function handlePlace(p: SelectedPlace) {
    setName(p.name);
    setAddress(p.address);
    setUrl(p.google_maps_url);
    setSelectedCoords({ lat: p.latitude, lng: p.longitude });
    setPhotoUrl(p.photo_url);
    if (p.city) setCity(p.city);
    setGoogleRating(p.rating);
    setGoogleRatingCount(p.userRatingCount);
    setPlaceSelected({ name: p.name, address: p.address });
  }

  function clearPlace() {
    setPlaceSelected(null);
    setName("");
    setAddress("");
    setUrl("");
    setSelectedCoords(null);
    setPhotoUrl(null);
    setGoogleRating(null);
    setGoogleRatingCount(null);
  }

  const save = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("שם חסר");
      if (!city.trim()) throw new Error("עיר חסרה");
      const coords = selectedCoords ?? parseLatLngFromMapsUrl(url);
      const payload = {
        type, name: name.trim(), city: city.trim(),
        address: address.trim() || null,
        google_maps_url: url.trim() || null,
        notes: notes.trim() || null,
        latitude: coords?.lat ?? null,
        longitude: coords?.lng ?? null,
        photo_url: photoUrl,
        google_rating: googleRating,
        google_rating_count: googleRatingCount,
      };
      if (existing) {
        const { error } = await supabase.from("recommendations").update(payload).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("recommendations").insert({ trip_id: TRIP_ID, ...payload });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recs"] });
      toast.success(existing ? "נשמר" : "נוסף");
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const seg = (t: RecType, label: string, emoji: string, tint: string) => (
    <button type="button" onClick={() => setType(t)}
      className={`flex-1 h-11 rounded-md text-sm flex items-center justify-center gap-1 min-h-0 ${type === t ? "text-white" : "text-muted-foreground bg-transparent"}`}
      style={type === t ? { background: tint } : undefined}>
      <span>{emoji}</span>{label}
    </button>
  );

  return (
    <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-3 pt-2 pb-2">
      <div className="flex gap-1 bg-muted rounded-lg p-1">
        {seg("food", "אוכל", "🍜", "var(--accent-2)")}
        {seg("attraction", "אטרקציה", "⛩", "var(--accent)")}
        {seg("hotel", "לינה", "🏨", "var(--accent-3)")}
      </div>

      {!manualMode && !placeSelected && (
        <>
          <PlacesSearch onSelect={handlePlace} />
          <button
            type="button"
            onClick={() => setManualMode(true)}
            className="text-xs text-muted-foreground underline min-h-0 h-auto p-0"
          >
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
          </div>
          <button type="button" onClick={clearPlace}
            className="text-[color:var(--accent)] underline min-h-0 h-auto p-0 shrink-0">שנה</button>
        </div>
      )}

      {(manualMode || placeSelected) && (
        <>
          <Field label="שם"><input required value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-lg bg-background border border-input px-3 h-11" /></Field>
          <Field label="עיר"><input required value={city} onChange={(e) => setCity(e.target.value)} dir="ltr" className="w-full rounded-lg bg-background border border-input px-3 h-11" /></Field>
          <Field label="אזור / שכונה"><input value={address} onChange={(e) => setAddress(e.target.value)} dir="ltr" className="w-full rounded-lg bg-background border border-input px-3 h-11" /></Field>
          {manualMode && !placeSelected && (
            <Field label="לינק גוגל מפות">
              <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." dir="ltr" className="w-full rounded-lg bg-background border border-input px-3 h-11" />
              {url.trim() && (
                parseLatLngFromMapsUrl(url)
                  ? <div className="text-[11px] text-[color:var(--accent-3)] mt-1">✅ מיקום זוהה</div>
                  : <div className="text-[11px] text-[color:var(--accent-2)] mt-1">⚠️ לא זוהה מיקום — לא יופיע במפה</div>
              )}
            </Field>
          )}
          <Field label="הערות"><textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full rounded-lg bg-background border border-input px-3 py-2 min-h-[70px]" /></Field>

          {type === "hotel" && !existing && (
            <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-2">
              פרטי שהות (תאריכים, מחיר, ביטול) יוגדרו בכרטיס המלון לאחר השמירה.
            </div>
          )}

          <button type="submit" disabled={save.isPending}
            className="w-full h-12 rounded-xl bg-[color:var(--accent)] text-white font-medium disabled:opacity-50">
            {save.isPending ? "שומר..." : "שמור"}
          </button>
        </>
      )}
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="text-xs text-muted-foreground">{label}</label><div className="mt-1">{children}</div></div>;
}

// ─────────────────────────────────────────────────────────────────
// Hotels tab
// ─────────────────────────────────────────────────────────────────

type Hotel = {
  id: string; hotel_name: string; type: string; city: string | null;
  checkin_date: string | null; checkout_date: string | null;
  total_cost_ils: number | string | null; price_per_night_ils: number | string | null;
  booking_platform: string | null; confirmation_url: string | null;
  cancellation_deadline: string | null; post_stay_rating: number | null; post_stay_review: string | null;
  notes: string | null;
  address?: string | null;
  google_maps_url?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  photo_url?: string | null;
};

function HotelsList({ onEdit: _onEdit }: { onEdit: (r: Rec) => void }) {
  const { data: hotels = [], isLoading } = useHotels();
  const [editHotel, setEditHotel] = useState<Hotel | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  if (isLoading) return <ListSkeleton />;

  return (
    <>
      {hotels.length === 0 ? (
        <EmptyState variant="hotels" title="אין מלונות עדיין" hint="הוסף מלון עם הכפתור בפינה או דרך כפתור זה" cta={
          <button onClick={() => setAddOpen(true)} className="h-11 px-5 rounded-xl bg-[color:var(--accent-3)] text-white text-sm font-medium">
            + הוסף מלון
          </button>
        } />
      ) : (
        <div className="space-y-2">
          {(hotels as Hotel[]).map((h) => <HotelCard key={h.id} h={h} onEdit={() => setEditHotel(h)} />)}
        </div>
      )}

      <BottomSheet open={addOpen} onOpenChange={setAddOpen} title="הוסף מלון">
        <HotelForm onDone={() => setAddOpen(false)} />
      </BottomSheet>
      <BottomSheet open={!!editHotel} onOpenChange={(o) => !o && setEditHotel(null)} title="ערוך מלון">
        {editHotel && <HotelForm existing={editHotel} onDone={() => setEditHotel(null)} />}
      </BottomSheet>
    </>
  );
}

function HotelCard({ h, onEdit }: { h: Hotel; onEdit: () => void }) {
  const qc = useQueryClient();
  const { data: days = [] } = useDays();
  const today = todayISO();
  const nights = h.checkin_date && h.checkout_date ? Math.max(1, daysBetween(h.checkin_date, h.checkout_date)) : 0;
  const totalCalc = nights > 0 && h.price_per_night_ils
    ? Number(h.price_per_night_ils) * nights
    : Number(h.total_cost_ils ?? 0);

  const dd = h.cancellation_deadline ? daysBetween(today, h.cancellation_deadline) : null;
  let statusLabel = "", statusCls = "text-muted-foreground", urgent = false;
  if (dd !== null) {
    if (dd < 0) { statusLabel = "עבר"; statusCls = "text-muted-foreground"; }
    else if (dd <= 3) { statusLabel = "🔴 דחוף"; statusCls = "text-[color:var(--accent-2)]"; urgent = true; }
    else if (dd <= 7) { statusLabel = "🟡 שים לב"; statusCls = "text-yellow-500"; }
    else { statusLabel = "🟢 בטוח"; statusCls = "text-[color:var(--accent-3)]"; }
  }
  const postStay = h.checkout_date && h.checkout_date < today;

  const matchingDays = h.checkin_date && h.checkout_date
    ? days.filter((d) => d.date >= h.checkin_date! && d.date < h.checkout_date!)
    : [];

  const del = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("hotels").delete().eq("id", h.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["hotels"] }); toast.success("נמחק"); },
  });

  const addToItinerary = useMutation({
    mutationFn: async () => {
      if (matchingDays.length === 0) throw new Error("התאריכים של המלון לא חופפים למסלול");
      const priceN = Number(h.price_per_night_ils) || (nights > 0 ? Number(h.total_cost_ils ?? 0) / nights : 0);
      const lat = h.latitude != null ? Number(h.latitude) : null;
      const lng = h.longitude != null ? Number(h.longitude) : null;

      let addedEntries = 0, addedExpenses = 0;

      for (const d of matchingDays) {
        // day_entries: skip if this hotel is already on the day
        const { data: existingEntries } = await supabase
          .from("day_entries")
          .select("id")
          .eq("day_id", d.id)
          .eq("entry_type", "hotel_checkin")
          .eq("title", h.hotel_name)
          .limit(1);
        if (!existingEntries || existingEntries.length === 0) {
          const { count } = await supabase
            .from("day_entries")
            .select("id", { count: "exact", head: true })
            .eq("day_id", d.id);
          const { error } = await supabase.from("day_entries").insert({
            day_id: d.id,
            entry_type: "hotel_checkin",
            title: h.hotel_name,
            location_name: h.city,
            google_maps_url: h.google_maps_url ?? null,
            icon_emoji: "🏨",
            display_order: count ?? 0,
            latitude: lat,
            longitude: lng,
            photo_url: h.photo_url ?? null,
          });
          if (error) throw error;
          addedEntries++;
        }

        // expenses: skip if already charged
        if (priceN > 0) {
          const { data: existingExp } = await supabase
            .from("expenses")
            .select("id")
            .eq("trip_id", TRIP_ID)
            .eq("category", "accommodation")
            .eq("description", h.hotel_name)
            .eq("expense_date", d.date)
            .limit(1);
          if (!existingExp || existingExp.length === 0) {
            const { error } = await supabase.from("expenses").insert({
              trip_id: TRIP_ID,
              category: "accommodation",
              amount_ils: priceN,
              description: h.hotel_name,
              location_name: h.city,
              expense_date: d.date,
            });
            if (error) throw error;
            addedExpenses++;
          }
        }
      }

      return { addedEntries, addedExpenses, nights: matchingDays.length, total: priceN * matchingDays.length };
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["day-entries-summary"] });
      qc.invalidateQueries({ queryKey: ["expenses"] });
      // invalidate any per-day entry query
      qc.invalidateQueries({ queryKey: ["day-entries"] });
      if (r.addedEntries === 0 && r.addedExpenses === 0) {
        toast.message("המלון כבר במסלול");
      } else {
        toast.success(`נוסף למסלול · ${r.nights} לילות · ${ils(r.total)}`);
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canAddToItinerary = !!(h.checkin_date && h.checkout_date) && matchingDays.length > 0;

  return (
    <div className={`bg-card border rounded-2xl p-3 ${urgent ? "border-[color:var(--accent-2)]" : "border-border"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium">{h.hotel_name}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
              {h.type === "ryokan" ? "ריוקאן" : "מלון"}
            </span>
          </div>
          {h.city && <div className="text-xs text-muted-foreground" dir="ltr">{h.city}</div>}
        </div>
        <div className="flex items-start gap-1">
          {statusLabel && (
            <motion.span
              animate={urgent ? { opacity: [1, 0.6, 1] } : {}}
              transition={urgent ? { duration: 1.5, repeat: Infinity } : {}}
              className={`text-xs ${statusCls}`}
            >{statusLabel}</motion.span>
          )}
        </div>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
        <div><span className="text-muted-foreground">Check-in </span><span dir="ltr">{h.checkin_date && hebDate(h.checkin_date)}</span></div>
        <div><span className="text-muted-foreground">Check-out </span><span dir="ltr">{h.checkout_date && hebDate(h.checkout_date)}</span></div>
        <div><span className="text-muted-foreground">לילות </span>{nights}</div>
        <div><span className="text-muted-foreground">סה״כ </span>{ils(totalCalc)}</div>
      </div>
      {h.cancellation_deadline && (
        <div className="text-xs text-muted-foreground mt-1">ביטול חינם עד {hebDate(h.cancellation_deadline)}</div>
      )}
      {h.confirmation_url && (
        <a href={h.confirmation_url} target="_blank" rel="noreferrer" className="text-xs text-[color:var(--accent)] inline-flex items-center gap-1 mt-1">
          <ExternalLink size={10} /> אישור הזמנה
        </a>
      )}
      <div className="mt-2">
        <button
          onClick={() => addToItinerary.mutate()}
          disabled={!canAddToItinerary || addToItinerary.isPending}
          className="w-full h-9 rounded-lg bg-[color:var(--accent-3)] text-white text-xs font-medium disabled:opacity-40 inline-flex items-center justify-center gap-1"
          title={!h.checkin_date || !h.checkout_date ? "חסרים תאריכים" : matchingDays.length === 0 ? "התאריכים לא חופפים למסלול" : ""}
        >
          {addToItinerary.isPending ? "מוסיף..." : `➕ הוסף למסלול${matchingDays.length ? ` (${matchingDays.length} לילות)` : ""}`}
        </button>
      </div>
      <div className="flex gap-2 mt-2 pt-2 border-t border-border/60">
        <button onClick={onEdit} className="flex-1 h-8 rounded-md border border-border text-xs inline-flex items-center justify-center gap-1 min-h-0">
          <Pencil size={11} /> ערוך
        </button>
        <button onClick={() => { if (confirm(`למחוק את ${h.hotel_name}?`)) del.mutate(); }} className="flex-1 h-8 rounded-md border border-border text-[color:var(--accent-2)] text-xs inline-flex items-center justify-center gap-1 min-h-0">
          <Trash2 size={11} /> מחק
        </button>
      </div>
      {postStay && <PostStayForm hotel={h} />}
    </div>
  );
}

function PostStayForm({ hotel }: { hotel: Hotel }) {
  const qc = useQueryClient();
  const [rating, setRating] = useState(hotel.post_stay_rating ?? 0);
  const [review, setReview] = useState(hotel.post_stay_review ?? "");
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("hotels")
        .update({ post_stay_rating: rating || null, post_stay_review: review || null })
        .eq("id", hotel.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["hotels"] }); toast.success("נשמר"); },
  });
  return (
    <div className="mt-3 pt-3 border-t border-border/60">
      <div className="text-xs text-muted-foreground mb-1">דירוג לאחר השהות</div>
      <div className="flex gap-1 text-lg">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" onClick={() => setRating(n)}
            className={`min-h-0 h-auto ${n <= rating ? "text-[color:var(--accent-2)]" : "text-muted-foreground"}`}>★</button>
        ))}
      </div>
      <textarea rows={2} value={review} onChange={(e) => setReview(e.target.value)}
        placeholder="סקירה..." className="w-full mt-1 rounded-lg bg-background border border-input px-2 py-1 text-sm min-h-[50px]" />
      <button onClick={() => save.mutate()} className="mt-1 text-xs text-[color:var(--accent)] min-h-0 h-auto p-0">שמור דירוג</button>
    </div>
  );
}

function HotelForm({ existing, onDone }: { existing?: Hotel; onDone: () => void }) {
  const qc = useQueryClient();
  const [hotel_name, setName] = useState(existing?.hotel_name ?? "");
  const [type, setType] = useState<"hotel" | "ryokan" | "other">((existing?.type as "hotel" | "ryokan" | "other") ?? "hotel");
  const [city, setCity] = useState(existing?.city ?? "");
  const [address, setAddress] = useState(existing?.address ?? "");
  const [checkin_date, setCi] = useState(existing?.checkin_date ?? "");
  const [checkout_date, setCo] = useState(existing?.checkout_date ?? "");
  const [price_per_night, setPrice] = useState(existing?.price_per_night_ils?.toString() ?? "");
  const [cancellation_deadline, setDeadline] = useState(existing?.cancellation_deadline ?? "");
  const [booking_platform, setPlat] = useState(existing?.booking_platform ?? "");
  const [confirmation_url, setUrl] = useState(existing?.confirmation_url ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [google_maps_url, setMapsUrl] = useState(existing?.google_maps_url ?? "");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    existing?.latitude != null && existing?.longitude != null
      ? { lat: Number(existing.latitude), lng: Number(existing.longitude) }
      : null,
  );
  const [photoUrl, setPhotoUrl] = useState<string | null>(existing?.photo_url ?? null);
  const [placeSelected, setPlaceSelected] = useState<{ name: string; address: string } | null>(
    existing ? { name: existing.hotel_name, address: existing.address ?? "" } : null,
  );
  const [manualMode, setManualMode] = useState(!!existing);

  function handlePlace(p: SelectedPlace) {
    setName(p.name);
    setAddress(p.address);
    setMapsUrl(p.google_maps_url);
    setCoords({ lat: p.latitude, lng: p.longitude });
    setPhotoUrl(p.photo_url);
    if (p.city) setCity(p.city);
    setPlaceSelected({ name: p.name, address: p.address });
  }

  function clearPlace() {
    setPlaceSelected(null);
    setName("");
    setAddress("");
    setMapsUrl("");
    setCoords(null);
    setPhotoUrl(null);
  }

  const save = useMutation({
    mutationFn: async () => {
      if (!hotel_name.trim()) throw new Error("שם המלון חסר");
      const nights = checkin_date && checkout_date ? Math.max(1, daysBetween(checkin_date, checkout_date)) : 1;
      const priceN = Number(price_per_night) || 0;
      const payload = {
        hotel_name: hotel_name.trim(), type, city: city.trim() || null,
        address: address.trim() || null,
        checkin_date: checkin_date || null,
        checkout_date: checkout_date || null,
        price_per_night_ils: priceN || null,
        total_cost_ils: priceN * nights,
        cancellation_deadline: cancellation_deadline || null,
        booking_platform: booking_platform.trim() || null,
        confirmation_url: confirmation_url.trim() || null,
        notes: notes.trim() || null,
        google_maps_url: google_maps_url.trim() || null,
        latitude: coords?.lat ?? null,
        longitude: coords?.lng ?? null,
        photo_url: photoUrl,
      };
      if (existing) {
        const { error } = await supabase.from("hotels").update(payload).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("hotels").insert({ trip_id: TRIP_ID, ...payload });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hotels"] });
      toast.success(existing ? "נשמר" : "נוסף");
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-3 pt-2 pb-2">
      {!manualMode && !placeSelected && (
        <>
          <PlacesSearch onSelect={handlePlace} />
          <button type="button" onClick={() => setManualMode(true)}
            className="text-xs text-muted-foreground underline min-h-0 h-auto p-0">
            הוסף ידנית
          </button>
        </>
      )}

      {placeSelected && (
        <div className="rounded-lg border border-[color:var(--accent-3)]/40 bg-[color:var(--accent-3)]/10 p-2 text-xs flex items-start gap-2">
          {photoUrl && <img src={photoUrl} alt="" className="w-10 h-10 rounded-md object-cover shrink-0" />}
          <div className="flex-1 min-w-0">
            <div className="text-[color:var(--accent-3)]">✅ {placeSelected.name}</div>
            {placeSelected.address && (
              <div className="text-muted-foreground truncate" dir="ltr">{placeSelected.address}</div>
            )}
          </div>
          <button type="button" onClick={clearPlace}
            className="text-[color:var(--accent)] underline min-h-0 h-auto p-0 shrink-0">שנה</button>
        </div>
      )}

      {(manualMode || placeSelected) && (
        <>
          <Field label="שם המלון"><input required value={hotel_name} onChange={(e) => setName(e.target.value)} className="w-full rounded-lg bg-background border border-input px-3 h-11" /></Field>
          <Field label="סוג">
            <select value={type} onChange={(e) => setType(e.target.value as "hotel" | "ryokan" | "other")} className="w-full rounded-lg bg-background border border-input px-3 h-11">
              <option value="hotel">מלון</option><option value="ryokan">ריוקאן</option><option value="other">אחר</option>
            </select>
          </Field>
          <Field label="עיר"><input value={city} onChange={(e) => setCity(e.target.value)} dir="ltr" className="w-full rounded-lg bg-background border border-input px-3 h-11" /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="צ׳ק-אין"><input type="date" value={checkin_date} onChange={(e) => setCi(e.target.value)} className="w-full rounded-lg bg-background border border-input px-3 h-11" /></Field>
            <Field label="צ׳ק-אאוט"><input type="date" value={checkout_date} onChange={(e) => setCo(e.target.value)} className="w-full rounded-lg bg-background border border-input px-3 h-11" /></Field>
          </div>
          <Field label="מחיר ללילה (₪)"><input type="number" value={price_per_night} onChange={(e) => setPrice(e.target.value)} className="w-full rounded-lg bg-background border border-input px-3 h-11" /></Field>
          <Field label="תאריך ביטול חינם"><input type="date" value={cancellation_deadline} onChange={(e) => setDeadline(e.target.value)} className="w-full rounded-lg bg-background border border-input px-3 h-11" /></Field>
          <Field label="פלטפורמת הזמנה"><input value={booking_platform} onChange={(e) => setPlat(e.target.value)} placeholder="Booking, Agoda..." className="w-full rounded-lg bg-background border border-input px-3 h-11" /></Field>
          <Field label="לינק להזמנה"><input type="url" value={confirmation_url} onChange={(e) => setUrl(e.target.value)} dir="ltr" placeholder="https://..." className="w-full rounded-lg bg-background border border-input px-3 h-11" /></Field>
          <Field label="הערות"><textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full rounded-lg bg-background border border-input px-3 py-2 min-h-[60px]" /></Field>

          <button type="submit" disabled={save.isPending} className="w-full h-12 rounded-xl bg-[color:var(--accent-3)] text-white font-medium disabled:opacity-50">
            {save.isPending ? "שומר..." : "שמור"}
          </button>
        </>
      )}
    </form>
  );
}

function ListSkeleton() {
  return <div className="space-y-2 animate-pulse">{[0, 1, 2, 3].map(i => <div key={i} className="h-24 bg-card border border-border rounded-2xl" />)}</div>;
}
