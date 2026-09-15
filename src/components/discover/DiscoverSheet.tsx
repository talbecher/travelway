import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Compass, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { BottomSheet } from "@/components/BottomSheet";
import { supabase } from "@/integrations/supabase/client";
import { getActiveTripId } from "@/lib/constants";
import { saveRecommendation } from "@/lib/recommendations";
import { useAuth } from "@/hooks/use-auth";
import { addRecentDiscoverIds } from "@/lib/discover-recent";
import {
  discoverPlaces,
  checkPilotAccess,
  DISCOVER_INTERESTS,
  INTEREST_LABELS,
  type DiscoverInterest,
  type DiscoverPlace,
  type DiscoverResponse,
} from "@/lib/discover.functions";
import { DiscoverCard } from "@/components/discover/DiscoverCard";

const PROVIDER = "google";
const DUP_INDEX = "recommendations_trip_provider_place_uidx";
const DISCOVER_NOTE = "נבחר דרך Discover לפי תחומי העניין שלך";

type ExistingRec = {
  name: string;
  latitude: number | string | null;
  longitude: number | string | null;
  provider: string | null;
  provider_place_id: string | null;
};

type SavedRec = { id: string; name: string };

function normName(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

/** approx metres between two coordinates */
function distanceM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const la1 = (aLat * Math.PI) / 180;
  const la2 = (bLng * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Result of adding saved recommendations to a specific day. */
export type AddToDayResult = { added: number; skipped: number; failed: string[] };

/**
 * Shared pilot-access check — cached per signed-in user so both screens
 * reuse it instead of issuing fresh queries. Never calls Google.
 */
export function useDiscoverAccess(): boolean {
  const { user } = useAuth();
  const run = useServerFn(checkPilotAccess);
  const { data } = useQuery({
    queryKey: ["discover-access", user?.id],
    enabled: !!user?.id,
    queryFn: () => run(),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
  return data?.allowed === true;
}

export function DiscoverSheet({
  open,
  onOpenChange,
  defaultCity,
  defaultCountry,
  dayId,
  dayNumber = null,
  onAddToDay,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  defaultCity?: string | null;
  defaultCountry?: string | null;
  /** When the sheet is opened from a specific itinerary day. */
  dayId?: string | null;
  /** 1-based day number for the combined action label. */
  dayNumber?: number | null;
  /** Adds the given recommendation ids to that day. Required for the add block. */
  onAddToDay?: (recIds: string[]) => Promise<AddToDayResult>;
}) {
  const [city, setCity] = useState(defaultCity ?? "");
  const [country, setCountry] = useState(defaultCountry ?? "");
  const [interests, setInterests] = useState<DiscoverInterest[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());
  const [savedRecs, setSavedRecs] = useState<SavedRec[]>([]);
  const [addedRecIds, setAddedRecIds] = useState<Set<string>>(new Set());
  const [addFailedRecIds, setAddFailedRecIds] = useState<string[]>([]);
  const [data, setData] = useState<DiscoverResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // post-search local filters
  const [activeInterests, setActiveInterests] = useState<Set<DiscoverInterest>>(new Set());
  const [hideSaved, setHideSaved] = useState(false);
  const [hideInDay, setHideInDay] = useState(false);

  const qc = useQueryClient();
  const tripId = getActiveTripId();
  const { user } = useAuth();
  const fromDay = !!dayId && !!onAddToDay;

  // reset everything — sheet closed, or a different user / trip / day
  useEffect(() => {
    setSelected(new Set());
    setSavedIds(new Set());
    setFailedIds(new Set());
    setSavedRecs([]);
    setAddedRecIds(new Set());
    setAddFailedRecIds([]);
    setData(null);
    setErrorMsg(null);
    setActiveInterests(new Set());
    setHideSaved(false);
    setHideInDay(false);
  }, [open, dayId, tripId, user?.id]);

  // keep prefilled destination in sync when opened from different days
  useEffect(() => {
    if (!open) return;
    setCity(defaultCity ?? "");
    setCountry(defaultCountry ?? "");
  }, [open, defaultCity, defaultCountry]);

  // existing recommendations of the trip (dupe detection + "saved" state)
  const { data: existing } = useQuery({
    queryKey: ["recs", tripId, "discover-dup"],
    enabled: open && !!tripId,
    queryFn: async (): Promise<ExistingRec[]> => {
      const { data, error } = await supabase
        .from("recommendations")
        .select("name, latitude, longitude, provider, provider_place_id")
        .eq("trip_id", tripId);
      if (error) throw error;
      return (data ?? []) as ExistingRec[];
    },
  });

  // recommendations already linked to the day the sheet was opened from
  const { data: dayLinkedRecIds = [] } = useQuery({
    queryKey: ["discover-day-linked", dayId],
    enabled: open && !!dayId,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from("day_entries")
        .select("linked_recommendation_id")
        .eq("day_id", dayId!);
      if (error) throw error;
      return (data ?? [])
        .map((e) => e.linked_recommendation_id)
        .filter((id): id is string => !!id);
    },
    staleTime: 30_000,
  });

  const { data: dayLinkedPlaceIds = [] } = useQuery({
    queryKey: ["discover-day-linked-places", dayLinkedRecIds.join(",")],
    enabled: open && dayLinkedRecIds.length > 0,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from("recommendations")
        .select("provider_place_id")
        .in("id", dayLinkedRecIds)
        .eq("provider", PROVIDER);
      if (error) throw error;
      return (data ?? [])
        .map((r) => r.provider_place_id)
        .filter((id): id is string => !!id);
    },
    staleTime: 30_000,
  });

  const alreadySavedPlaceIds = useMemo(
    () =>
      new Set(
        (existing ?? [])
          .filter((r) => r.provider === PROVIDER && r.provider_place_id)
          .map((r) => r.provider_place_id as string),
      ),
    [existing],
  );
  const inDayPlaceIds = useMemo(() => new Set(dayLinkedPlaceIds), [dayLinkedPlaceIds]);

  const isSoftDuplicate = (p: DiscoverPlace): boolean => {
    if (p.latitude == null || p.longitude == null) return false;
    const n = normName(p.name);
    return (existing ?? []).some((r) => {
      if (r.provider === PROVIDER && r.provider_place_id === p.id) return false;
      if (r.latitude == null || r.longitude == null) return false;
      const rn = normName(r.name ?? "");
      if (!rn || (rn !== n && !rn.includes(n) && !n.includes(rn))) return false;
      return (
        distanceM(Number(r.latitude), Number(r.longitude), p.latitude!, p.longitude!) <= 150
      );
    });
  };

  const run = useServerFn(discoverPlaces);
  const search = useMutation({
    mutationFn: (vars: { city: string; country: string; interests: string[] }) =>
      run({ data: vars }),
    onSuccess: (res) => {
      setData(res);
      // results change, but the saved list stays — it accumulates per sheet session
      setSelected(new Set());
      setSavedIds(new Set());
      setFailedIds(new Set());
      setErrorMsg(res.ok ? null : (res.message ?? "החיפוש נכשל."));
      setActiveInterests(new Set());
      setHideSaved(false);
      setHideInDay(false);
    },
    onError: () => {
      setData(null);
      setErrorMsg("החיפוש נכשל. נסו שוב מאוחר יותר.");
    },
  });

  const findExistingRecId = async (placeId: string): Promise<string | null> => {
    const { data: dup, error } = await supabase
      .from("recommendations")
      .select("id")
      .eq("trip_id", tripId)
      .eq("provider", PROVIDER)
      .eq("provider_place_id", placeId)
      .limit(1);
    if (error) throw error;
    return dup && dup.length > 0 ? dup[0].id : null;
  };

  /**
   * Saves the given places one by one — a failure in one never stops the rest.
   * A place that already exists reuses its recommendation_id, untouched.
   */
  const savePlaces = async (
    places: DiscoverPlace[],
  ): Promise<{ ok: string[]; failed: string[]; recs: SavedRec[]; createdIds: string[] }> => {
    const ok: string[] = [];
    const failed: string[] = [];
    const recs: SavedRec[] = [];
    const createdIds: string[] = [];
    for (const p of places) {
      try {
        const existingId = await findExistingRecId(p.id);
        if (existingId) {
          // already in the list — never touch its notes
          ok.push(p.id);
          recs.push({ id: existingId, name: p.name });
          continue;
        }
        const recId = await saveRecommendation({
          type: p.recType,
          name: p.name,
          city: p.city,
          address: p.address || null,
          notes: DISCOVER_NOTE,
          google_maps_url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
            p.name,
          )}&query_place_id=${encodeURIComponent(p.id)}`,
          latitude: p.latitude,
          longitude: p.longitude,
          provider: PROVIDER,
          provider_place_id: p.id,
        });
        ok.push(p.id);
        recs.push({ id: recId, name: p.name });
        createdIds.push(recId);
      } catch (e) {
        const err = e as { code?: string; message?: string };
        if (err?.code === "23505" && (err.message ?? "").includes(DUP_INDEX)) {
          ok.push(p.id);
          try {
            const raced = await findExistingRecId(p.id);
            if (raced) recs.push({ id: raced, name: p.name });
          } catch {
            /* the recommendation exists; only the day-link id is unknown */
          }
        } else {
          failed.push(p.id);
        }
      }
    }
    return { ok, failed, recs, createdIds };
  };

  /** Applies the common post-save state updates. Returns the save result. */
  const applySaveResult = ({
    ok,
    failed,
    recs,
    createdIds,
  }: Awaited<ReturnType<typeof savePlaces>>) => {
    setSavedIds((prev) => new Set([...prev, ...ok]));
    setFailedIds(new Set(failed));
    setSavedRecs((prev) => {
      const byId = new Map(prev.map((r) => [r.id, r]));
      for (const r of recs) if (!byId.has(r.id)) byId.set(r.id, r);
      return Array.from(byId.values());
    });
    addRecentDiscoverIds(user?.id, tripId, createdIds);
    qc.invalidateQueries({ queryKey: ["recs"] });
  };

  const save = useMutation({
    mutationFn: savePlaces,
    onSuccess: (res) => {
      applySaveResult(res);
      setSelected(new Set(res.failed));
      if (res.ok.length > 0) toast.success(`נשמרו ${res.ok.length} מקומות להמלצות שלי`);
      if (res.failed.length > 0) toast.error(`${res.failed.length} מקומות לא נשמרו. אפשר לנסות שוב.`);
    },
    onError: () => toast.error("השמירה נכשלה. נסו שוב."),
  });

  const addToDay = useMutation({
    mutationFn: async (recIds: string[]) => {
      if (!onAddToDay) throw new Error("no handler");
      const res = await onAddToDay(recIds);
      return { res, requested: recIds };
    },
    onSuccess: ({ res, requested }) => {
      const { added, skipped, failed } = res;
      const done = requested.filter((id) => !failed.includes(id));
      setAddedRecIds((prev) => new Set([...prev, ...done]));
      setAddFailedRecIds(failed);
      if (failed.length === 0) {
        if (added > 0) toast.success(`נוספו ${added} מקומות ליום הזה`);
        else if (skipped > 0) toast.success("כל המקומות שנבחרו כבר נמצאים ביום הזה");
      } else {
        toast.error(`${failed.length} מקומות לא נוספו ליום. אפשר לנסות שוב.`);
      }
    },
    onError: () => toast.error("ההוספה ליום נכשלה. נסו שוב."),
  });

  /**
   * Combined action: save to recommendations first, then add the saved
   * recommendation ids to the day. Per place: existing recommendations reuse
   * their id and go straight to the day; a failed save never reaches the day;
   * a failed add leaves the recommendation saved and retry only re-adds.
   */
  const saveAndAdd = useMutation({
    mutationFn: async (places: DiscoverPlace[]) => {
      if (!onAddToDay) throw new Error("no handler");
      const saveRes = await savePlaces(places);
      const toAdd = saveRes.recs.map((r) => r.id);
      const addRes = toAdd.length > 0 && onAddToDay ? await onAddToDay(toAdd) : { added: 0, skipped: 0, failed: [] as string[] };
      return { saveRes, addRes };
    },
    onSuccess: ({ saveRes, addRes }) => {
      applySaveResult(saveRes);
      setSelected(new Set(saveRes.failed));
      setAddFailedRecIds([]);
      const done = saveRes.recs.filter((r) => !addRes.failed.includes(r.id));
      setAddedRecIds((prev) => new Set([...prev, ...done.map((r) => r.id)]));
      if (addRes.failed.length > 0) {
        setAddFailedRecIds(addRes.failed);
        toast.error("נשמר בהמלצות, ההוספה ליום נכשלה — נסו שוב.", {
          action: {
            label: "נסו שוב",
            onClick: () => {
              if (!addToDay.isPending) addToDay.mutate(addRes.failed);
            },
          },
        });
      }
      if (saveRes.failed.length > 0) {
        toast.error(`${saveRes.failed.length} מקומות לא נשמרו ולא נוספו ליום. אפשר לנסות שוב.`);
      }
      if (saveRes.failed.length === 0 && addRes.failed.length === 0) {
        toast.success(`נשמרו ונוספו ${addRes.added} מקומות ליום הזה`);
      }
    },
    onError: () => toast.error("הפעולה נכשלה. נסו שוב."),
  });

  const toggleInterest = (i: DiscoverInterest) => {
    setInterests((prev) => {
      if (prev.includes(i)) return prev.filter((x) => x !== i);
      if (prev.length >= 3) return prev;
      return [...prev, i];
    });
  };

  const canSubmit =
    city.trim().length > 0 &&
    country.trim().length > 0 &&
    interests.length >= 1 &&
    interests.length <= 3 &&
    !search.isPending;

  const submit = () => {
    if (!canSubmit) return;
    setErrorMsg(null);
    search.mutate({ city: city.trim(), country: country.trim(), interests });
  };

  const results = data?.ok ? data.results : [];
  const isSaved = (p: DiscoverPlace) => savedIds.has(p.id) || alreadySavedPlaceIds.has(p.id);
  const isInDay = (p: DiscoverPlace) => inDayPlaceIds.has(p.id);
  // selectable: fresh places; saved places only to add them to the day
  const isSelectable = (p: DiscoverPlace) => !isInDay(p) && (!isSaved(p) || fromDay);

  /* ---- local post-search filters ---- */
  const resultInterests = useMemo(
    () =>
      DISCOVER_INTERESTS.filter((i) => results.some((p) => p.interest === i)),
    [results],
  );
  const matchesFilters = (p: DiscoverPlace): boolean => {
    if (activeInterests.size > 0 && !activeInterests.has(p.interest)) return false;
    if (hideSaved && isSaved(p)) return false;
    if (hideInDay && isInDay(p)) return false;
    return true;
  };
  const visibleResults = results.filter(matchesFilters);
  const toggleFilterInterest = (i: DiscoverInterest) =>
    setActiveInterests((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  const selectedAll = results.filter((p) => selected.has(p.id) && isSelectable(p));
  const selectedHidden = selectedAll.filter((p) => !matchesFilters(p)).length;
  const selectedFresh = selectedAll.filter((p) => !isSaved(p));
  const busy = save.isPending || saveAndAdd.isPending;

  const saveSelected = () => {
    if (busy || selectedFresh.length === 0) return;
    setFailedIds(new Set());
    save.mutate(selectedFresh);
  };

  const saveAndAddSelected = () => {
    if (busy || selectedAll.length === 0 || !fromDay) return;
    setFailedIds(new Set());
    // already-saved places reuse their existing recommendation_id inside
    // savePlaces and go straight to the day — no duplicate is created
    saveAndAdd.mutate(selectedAll);
  };

  const showAddBlock = fromDay && savedRecs.length > 0;
  const pendingRecs = savedRecs.filter((r) => !addedRecIds.has(r.id));
  const retryRecs = pendingRecs.filter((r) => addFailedRecIds.includes(r.id));
  const targetIds = (retryRecs.length > 0 ? retryRecs : pendingRecs).map((r) => r.id);

  const actionCount = fromDay ? selectedAll.length : selectedFresh.length;
  const dayLabel = dayNumber != null ? `ליום ${dayNumber}` : "ליום הזה";

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title="Discover — גילוי מקומות">
      <div className="space-y-4 pb-2" dir="rtl">
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">עיר</span>
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              maxLength={100}
              dir="rtl"
              className="w-full h-10 rounded-lg bg-background border border-input px-3 text-sm outline-none focus:border-[color:var(--accent)]"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">מדינה</span>
            <input
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              maxLength={100}
              dir="rtl"
              className="w-full h-10 rounded-lg bg-background border border-input px-3 text-sm outline-none focus:border-[color:var(--accent)]"
            />
          </label>
        </div>

        <div className="space-y-1.5">
          <span className="text-xs text-muted-foreground">תחומי עניין (1–3)</span>
          <div className="flex flex-wrap gap-2">
            {DISCOVER_INTERESTS.map((i) => {
              const active = interests.includes(i);
              const disabled = !active && interests.length >= 3;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => toggleInterest(i)}
                  aria-pressed={active}
                  disabled={disabled}
                  className={`h-8 px-3 rounded-full border text-xs min-h-0 ${
                    active
                      ? "bg-[color:var(--accent)] text-white border-transparent"
                      : "bg-card border-border text-foreground"
                  } ${disabled ? "opacity-40" : ""}`}
                >
                  {INTEREST_LABELS[i]}
                </button>
              );
            })}
          </div>
        </div>

        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className="w-full h-11 rounded-lg bg-[color:var(--accent)] text-white text-sm flex items-center justify-center gap-2 disabled:opacity-40"
        >
          {search.isPending ? <Loader2 size={16} className="animate-spin" /> : <Compass size={16} />}
          {search.isPending ? "מחפש…" : "חפש מקומות"}
        </button>

        {errorMsg && (
          <div role="alert" className="text-xs text-[color:var(--accent-2)] bg-muted rounded-lg p-3">
            {errorMsg}
          </div>
        )}

        {data?.ok && (data.failedInterests?.length ?? 0) > 0 && (
          <div role="status" className="text-xs text-muted-foreground bg-muted rounded-lg p-3">
            חלק מהתחומים לא הוחזרו:{" "}
            {data.failedInterests!.map((i) => INTEREST_LABELS[i]).join(", ")}
          </div>
        )}

        {search.isPending && (
          <div className="space-y-2" aria-hidden>
            {[0, 1, 2].map((k) => (
              <div key={k} className="h-[92px] rounded-xl bg-muted animate-pulse" />
            ))}
          </div>
        )}

        {!search.isPending && data?.ok && results.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-6">
            לא נמצאו מקומות מתאימים ליעד ולתחומים שנבחרו.
          </p>
        )}

        {results.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {resultInterests.map((i) => {
              const active = activeInterests.has(i);
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => toggleFilterInterest(i)}
                  aria-pressed={active}
                  className={`h-7 px-3 rounded-full border text-[11px] min-h-0 ${
                    active
                      ? "bg-[color:var(--accent)] text-white border-transparent"
                      : "bg-card border-border text-muted-foreground"
                  }`}
                >
                  {INTEREST_LABELS[i]}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setHideSaved((v) => !v)}
              aria-pressed={hideSaved}
              className={`h-7 px-3 rounded-full border text-[11px] min-h-0 ${
                hideSaved
                  ? "bg-[color:var(--accent)] text-white border-transparent"
                  : "bg-card border-border text-muted-foreground"
              }`}
            >
              הסתר שמורים
            </button>
            {fromDay && (
              <button
                type="button"
                onClick={() => setHideInDay((v) => !v)}
                aria-pressed={hideInDay}
                className={`h-7 px-3 rounded-full border text-[11px] min-h-0 ${
                  hideInDay
                    ? "bg-[color:var(--accent)] text-white border-transparent"
                    : "bg-card border-border text-muted-foreground"
                }`}
              >
                הסתר ביום
              </button>
            )}
          </div>
        )}

        {results.length > 0 && visibleResults.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">
            כל התוצאות מוסתרות בסינון הנוכחי.
          </p>
        )}

        {visibleResults.length > 0 && (
          <div className="space-y-2">
            {visibleResults.map((p) => (
              <DiscoverCard
                key={p.id}
                place={p}
                selected={selected.has(p.id)}
                saved={isSaved(p)}
                inDay={isInDay(p)}
                dayId={fromDay ? dayId : null}
                maybeDuplicate={isSoftDuplicate(p)}
                failed={failedIds.has(p.id)}
                onToggle={() =>
                  setSelected((prev) => {
                    const next = new Set(prev);
                    if (next.has(p.id)) next.delete(p.id);
                    else next.add(p.id);
                    return next;
                  })
                }
              />
            ))}
          </div>
        )}

        {(results.length > 0 || showAddBlock) && (
          <div className="sticky bottom-0 pt-2 bg-surface space-y-2">
            {showAddBlock && (
              <div className="rounded-xl border border-border bg-card p-3 space-y-2">
                <p className="text-[13px] font-medium">להוסיף גם ליום הזה?</p>
                <ul className="max-h-24 overflow-y-auto overscroll-contain space-y-1 pl-1">
                  {savedRecs.map((r) => {
                    const added = addedRecIds.has(r.id);
                    return (
                      <li
                        key={r.id}
                        className={`text-[12px] flex items-center gap-1.5 ${
                          added ? "text-muted-foreground" : "text-foreground"
                        }`}
                      >
                        {added && <Check size={12} className="shrink-0 text-[color:var(--accent)]" />}
                        <span className="truncate">{r.name}</span>
                        {added && <span className="shrink-0 text-[11px]">כבר ביום</span>}
                      </li>
                    );
                  })}
                </ul>
                {pendingRecs.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground">
                    כל המקומות שנשמרו כבר נמצאים ביום הזה.
                  </p>
                ) : (
                  <>
                    <p className="text-[11px] text-muted-foreground">
                      המקומות כבר נשמרו ברשימת ההמלצות. ההוספה ליום מתבצעת רק בלחיצה.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        if (addToDay.isPending || targetIds.length === 0) return;
                        addToDay.mutate(targetIds);
                      }}
                      disabled={addToDay.isPending}
                      className="w-full h-10 rounded-lg border border-[color:var(--accent)] text-[color:var(--accent)] text-sm flex items-center justify-center gap-2 disabled:opacity-40"
                    >
                      {addToDay.isPending && <Loader2 size={16} className="animate-spin" />}
                      {addToDay.isPending
                        ? "מוסיף…"
                        : retryRecs.length > 0
                          ? `נסו שוב (${retryRecs.length})`
                          : `הוסיפו ליום הזה (${pendingRecs.length})`}
                    </button>
                  </>
                )}
              </div>
            )}

            {results.length > 0 && (
              <div className="rounded-xl border border-border bg-card p-3 space-y-2">
                {actionCount === 0 ? (
                  <p className="text-[12px] text-muted-foreground text-center">
                    בחרו מקומות להוספה
                  </p>
                ) : (
                  <p className="text-[12px] text-center">
                    {actionCount} נבחרו
                    {selectedHidden > 0 && (
                      <span className="text-muted-foreground"> · {selectedHidden} מוסתרים</span>
                    )}
                  </p>
                )}
                {fromDay ? (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={saveAndAddSelected}
                      disabled={actionCount === 0 || busy}
                      className="flex-1 h-11 rounded-lg bg-[color:var(--accent)] text-white text-sm flex items-center justify-center gap-2 disabled:opacity-40"
                    >
                      {saveAndAdd.isPending && <Loader2 size={16} className="animate-spin" />}
                      {saveAndAdd.isPending
                        ? "שומר ומוסיף…"
                        : `שמרו והוסיפו ${dayLabel}${actionCount > 0 ? ` (${actionCount})` : ""}`}
                    </button>
                    <button
                      type="button"
                      onClick={saveSelected}
                      disabled={actionCount === 0 || busy}
                      className="h-11 px-4 rounded-lg border border-[color:var(--accent)] text-[color:var(--accent)] text-sm flex items-center justify-center gap-2 disabled:opacity-40"
                    >
                      {save.isPending && <Loader2 size={16} className="animate-spin" />}
                      שמירה בלבד
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={saveSelected}
                    disabled={selectedFresh.length === 0 || save.isPending}
                    className="w-full h-11 rounded-lg bg-[color:var(--accent)] text-white text-sm flex items-center justify-center gap-2 disabled:opacity-40"
                  >
                    {save.isPending && <Loader2 size={16} className="animate-spin" />}
                    {save.isPending
                      ? "שומר…"
                      : failedIds.size > 0
                        ? `נסו שוב (${selectedFresh.length})`
                        : `הוסיפו להמלצות שלי${selectedFresh.length > 0 ? ` (${selectedFresh.length})` : ""}`}
                  </button>
                )}
                <p className="text-[10px] text-muted-foreground text-center">
                  נתוני המקומות והתמונות מ־Google
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
