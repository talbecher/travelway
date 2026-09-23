import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ExternalLink, Plus, Navigation, Pencil, Trash2, List, Map as MapIcon, Download, CheckSquare, Square, X, MapPin, Star, Search, Compass, Sparkles, RotateCcw } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRecs, useHotels, useDays, useTrip } from "@/hooks/use-trip";
import { DiscoverSheet, useDiscoverAccess } from "@/components/discover/DiscoverSheet";
import { getActiveTripId } from "@/lib/constants";
import { haversine, fmtDistance } from "@/lib/geo";
import { hebDate, ils, daysBetween, todayISO } from "@/lib/format";
import { BottomSheet } from "@/components/BottomSheet";
import { EmptyState } from "@/components/EmptyState";
import { ClientOnly } from "@/components/ClientOnly";
import { MapSkeleton } from "@/components/MapSkeleton";
import { addRecommendationToDay, type RecType } from "@/lib/recommendations";
import { syncHotelToItinerary, deleteHotelCascade } from "@/lib/hotels";
import { parseLatLngFromMapsUrl } from "@/lib/coords";
import { toast } from "sonner";
import { assertOnline } from "@/hooks/use-online";
import { z } from "zod";
import { PlacesSearch, type SelectedPlace } from "@/components/PlacesSearch";
import { PhotoUploader } from "@/components/PhotoUploader";
import { ImportFromMyMapsSheet } from "@/components/ImportFromMyMapsSheet";
import { ImportAISheet } from "@/components/ImportAISheet";
import { useActiveTripId } from "@/hooks/use-active-trip";
import { useAuth } from "@/hooks/use-auth";
import { useRecentDiscoverIds } from "@/lib/discover-recent";
import { enrichRecommendationPhoto } from "@/lib/places.functions";
import { useServerFn } from "@tanstack/react-start";
import { HotelForm, type Hotel } from "@/components/HotelForm";
import { bookingChip } from "@/lib/deadlines";
import { DateField } from "@/components/DateField";

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
  booking_deadline?: string | null;
  booking_time?: string | null;
  booking_url?: string | null;
  booking_note?: string | null;
  booking_status?: string | null;
};

const TAB_TYPE: Record<Exclude<Tab, "all" | "hotels">, RecType> = { food: "food", attractions: "attraction" };

const TYPE_KEYWORDS: Record<string, string> = {
  food: "אוכל food מסעדה",
  attraction: "אטרקציה attraction",
  hotel: "מלון לינה hotel",
};

function matchesQuery(fields: Array<string | null | undefined>, q: string): boolean {
  const query = q.trim().toLowerCase();
  if (!query) return true;
  const hay = fields.filter(Boolean).join(" \n ").toLowerCase();
  const tokens = query.split(/\s+/).filter(Boolean);
  return tokens.every((t) => hay.includes(t));
}

function recMatchesQuery(r: Rec, q: string): boolean {
  return matchesQuery(
    [r.name, r.notes, r.review, r.city, r.address, TYPE_KEYWORDS[r.type]],
    q,
  );
}

