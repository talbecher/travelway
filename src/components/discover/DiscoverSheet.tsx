import { useEffect, useState } from "react";
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
  const la2 = (bLat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Result of adding saved recommendations to a specific day. */
export type AddToDayResult = { added: number; skipped: number; failed: string[] };

export function DiscoverSheet({
  open,
  onOpenChange,
  defaultCity,
  defaultCountry,
  dayId,
  onAddToDay,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  defaultCity?: string | null;
  defaultCountry?: string | null;
  /** When the sheet is opened from a specific itinerary day. */
  dayId?: string | null;
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

  const qc = useQueryClient();
  const tripId = getActiveTripId();
  const { user } = useAuth();

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
  }, [open, dayId, tripId, user?.id]);

  // keep prefilled destination in sync when opened from different days
  useEffect(() => {
    if (!open) return;
    setCity(defaultCity ?? "");
    setCountry(defaultCountry ?? "");
  }, [open, defaultCity, defaultCountry]);

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

  const alreadySavedPlaceIds = new Set(
    (existing ?? [])
      .filter((r) => r.provider === PROVIDER && r.provider_place_id)
      .map((r) => r.provider_place_id as string),
  );

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

  const save = useMutation({
    mutationFn: async (places: DiscoverPlace[]) => {
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
    },
    onSuccess: ({ ok, failed, recs, createdIds }) => {
      setSavedIds((prev) => new Set([...prev, ...ok]));
      setFailedIds(new Set(failed));
      setSelected(new Set(failed));
      setSavedRecs((prev) => {
        const byId = new Map(prev.map((r) => [r.id, r]));
        for (const r of recs) if (!byId.has(r.id)) byId.set(r.id, r);
        return Array.from(byId.values());
      });
      setAddFailedRecIds([]);
      addRecentDiscoverIds(user?.id, tripId, createdIds);
      qc.invalidateQueries({ queryKey: ["recs"] });
      if (ok.length > 0) toast.success(`נשמרו ${ok.length} מקומות להמלצות שלי`);
      if (failed.length > 0) toast.error(`${failed.length} מקומות לא נשמרו. אפשר לנסות שוב.`);
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
  const selectedPlaces = results.filter((p) => selected.has(p.id) && !isSaved(p));

  const saveSelected = () => {
    if (save.isPending || selectedPlaces.length === 0) return;
    setFailedIds(new Set());
    save.mutate(selectedPlaces);
  };

  const showAddBlock = !!dayId && !!onAddToDay && savedRecs.length > 0;
  const pendingRecs = savedRecs.filter((r) => !addedRecIds.has(r.id));
  const retryRecs = pendingRecs.filter((r) => addFailedRecIds.includes(r.id));
  const targetIds = (retryRecs.length > 0 ? retryRecs : pendingRecs).map((r) => r.id);

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
          <div className="space-y-2">
            {results.map((p) => (
              <DiscoverCard
                key={p.id}
                place={p}
                selected={selected.has(p.id)}
                saved={isSaved(p)}
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
              <>
                <button
                  type="button"
                  onClick={saveSelected}
                  disabled={selectedPlaces.length === 0 || save.isPending}
                  className="w-full h-11 rounded-lg bg-[color:var(--accent)] text-white text-sm flex items-center justify-center gap-2 disabled:opacity-40"
                >
                  {save.isPending && <Loader2 size={16} className="animate-spin" />}
                  {save.isPending
                    ? "שומר…"
                    : failedIds.size > 0
                      ? `נסו שוב (${selectedPlaces.length})`
                      : `הוסיפו להמלצות שלי${selectedPlaces.length > 0 ? ` (${selectedPlaces.length})` : ""}`}
                </button>
                <p className="text-[10px] text-muted-foreground text-center mt-1.5">
                  נתוני המקומות והתמונות מ־Google
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
