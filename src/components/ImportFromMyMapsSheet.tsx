import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, MapPin, AlertTriangle } from "lucide-react";
import { BottomSheet } from "@/components/BottomSheet";
import { fetchMyMapKml, type ImportedPlace } from "@/lib/maps-import.functions";
import { enrichRecommendationPhoto } from "@/lib/places.functions";
import { supabase } from "@/integrations/supabase/client";
import { getActiveTripId } from "@/lib/constants";
import { assertOnline } from "@/hooks/use-online";

type Step = "url" | "preview";

const TYPE_ICON: Record<ImportedPlace["suggested_type"], string> = {
  food: "🍜",
  attraction: "⛩",
  hotel: "🏨",
};

type InsertRow = {
  trip_id: string;
  type: ImportedPlace["suggested_type"];
  city: string | null;
  name: string;
  notes: string | null;
  latitude: number | null;
  longitude: number | null;
  google_maps_url: string | null;
  photo_url: string | null;
  google_rating: number | null;
  google_rating_count: number | null;
  status: "wishlist";
};

export function ImportFromMyMapsSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const qc = useQueryClient();
  const fetchKml = useServerFn(fetchMyMapKml);
  const enrichFn = useServerFn(enrichRecommendationPhoto);
  const [step, setStep] = useState<Step>("url");
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [places, setPlaces] = useState<ImportedPlace[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [city, setCity] = useState("");
  const [enriching, setEnriching] = useState<{ done: number; total: number } | null>(null);

  const reset = () => {
    setStep("url");
    setUrl("");
    setPlaces([]);
    setSelected(new Set());
    setCity("");
    setLoading(false);
    setEnriching(null);
  };

  const handleClose = (o: boolean) => {
    if (!o) reset();
    onOpenChange(o);
  };

  const doFetch = async () => {
    if (!url.trim()) {
      toast.error("הדבק לינק");
      return;
    }
    setLoading(true);
    try {
      const result = await fetchKml({ data: { url: url.trim() } });
      setPlaces(result);
      setSelected(new Set(result.map((_, i) => i)));
      setStep("preview");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setLoading(false);
    }
  };

  const toggle = (i: number) => {
    const next = new Set(selected);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    setSelected(next);
  };
  const selectAll = () => setSelected(new Set(places.map((_, i) => i)));
  const clearAll = () => setSelected(new Set());

  const importMut = useMutation({
    mutationFn: async () => {
      const chosen = places.filter((_, i) => selected.has(i));
      if (chosen.length === 0) throw new Error("לא נבחרו מקומות");
      const enteredCity = city.trim() || null;
      const payloads: InsertRow[] = chosen.map((p) => ({
        trip_id: getActiveTripId(),
        type: p.suggested_type,
        city: enteredCity,
        name: p.name,
        notes: p.description,
        latitude: p.latitude,
        longitude: p.longitude,
        google_maps_url: p.google_maps_url,
        photo_url: null,
        google_rating: null,
        google_rating_count: null,
        status: "wishlist",
      }));

      setEnriching({ done: 0, total: payloads.length });
      const BATCH = 5;
      for (let i = 0; i < payloads.length; i += BATCH) {
        const sliceIdx = payloads.slice(i, i + BATCH);
        const results = await Promise.all(
          sliceIdx.map((p) =>
            p.latitude != null && p.longitude != null
              ? enrichFn({
                  data: {
                    name: p.name,
                    city: p.city,
                    lat: p.latitude,
                    lng: p.longitude,
                  },
                }).catch(() => null)
              : Promise.resolve(null),
          ),
        );
        results.forEach((r, k) => {
          if (r?.updated) {
            const idx = i + k;
            payloads[idx].photo_url = r.photo_url;
            payloads[idx].google_rating = r.google_rating;
            payloads[idx].google_rating_count = r.google_rating_count;
          }
        });
        setEnriching({ done: Math.min(i + BATCH, payloads.length), total: payloads.length });
      }

      const { error } = await supabase.from("recommendations").insert(payloads);
      if (error) throw error;
      return payloads.length;
    },
    onSuccess: (n) => {
      qc.invalidateQueries({ queryKey: ["recs", getActiveTripId()] });
      qc.invalidateQueries({ queryKey: ["recs"] });
      toast.success(`✅ יובאו ${n} המלצות בהצלחה`);
      handleClose(false);
    },
    onError: (e: Error) => {
      setEnriching(null);
      toast.error(e.message);
    },
  });

  const selectedCount = selected.size;

  return (
    <BottomSheet open={open} onOpenChange={handleClose} title="ייבוא מ-Google My Maps">
      {step === "url" && (
        <div className="pt-2 space-y-4">
          <p className="text-sm text-muted-foreground">הדבק לינק של מפה ציבורית</p>
          <input
            dir="ltr"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.google.com/maps/d/..."
            className="w-full h-11 rounded-lg border border-border bg-background px-3 text-sm"
          />
          <button
            onClick={doFetch}
            disabled={loading}
            className="w-full h-11 rounded-lg bg-[color:var(--accent)] text-white text-sm flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {loading && <Loader2 size={16} className="animate-spin" />}
            המשך
          </button>
        </div>
      )}

      {step === "preview" && (
        <div className="pt-2 space-y-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">עיר (אופציונלי)</label>
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="לדוגמה: Tokyo"
              className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm"
              dir="ltr"
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              נמצאו {places.length} · נבחרו {selectedCount}
            </div>
            <div className="flex gap-2">
              <button onClick={selectAll} className="text-xs text-[color:var(--accent)]">
                בחר הכל
              </button>
              <button onClick={clearAll} className="text-xs text-muted-foreground">
                בטל הכל
              </button>
            </div>
          </div>
          <div className="max-h-[45vh] overflow-y-auto space-y-1.5 -mx-1 px-1">
            {places.map((p, i) => (
              <label
                key={i}
                className="flex items-start gap-2 p-2 rounded-lg border border-border bg-background cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selected.has(i)}
                  onChange={() => toggle(i)}
                  className="mt-1"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="inline-flex items-center justify-center h-5 min-w-5 px-1 rounded-full bg-muted text-[11px] shrink-0">
                      {TYPE_ICON[p.suggested_type]}
                    </span>
                    <span className="text-sm font-medium truncate">{p.name}</span>
                    {p.hasCoords ? (
                      <MapPin size={12} className="text-[color:var(--accent-3)] shrink-0" />
                    ) : (
                      <AlertTriangle size={12} className="text-amber-500 shrink-0" />
                    )}
                  </div>
                  {p.description && (
                    <div className="text-xs text-muted-foreground truncate">{p.description}</div>
                  )}
                </div>
              </label>
            ))}
          </div>
          <button
            onClick={() => { if (!assertOnline()) return; importMut.mutate(); }}
            disabled={importMut.isPending || selectedCount === 0}
            className="w-full h-11 rounded-lg bg-[color:var(--accent)] text-white text-sm flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {importMut.isPending && <Loader2 size={16} className="animate-spin" />}
            ייבא {selectedCount} מקומות
          </button>
          {importMut.isPending && enriching && (
            <div className="text-xs text-muted-foreground text-center">
              🔍 מעשיר נתונים... {enriching.done}/{enriching.total}
            </div>
          )}
        </div>
      )}
    </BottomSheet>
  );
}