function Recs() {
  const search = Route.useSearch();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>((search.tab as Tab | undefined) ?? "all");
  const [city, setCity] = useState<string>("all");
  const [view, setView] = useState<"list" | "map">("list");
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [aiImportOpen, setAiImportOpen] = useState(false);
  const aiTripId = useActiveTripId();
  const [editRec, setEditRec] = useState<Rec | null>(null);
  const [mapPickRec, setMapPickRec] = useState<Rec | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [discoverOpen, setDiscoverOpen] = useState(false);
  const { data: recs = [], isError: recsError } = useRecs();
  const { data: trip } = useTrip();
  const { user } = useAuth();
  const activeTripId = useActiveTripId();
  const recentIdsAll = useRecentDiscoverIds(user?.id, activeTripId);
  const recentIds = useMemo(() => {
    const existing = new Set((recs as Rec[]).map((r) => r.id));
    return new Set(recentIdsAll.filter((id) => existing.has(id)));
  }, [recentIdsAll, recs]);
  const [recentOnly, setRecentOnly] = useState(false);
  useEffect(() => { if (recentIds.size === 0) setRecentOnly(false); }, [recentIds.size]);
  // Discover is on unless the flag explicitly turns it off, and only for pilot users.
  const discoverAllowed = useDiscoverAccess();
  const discoverEnabled =
    import.meta.env.VITE_DISCOVER_ENABLED !== "false" && discoverAllowed;

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
  useEffect(() => { if (view === "map" || tab === "hotels") exitSelection(); /* eslint-disable-next-line */ }, [view, tab]);

  function exitSelection() {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const visibleIds = useMemo(() => {
    if (tab === "hotels") return [] as string[];
    return (recs as Rec[])
      .filter(typeFilter)
      .filter((r) => city === "all" || r.city === city)
      .filter((r) => recMatchesQuery(r, q))
      .map((r) => r.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recs, tab, city, q]);

  const selectAllVisible = () => setSelectedIds(new Set(visibleIds));

  const bulkDelete = useMutation({
    mutationFn: async () => {
      const ids = Array.from(selectedIds);
      if (ids.length === 0) return 0;
      const { error } = await supabase.from("recommendations").delete().in("id", ids);
      if (error) throw error;
      return ids.length;
    },
    onSuccess: (n) => {
      qc.invalidateQueries({ queryKey: ["recs"] });
      toast.success(`נמחקו ${n} המלצות`);
      exitSelection();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mapPins = useMemo(() => {
    return (recs as Rec[])
      .filter(typeFilter)
      .filter((r) => city === "all" || r.city === city)
      .filter((r) => recMatchesQuery(r, q))
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
        notes: r.notes,
        photo_url: r.photo_url ?? null,
      }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recs, tab, city, q]);



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

  const selectableInList = tab !== "hotels" && view === "list";
  const hasActiveFilters = q.trim().length > 0 || city !== "all" || recentOnly || (tab !== "all" && tab !== "hotels");

  const resetFilters = () => {
    setQ("");
    setCity("all");
    setRecentOnly(false);
    if (tab !== "hotels") setTab("all");
  };

  return (
    <div className="-mx-4 -mt-2 min-h-full bg-background px-4 pb-4 pt-5" dir="rtl">
      <div className="space-y-4">
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0 pt-0.5">
            <h1 className="text-2xl font-bold leading-tight text-foreground">המלצות</h1>
            <p className="mt-1 text-sm text-muted-foreground">המקומות ששמרת לטיול</p>
          </div>
          {selectableInList && (
            selectionMode ? (
              <button onClick={exitSelection} aria-label="בטל בחירה"
                className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border border-border bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <X size={16} /> בטל
              </button>
            ) : (
              <button onClick={() => setSelectionMode(true)} aria-label="בחירה מרובה"
                className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border border-border bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <CheckSquare size={16} /> בחירה
              </button>
            )
          )}
        </header>

        {!selectionMode && (
          <div className="flex items-stretch gap-2">
            {discoverEnabled && (
              <button onClick={() => setDiscoverOpen(true)} aria-label="Discover — גילוי מקומות"
                className="inline-flex min-h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl border border-accent/25 bg-accent/10 px-3 text-sm font-medium text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <Compass size={17} /> Discover
              </button>
            )}
          {tab !== "hotels" && !selectionMode && (
            <div className="flex shrink-0 gap-1 rounded-xl bg-muted p-1" aria-label="בחירת תצוגה">
              <button onClick={() => setView("list")} aria-label="תצוגת רשימה"
                aria-pressed={view === "list"}
                className={`flex min-h-11 min-w-11 items-center justify-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${view === "list" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}>
                <List size={18} />
              </button>
              <button onClick={() => setView("map")} aria-label="תצוגת מפה"
                aria-pressed={view === "map"}
                className={`flex min-h-11 min-w-11 items-center justify-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${view === "map" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}>
                <MapIcon size={18} />
              </button>
            </div>
          )}
          </div>
        )}

        <section className="space-y-3" aria-label="סינון המלצות">
          <div className="relative">
            <Search size={18} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="חיפוש לפי שם, עיר או סוג"
              dir="rtl"
              className="h-12 w-full rounded-xl border border-input bg-card pr-11 pl-11 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-ring/20"
            />
            {q && (
              <button
                type="button"
                aria-label="נקה חיפוש"
                onClick={() => setQ("")}
                className="absolute left-1.5 top-1/2 flex min-h-11 min-w-11 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X size={16} />
              </button>
            )}
          </div>

          <div className="grid grid-cols-4 gap-1 rounded-xl bg-muted p-1">
            <TabBtn active={tab === "all"} onClick={() => setTab("all")}>הכל</TabBtn>
            <TabBtn active={tab === "food"} onClick={() => setTab("food")}>אוכל</TabBtn>
            <TabBtn active={tab === "attractions"} onClick={() => setTab("attractions")}>אטרקציות</TabBtn>
            <TabBtn active={tab === "hotels"} onClick={() => setTab("hotels")}>מלונות</TabBtn>
          </div>

          {(tab !== "hotels" && (cities.length > 0 || recentIds.size > 0 || hasActiveFilters)) && (
            <div className="flex flex-wrap items-center gap-2">
              {cities.length > 0 && (
                <label className="relative min-w-0 flex-1">
                  <span className="sr-only">סינון לפי עיר</span>
                  <select
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    aria-label="סינון לפי עיר"
                    className="min-h-11 w-full appearance-none rounded-xl border border-border bg-card px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring/20"
                  >
                    <option value="all">כל הערים</option>
                    {cities.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
              )}
              {recentIds.size > 0 && (
                <button
                  type="button"
                  onClick={() => setRecentOnly((v) => !v)}
                  aria-pressed={recentOnly}
                  className={`min-h-11 rounded-xl border px-3 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${recentOnly ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground"}`}
                >
                  נוספו הרגע ({recentIds.size})
                </button>
              )}
              {hasActiveFilters && (
                <button type="button" onClick={resetFilters}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2 text-xs font-medium text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <RotateCcw size={14} /> איפוס
                </button>
              )}
            </div>
          )}
        </section>

        <AdminBackfillButton recs={recs as Rec[]} />

        {tab === "hotels" ? (
          <HotelsList onEdit={setEditRec} query={q} onResetFilters={resetFilters} />
        ) : recsError ? (
          <EmptyState variant="recs" title="לא הצלחנו לטעון את ההמלצות" hint="כדאי לנסות שוב בעוד רגע" />
        ) : view === "map" ? (
          <div className="-mx-4 overflow-hidden" style={{ height: "calc(100vh - 180px)" }}>
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
          <PlacesList
            type={listType}
            cityFilter={city}
            query={q}
            onEdit={setEditRec}
            selectionMode={selectionMode}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            recentIds={recentIds}
            recentOnly={recentOnly}
            onResetFilters={resetFilters}
          />
        )}

        {!selectionMode && view === "list" && (
          <section className="space-y-2 border-t border-border pt-4" aria-label="הוספה וייבוא">
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setImportOpen(true)} aria-label="ייבוא ממפה"
                className="inline-flex min-h-12 min-w-0 items-center justify-center gap-2 rounded-xl border border-border bg-card px-2 text-center text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <Download size={17} className="shrink-0" /> <span className="break-words">ייבוא ממפה</span>
              </button>
              <button onClick={() => setAiImportOpen(true)} aria-label="ייבוא מ-AI"
                className="inline-flex min-h-12 min-w-0 items-center justify-center gap-2 rounded-xl border border-border bg-card px-2 text-center text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <Sparkles size={17} className="shrink-0" /> <span className="break-words">ייבוא מ־AI</span>
              </button>
            </div>
            <button onClick={() => setAddOpen(true)} aria-label={tab === "hotels" ? "הוסף מלון" : "הוסף מקום"}
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
              <Plus size={20} /> {tab === "hotels" ? "הוספת מלון" : "הוספת מקום"}
            </button>
          </section>
        )}

      {selectionMode && (
        <div className="fixed inset-x-0 bottom-[calc(70px+env(safe-area-inset-bottom))] z-40 px-4">
          <div className="mx-auto flex max-w-[720px] items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 shadow-lg">
            <span className="text-sm font-medium">נבחרו {selectedIds.size}</span>
            <button onClick={selectAllVisible} className="text-xs text-[color:var(--accent)] min-h-0 h-auto p-0">בחר הכל</button>
            <div className="flex-1" />
            <button onClick={exitSelection} className="text-xs text-muted-foreground min-h-0 h-8 px-2">בטל</button>
            <button
              onClick={() => {
                if (selectedIds.size === 0) return;
                if (confirm(`למחוק ${selectedIds.size} המלצות?`)) bulkDelete.mutate();
              }}
              disabled={selectedIds.size === 0 || bulkDelete.isPending}
              className="flex h-9 min-h-0 items-center gap-1 rounded-lg bg-destructive px-3 text-xs text-destructive-foreground disabled:opacity-40"
            >
              <Trash2 size={12} /> מחק
            </button>
          </div>
        </div>
      )}

      <ImportFromMyMapsSheet open={importOpen} onOpenChange={setImportOpen} />

      {discoverEnabled && (
        <DiscoverSheet
          open={discoverOpen}
          onOpenChange={setDiscoverOpen}
          defaultCity={city !== "all" ? city : null}
          defaultCountry={trip?.destination_country ?? null}
        />
      )}

      <ImportAISheet
        open={aiImportOpen}
        onOpenChange={setAiImportOpen}
        tripId={aiTripId}
        mode="recs"
        days={[]}
        existingRecNames={recs.map((r) => r.name)}
      />

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
      aria-pressed={active}
      className={`min-h-11 min-w-0 rounded-lg px-1 text-xs sm:text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${active ? "bg-card font-medium text-foreground shadow-sm" : "text-muted-foreground"}`}>
      {children}
    </button>
  );
}

function PlacesList({
  type, cityFilter, query, onEdit, selectionMode, selectedIds, onToggleSelect,
  recentIds, recentOnly, onResetFilters,
}: {
  type: "food" | "attraction" | "all";
  cityFilter: string;
  query: string;
  onEdit: (r: Rec) => void;
  selectionMode: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  recentIds: Set<string>;
  recentOnly: boolean;
  onResetFilters: () => void;
}) {
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
    items = items.filter((r) => recMatchesQuery(r, query));
    if (recentOnly) items = items.filter((r) => recentIds.has(r.id));
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
  }, [recs, type, cityFilter, pos, query, recentOnly, recentIds]);


  if (isLoading) return <ListSkeleton />;
  if (list.length === 0) {
    if (query.trim() || cityFilter !== "all" || recentOnly || type !== "all") {
      return <EmptyState variant="recs" title={query.trim() ? `לא נמצאו תוצאות עבור "${query}"` : "לא נמצאו תוצאות במסננים האלה"} hint="אפשר לאפס את המסננים ולנסות שוב" cta={
        <button type="button" onClick={onResetFilters}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <RotateCcw size={16} /> איפוס מסננים
        </button>
      } />;
    }
    return <EmptyState variant="recs" title="אין המלצות עדיין" hint="אפשר להוסיף מקום או לייבא המלצות באמצעות הפעולות שמתחת" />;
  }

  return (
    <div className="space-y-2.5">
      {list.map((r) => (
        <PlaceCard
          key={r.id}
          rec={r}
          onEdit={() => onEdit(r)}
          distance={type !== "all" && pos && r.latitude && r.longitude ? haversine(pos, { lat: Number(r.latitude), lon: Number(r.longitude) }) : null}
          selectionMode={selectionMode}
          selected={selectedIds.has(r.id)}
          onToggleSelect={() => onToggleSelect(r.id)}
          isRecent={recentIds.has(r.id)}
        />
      ))}
    </div>
  );
}

function PlaceCard({
  rec, distance, onEdit, selectionMode, selected, onToggleSelect, isRecent = false,
}: {
  rec: Rec;
  distance: number | null;
  onEdit: () => void;
  selectionMode: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  isRecent?: boolean;
}) {
  const qc = useQueryClient();
  const { data: days = [] } = useDays();
  const [dayPickerOpen, setDayPickerOpen] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);

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

  const typeLabel = rec.type === "food" ? "אוכל" : rec.type === "hotel" ? "לינה" : "אטרקציה";

  const statusBadge = {
    wishlist: { label: "רשימה", cls: "bg-muted text-muted-foreground" },
    visited: { label: "ביקרנו", cls: "text-[color:var(--accent-3)]", style: { background: "color-mix(in oklab, var(--accent-3) 18%, transparent)" } },
    skipped: { label: "דילגנו", cls: "bg-muted text-muted-foreground line-through" },
  }[rec.status as "wishlist" | "visited" | "skipped"];

  const stop = (e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); };
  const googleRating = rec.google_rating != null ? Number(rec.google_rating) : null;

  const cardInner = (
    <div className={`relative overflow-hidden rounded-2xl border bg-card p-3.5 transition-colors ${selected ? "border-primary ring-2 ring-ring/30" : "border-border"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="rounded-full bg-accent/10 px-2 py-1 text-[11px] font-medium text-accent">{typeLabel}</span>
          <motion.span
            key={rec.status}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            style={"style" in statusBadge ? statusBadge.style : undefined}
            className={`rounded-full px-2 py-1 text-[10px] ${statusBadge.cls}`}
          >{statusBadge.label}</motion.span>
          {isRecent && (
            <span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-medium text-primary">נוסף עכשיו</span>
          )}
        </div>
        {selectionMode ? (
          <button
            onClick={(e) => { stop(e); onToggleSelect(); }}
            aria-label={selected ? "בטל בחירה" : "בחר"}
            className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {selected
              ? <CheckSquare size={19} className="text-primary" />
              : <Square size={18} className="text-muted-foreground" />}
          </button>
        ) : (
          <div className="flex shrink-0 items-center gap-1">
            <button onClick={(e) => { stop(e); onEdit(); }} aria-label="ערוך"
              className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Pencil size={16} />
            </button>
            <button onClick={(e) => { stop(e); if (confirm(`למחוק את ${rec.name}?`)) del.mutate(); }} aria-label="מחק"
              className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Trash2 size={16} />
            </button>
          </div>
        )}
      </div>

      <div className="mt-2 flex items-start gap-3">
        {rec.photo_url && !imgFailed && (
          <img
            src={rec.photo_url}
            alt=""
            loading="lazy"
            onError={() => setImgFailed(true)}
            className="h-[72px] w-[72px] shrink-0 rounded-[13px] border border-border object-cover min-[390px]:h-20 min-[390px]:w-20"
          />
        )}
        <div className="min-w-0 flex-1">
        <h2 className="break-words text-base font-bold leading-snug text-foreground" dir="auto">{rec.name}</h2>
        {rec.city && <div className="mt-1 text-xs font-medium text-muted-foreground" dir="auto">{rec.city}</div>}
        {rec.address && (
          <div className="mt-1 flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground" dir="auto">
            <MapPin size={13} className="mt-0.5 shrink-0" />
            <span className="min-w-0 break-words">{rec.address}</span>
          </div>
        )}
        {(() => {
          const chip = bookingChip(rec.booking_deadline, rec.booking_status, todayISO());
          if (!chip) return null;
          const cls =
            chip.tone === "booked" ? "bg-[color:var(--accent-3)]/15 text-[color:var(--accent-3)]"
            : chip.tone === "red" ? "bg-red-500/15 text-red-600"
            : chip.tone === "orange" ? "bg-amber-500/15 text-amber-600"
            : "bg-muted text-muted-foreground";
          return (
            <span className={`inline-block mt-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${cls} ${chip.pulse ? "animate-pulse" : ""}`}>
              {chip.label}
            </span>
          );
        })()}
        <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
          {googleRating != null && (
            <span className="inline-flex items-center gap-0.5" dir="ltr">
              <Star size={11} className="text-yellow-500 fill-yellow-500" />
              {googleRating.toFixed(1)}
              {rec.google_rating_count ? ` (${rec.google_rating_count})` : ""}
            </span>
          )}
          {distance != null && Number.isFinite(distance) && (
            <span>{fmtDistance(distance)}</span>
          )}
        </div>
        {rec.notes && (
          <div className="text-xs text-muted-foreground mt-1.5 line-clamp-2 whitespace-pre-line">{rec.notes}</div>
        )}
        {rec.status === "visited" && rec.rating && (
          <div className="text-xs mt-1 text-[color:var(--accent-2)]">{"★".repeat(rec.rating)}{"☆".repeat(5 - rec.rating)}</div>
        )}
        {rec.status === "visited" && rec.review && (
          <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{rec.review}</div>
        )}
        </div>
      </div>

        {!selectionMode && (
          <>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {rec.google_maps_url && (
                <a href={rec.google_maps_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
                  className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-border bg-background text-xs font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Navigation size={14} /> ניווט
                </a>
              )}
              <button onClick={(e) => { stop(e); setDayPickerOpen(true); }}
                className={`${rec.google_maps_url ? "" : "col-span-2"} inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-primary px-3 text-xs font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}>
                <Plus size={15} /> הוסף ליום
              </button>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 border-t border-border/60 pt-2 text-xs">
              {rec.status !== "visited" && <button onClick={(e) => { stop(e); setStatus.mutate("visited"); }} className="text-muted-foreground min-h-0 h-auto p-0">סמן שביקרנו</button>}
              {rec.status !== "skipped" && <button onClick={(e) => { stop(e); setStatus.mutate("skipped"); }} className="text-muted-foreground min-h-0 h-auto p-0">דילגנו</button>}
              {rec.status !== "wishlist" && <button onClick={(e) => { stop(e); setStatus.mutate("wishlist"); }} className="text-muted-foreground min-h-0 h-auto p-0">חזרה לרשימה</button>}
            </div>
          </>
        )}
      </div>
  );


  return (
    <>
      {selectionMode ? (
        <div
          role="checkbox"
          tabIndex={0}
          aria-checked={selected}
          aria-label={`${selected ? "בטל בחירה של" : "בחר את"} ${rec.name}`}
          onClick={onToggleSelect}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onToggleSelect();
            }
          }}
          className="cursor-pointer rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {cardInner}
        </div>
      ) : rec.google_maps_url ? (
        <div
          role="link"
          tabIndex={0}
          aria-label={`פתח את ${rec.name} ב-Google Maps`}
          className="cursor-pointer rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          onClick={() => window.open(rec.google_maps_url ?? "", "_blank", "noopener,noreferrer")}
          onKeyDown={(e) => {
            if (e.target !== e.currentTarget) return;
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              window.open(rec.google_maps_url ?? "", "_blank", "noopener,noreferrer");
            }
          }}
        >
          {cardInner}
        </div>
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
  const [bookingDeadline, setBookingDeadline] = useState(existing?.booking_deadline ?? "");
  const [bookingTime, setBookingTime] = useState(existing?.booking_time ?? "");
  const [bookingUrl, setBookingUrl] = useState(existing?.booking_url ?? "");
  const [bookingNote, setBookingNote] = useState(existing?.booking_note ?? "");
  const [bookingStatus, setBookingStatus] = useState<"none" | "booked">(
    (existing?.booking_status as "none" | "booked") ?? "none",
  );
  const [bookingOpen, setBookingOpen] = useState(!!existing?.booking_deadline);
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
        booking_deadline: bookingDeadline || null,
        booking_time: bookingTime.trim() || null,
        booking_url: bookingUrl.trim() || null,
        booking_note: bookingNote.trim() || null,
        booking_status: bookingStatus,
      };
      if (existing) {
        const { error } = await supabase.from("recommendations").update(payload).eq("id", existing.id);
        if (error) throw error;
        // Two-way sync: propagate to any linked day_entries
        const { data: linkedEntries } = await supabase
          .from("day_entries")
          .select("id, day_id")
          .eq("linked_recommendation_id", existing.id);
        const linked = linkedEntries ?? [];
        if (linked.length > 0) {
          const { error: syncErr } = await supabase
            .from("day_entries")
            .update({
              title: payload.name,
              location_name: payload.address,
              latitude: payload.latitude,
              longitude: payload.longitude,
              google_maps_url: payload.google_maps_url,
              photo_url: payload.photo_url,
            })
            .eq("linked_recommendation_id", existing.id);
          if (syncErr) throw syncErr;
          const dayIds = [...new Set(linked.map((e) => e.day_id))];
          return { syncedDays: dayIds };
        }
        return { syncedDays: [] as string[] };
      } else {
        const { error } = await supabase.from("recommendations").insert({ trip_id: getActiveTripId(), ...payload });
        if (error) throw error;
        return { syncedDays: [] as string[] };
      }
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["recs"] });
      for (const dayId of result.syncedDays) {
        qc.invalidateQueries({ queryKey: ["day-entries", dayId] });
      }
      qc.invalidateQueries({ queryKey: ["day-entries-summary"] });
      if (result.syncedDays.length > 0) {
        toast.success(`✅ עודכן גם ב-${result.syncedDays.length} ימים במסלול`);
      } else {
        toast.success(existing ? "נשמר" : "נוסף");
      }
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

  if (type === "hotel" && !existing) {
    return (
      <div className="flex flex-col pt-1">
        <div className="flex gap-1 bg-muted rounded-lg p-1 mb-3 shrink-0">
          {seg("food", "אוכל", "🍜", "var(--accent-2)")}
          {seg("attraction", "אטרקציה", "⛩", "var(--accent)")}
          {seg("hotel", "לינה", "🏨", "var(--accent-3)")}
        </div>
        <HotelForm onDone={onDone} />
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (!assertOnline()) return; save.mutate(); }}
      className="flex flex-col pt-1 pb-2"
    >
      <div className="sticky top-0 z-10 -mx-1 px-1 pt-1 pb-2 bg-card">
        <div className="flex gap-1 bg-muted rounded-lg p-1">
          {seg("food", "אוכל", "🍜", "var(--accent-2)")}
          {seg("attraction", "אטרקציה", "⛩", "var(--accent)")}
          {seg("hotel", "לינה", "🏨", "var(--accent-3)")}
        </div>
      </div>

      <div className="space-y-3 -mx-1 px-1">
        {!manualMode && !placeSelected && (
          <>
            <PlacesSearch onSelect={handlePlace} autoFocus />
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
          <div className="rounded-lg border border-[color:var(--accent-3)]/40 bg-[color:var(--accent-3)]/10 py-2.5 px-3 text-xs flex items-start gap-3">
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
            <Field label="שם"><input required value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-lg bg-background border border-input px-3 h-10" /></Field>
            <Field label="עיר"><input required value={city} onChange={(e) => setCity(e.target.value)} dir="ltr" className="w-full rounded-lg bg-background border border-input px-3 h-10" /></Field>
            <Field label="אזור / שכונה"><input value={address} onChange={(e) => setAddress(e.target.value)} dir="ltr" className="w-full rounded-lg bg-background border border-input px-3 h-10" /></Field>
            {manualMode && !placeSelected && (
              <Field label="לינק גוגל מפות">
                <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." dir="ltr" className="w-full rounded-lg bg-background border border-input px-3 h-10" />
                {url.trim() && (
                  parseLatLngFromMapsUrl(url)
                    ? <div className="text-[11px] text-[color:var(--accent-3)] mt-1">✅ מיקום זוהה</div>
                    : <div className="text-[11px] text-[color:var(--accent-2)] mt-1">⚠️ לא זוהה מיקום — לא יופיע במפה</div>
                )}
              </Field>
            )}
            <Field label="הערות"><textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full rounded-lg bg-background border border-input px-3 py-2 min-h-[56px]" /></Field>
            <div className="rounded-lg border border-border overflow-hidden">
              <button type="button" onClick={() => setBookingOpen((v) => !v)}
                className="w-full h-11 px-3 flex items-center justify-between bg-muted/40 text-sm min-h-0">
                <span>🎟 פרטי הזמנה</span>
                <span className="text-muted-foreground text-xs">{bookingOpen ? "▲" : "▼"}</span>
              </button>
              {bookingOpen && (
                <div className="p-3 space-y-3">
                  <Field label="מתי להזמין עד?">
                    <DateField value={bookingDeadline} onChange={setBookingDeadline} placeholder="בחר תאריך" />
                  </Field>
                  <Field label="שעה">
                    <input value={bookingTime} onChange={(e) => setBookingTime(e.target.value)}
                      placeholder="09:00 — אם יש שעה מדויקת"
                      className="w-full rounded-lg bg-background border border-input px-3 h-10" />
                  </Field>
                  <Field label="קישור להזמנה">
                    <input type="url" value={bookingUrl} onChange={(e) => setBookingUrl(e.target.value)}
                      placeholder="https://..." dir="ltr"
                      className="w-full rounded-lg bg-background border border-input px-3 h-10" />
                  </Field>
                  <Field label="הערה">
                    <input value={bookingNote} onChange={(e) => setBookingNote(e.target.value)}
                      placeholder="נגמר מהר, להזמין 30 יום מראש"
                      className="w-full rounded-lg bg-background border border-input px-3 h-10" />
                  </Field>
                  <div className="flex gap-1 bg-muted rounded-lg p-1">
                    <button type="button" onClick={() => setBookingStatus("none")}
                      className={`flex-1 h-9 rounded-md text-xs min-h-0 ${bookingStatus === "none" ? "bg-card shadow-sm" : "text-muted-foreground bg-transparent"}`}>
                      טרם הוזמן
                    </button>
                    <button type="button" onClick={() => setBookingStatus("booked")}
                      className={`flex-1 h-9 rounded-md text-xs min-h-0 ${bookingStatus === "booked" ? "text-white" : "text-muted-foreground bg-transparent"}`}
                      style={bookingStatus === "booked" ? { background: "var(--accent-3)" } : undefined}>
                      ✅ הוזמן
                    </button>
                  </div>
                </div>
              )}
            </div>
            <Field label="תמונה ראשית"><PhotoUploader value={photoUrl} onChange={setPhotoUrl} folder="recs" /></Field>

            {type === "hotel" && !existing && (
              <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-2">
                פרטי שהות (תאריכים, מחיר, ביטול) יוגדרו בכרטיס המלון לאחר השמירה.
              </div>
            )}
          </>
        )}
      </div>

      {(manualMode || placeSelected) && (
        <div className="sticky bottom-0 z-10 -mx-5 mt-3 px-5 pt-3 pb-2 bg-card border-t border-border/60 shrink-0">
          <button type="submit" disabled={save.isPending}
            className="w-full h-11 rounded-xl bg-[color:var(--accent)] text-white font-medium disabled:opacity-50">
            {save.isPending ? "שומר..." : "שמור"}
          </button>
        </div>
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


function HotelsList({ onEdit: _onEdit, query, onResetFilters }: { onEdit: (r: Rec) => void; query: string; onResetFilters: () => void }) {
  const { data: hotels = [], isLoading, isError } = useHotels();
  const [editHotel, setEditHotel] = useState<Hotel | null>(null);

  const filtered = useMemo(
    () => (hotels as Hotel[]).filter((h) =>
      matchesQuery([h.hotel_name, h.city, h.address, h.notes, h.post_stay_review, TYPE_KEYWORDS.hotel], query),
    ),
    [hotels, query],
  );

  if (isLoading) return <ListSkeleton />;
  if (isError) return <EmptyState variant="hotels" title="לא הצלחנו לטעון את המלונות" hint="כדאי לנסות שוב בעוד רגע" />;

  return (
    <>
      {filtered.length === 0 ? (
        <EmptyState variant="hotels" title={query ? `לא נמצאו מלונות עבור "${query}"` : "אין מלונות עדיין"} hint="אפשר להוסיף מלון או לייבא מקומות באמצעות הפעולות שמתחת" cta={query ? (
          <button type="button" onClick={onResetFilters}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <RotateCcw size={16} /> איפוס מסננים
          </button>
        ) : undefined} />
      ) : (
        <div className="space-y-2">
          {filtered.map((h) => <HotelCard key={h.id} h={h} onEdit={() => setEditHotel(h)} />)}
        </div>
      )}

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
  const [imgFailed, setImgFailed] = useState(false);
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
      await deleteHotelCascade(h.id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hotels"] });
      qc.invalidateQueries({ queryKey: ["day-entries"] });
      qc.invalidateQueries({ queryKey: ["day-entries-summary"] });
      qc.invalidateQueries({ queryKey: ["expenses"] });
      toast.success("המלון, כניסות המסלול וההוצאות נמחקו");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addToItinerary = useMutation({
    mutationFn: async () => {
      if (!h.checkin_date || !h.checkout_date) throw new Error("חסרים תאריכים");
      if (matchingDays.length === 0) throw new Error("התאריכים של המלון לא חופפים למסלול");
      return syncHotelToItinerary(h, days);
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["day-entries-summary"] });
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["day-entries"] });
      toast.success(`נוסף למסלול · ${r.nights} לילות · ${ils(r.total)}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canAddToItinerary = !!(h.checkin_date && h.checkout_date) && matchingDays.length > 0;

  return (
    <div className={`rounded-2xl border bg-card p-3.5 ${urgent ? "border-accent-2" : "border-border"}`}>
      <div className="flex items-start justify-between gap-2">
        {h.photo_url && !imgFailed && (
          <img src={h.photo_url} alt="" loading="lazy" onError={() => setImgFailed(true)}
            className="h-[72px] w-[72px] shrink-0 rounded-[13px] border border-border object-cover min-[390px]:h-20 min-[390px]:w-20" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="break-words font-semibold text-foreground" dir="auto">{h.hotel_name}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
              {h.type === "ryokan" ? "ריוקאן" : "מלון"}
            </span>
          </div>
          {h.city && <div className="text-xs text-muted-foreground" dir="ltr">{h.city}</div>}
        </div>
        <div className="flex shrink-0 items-start gap-1">
          {statusLabel && (
            <motion.span
              animate={urgent ? { opacity: [1, 0.6, 1] } : {}}
              transition={urgent ? { duration: 1.5, repeat: Infinity } : {}}
              className={`text-xs ${statusCls}`}
            >{statusLabel}</motion.span>
          )}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-muted/60 p-2.5 text-xs">
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
          className="inline-flex min-h-11 w-full items-center justify-center gap-1 rounded-xl bg-accent-3 px-3 text-xs font-medium text-primary-foreground disabled:opacity-40"
          title={!h.checkin_date || !h.checkout_date ? "חסרים תאריכים" : matchingDays.length === 0 ? "התאריכים לא חופפים למסלול" : ""}
        >
          {addToItinerary.isPending ? "מוסיף..." : `➕ הוסף למסלול${matchingDays.length ? ` (${matchingDays.length} לילות)` : ""}`}
        </button>
      </div>
      <div className="flex gap-2 mt-2 pt-2 border-t border-border/60">
        <button onClick={onEdit} className="inline-flex min-h-11 flex-1 items-center justify-center gap-1 rounded-xl border border-border text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Pencil size={11} /> ערוך
        </button>
        <button onClick={() => { if (confirm(`למחוק את ${h.hotel_name}?\n\nהמלון, כניסות המסלול שלו וכל הוצאות הלינה שלו יימחקו.`)) del.mutate(); }} className="inline-flex min-h-11 flex-1 items-center justify-center gap-1 rounded-xl border border-border text-xs text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
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


function ListSkeleton() {
  return <div className="space-y-2.5 animate-pulse">{[0, 1, 2, 3].map(i => <div key={i} className="h-40 rounded-2xl border border-border bg-card" />)}</div>;
}

function AdminBackfillButton({ recs }: { recs: Rec[] }) {
  const qc = useQueryClient();
  const enrichFn = useServerFn(enrichRecommendationPhoto);
  const [isAdmin, setIsAdmin] = useState(false);
  const [running, setRunning] = useState(false);
  const [stopRef] = useState<{ stop: boolean }>({ stop: false });
  const [progress, setProgress] = useState<{ done: number; total: number; updated: number } | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const p = new URLSearchParams(window.location.search);
    setIsAdmin(p.get("admin") === "1");
  }, []);

  const targets = useMemo(
    () =>
      recs.filter(
        (r) =>
          !r.photo_url &&
          (r.type === "food" || r.type === "attraction"),
      ),
    [recs],
  );

  if (!isAdmin) return null;

  const run = async () => {
    if (targets.length === 0) {
      toast.info("אין המלצות ללא תמונה");
      return;
    }
    if (!confirm(`נמצאו ${targets.length} המלצות ללא תמונה. להמשיך?`)) return;
    setRunning(true);
    stopRef.stop = false;
    let done = 0;
    let updated = 0;
    setProgress({ done: 0, total: targets.length, updated: 0 });
    const toastId = toast.loading(`מעדכן תמונות... 0/${targets.length}`);
    const BATCH = 10;
    try {
      for (let i = 0; i < targets.length; i += BATCH) {
        if (stopRef.stop) break;
        const slice = targets.slice(i, i + BATCH);
        const results = await Promise.all(
          slice.map((r) => {
            const lat = typeof r.latitude === "string" ? parseFloat(r.latitude) : r.latitude;
            const lng = typeof r.longitude === "string" ? parseFloat(r.longitude) : r.longitude;
            return enrichFn({
              data: {
                id: r.id,
                name: r.name,
                city: r.city,
                lat: Number.isFinite(lat as number) ? (lat as number) : null,
                lng: Number.isFinite(lng as number) ? (lng as number) : null,
              },
            }).catch(() => null);
          }),
        );
        results.forEach((r) => {
          if (r?.updated && r.photo_url) updated += 1;
        });
        done = Math.min(i + BATCH, targets.length);
        setProgress({ done, total: targets.length, updated });
        toast.loading(`מעדכן תמונות... ${done}/${targets.length}`, { id: toastId });
      }
      toast.success(`✅ עודכנו ${updated} תמונות`, { id: toastId });
      qc.invalidateQueries({ queryKey: ["recs", getActiveTripId()] });
      qc.invalidateQueries({ queryKey: ["recs"] });
    } finally {
      setRunning(false);
      setProgress(null);
    }
  };

  return (
    <div className="border border-dashed border-amber-500/50 rounded-lg p-2 text-xs bg-amber-500/5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground">
          🛠 מצב אדמין · {targets.length} המלצות ללא תמונה
        </span>
        <div className="flex gap-1">
          {running && (
            <button
              onClick={() => {
                stopRef.stop = true;
              }}
              className="h-8 px-3 rounded-md bg-[color:var(--accent-2)] text-white min-h-0"
            >
              עצור
            </button>
          )}
          <button
            onClick={run}
            disabled={running || targets.length === 0}
            className="h-8 px-3 rounded-md bg-amber-500 text-white disabled:opacity-40 min-h-0"
          >
            {running ? `מעדכן... ${progress?.done ?? 0}/${progress?.total ?? 0}` : "עדכן תמונות חסרות"}
          </button>
        </div>
      </div>
    </div>
  );
}
