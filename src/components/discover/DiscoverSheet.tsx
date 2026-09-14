import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Compass, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { BottomSheet } from "@/components/BottomSheet";
import { supabase } from "@/integrations/supabase/client";
import { getActiveTripId } from "@/lib/constants";
import { saveRecommendation } from "@/lib/recommendations";
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

type ExistingRec = {
  name: string;
  latitude: number | string | null;
  longitude: number | string | null;
  provider: string | null;
  provider_place_id: string | null;
};

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

export function DiscoverSheet({
  open,
  onOpenChange,
  defaultCity,
  defaultCountry,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  defaultCity?: string | null;
  defaultCountry?: string | null;
}) {
  const [city, setCity] = useState(defaultCity ?? "");
  const [country, setCountry] = useState(defaultCountry ?? "");
  const [interests, setInterests] = useState<DiscoverInterest[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());
  const [data, setData] = useState<DiscoverResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const qc = useQueryClient();
  const tripId = getActiveTripId();

  // reset transient state when the sheet closes — nothing persisted
  useEffect(() => {
    if (open) return;
    setSelected(new Set());
    setSavedIds(new Set());
    setFailedIds(new Set());
    setData(null);
    setErrorMsg(null);
  }, [open]);

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

  const save = useMutation({
    mutationFn: async (places: DiscoverPlace[]) => {
      const ok: string[] = [];
      const failed: string[] = [];
      for (const p of places) {
        try {
          const { data: dup, error: dupErr } = await supabase
            .from("recommendations")
            .select("id")
            .eq("trip_id", tripId)
            .eq("provider", PROVIDER)
            .eq("provider_place_id", p.id)
            .limit(1);
          if (dupErr) throw dupErr;
          if (dup && dup.length > 0) {
            ok.push(p.id);
            continue;
          }
          await saveRecommendation({
            type: p.recType,
            name: p.name,
            city: p.city,
            address: p.address || null,
            google_maps_url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
              p.name,
            )}&query_place_id=${encodeURIComponent(p.id)}`,
            latitude: p.latitude,
            longitude: p.longitude,
            provider: PROVIDER,
            provider_place_id: p.id,
          });
          ok.push(p.id);
        } catch (e) {
          const err = e as { code?: string; message?: string };
          if (err?.code === "23505" && (err.message ?? "").includes(DUP_INDEX)) {
            ok.push(p.id);
          } else {
            failed.push(p.id);
          }
        }
      }
      return { ok, failed };
    },
    onSuccess: ({ ok, failed }) => {
      setSavedIds((prev) => new Set([...prev, ...ok]));
      setFailedIds(new Set(failed));
      setSelected(new Set(failed));
      qc.invalidateQueries({ queryKey: ["recs"] });
      if (ok.length > 0) toast.success(`נשמרו ${ok.length} מקומות להמלצות שלי`);
      if (failed.length > 0) toast.error(`${failed.length} מקומות לא נשמרו. אפשר לנסות שוב.`);
    },
    onError: () => toast.error("השמירה נכשלה. נסו שוב."),
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
          <>
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

            <div className="sticky bottom-0 pt-2 bg-surface">
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
            </div>
          </>
        )}
      </div>
    </BottomSheet>
  );
}
