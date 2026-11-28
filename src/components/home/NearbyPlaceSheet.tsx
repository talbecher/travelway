import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarPlus, Check, MapIcon, MapPin, Navigation } from "lucide-react";
import { BottomSheet } from "@/components/BottomSheet";
import { RecDescription } from "@/components/RecDescription";
import { DaySuggestionPicker } from "@/components/DaySuggestionPicker";
import { RatingSheet } from "@/components/RatingSheet";
import { useDays, useRecs } from "@/hooks/use-trip";
import { assertOnline } from "@/hooks/use-online";
import { addRecommendationToDay, markRecommendationVisited } from "@/lib/recommendations";
import type { LatLng } from "@/lib/coords";
import { nearbyPlaceSheetModel, type NearbyPlaceSheetRec } from "@/lib/nearby-place-sheet";

export type NearbyPlaceSelection = {
  rec: NearbyPlaceSheetRec & { id: string };
  point: LatLng | null;
  distance: number | null;
};

const primaryClass =
  "flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-[color:var(--accent)] px-3.5 text-[15px] font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const actionClass =
  "flex min-h-12 w-full items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-2 text-center text-[13px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60";
const statusClass =
  "flex min-h-12 w-full items-center justify-center gap-1.5 rounded-xl bg-muted px-2 text-center text-[13px] font-medium text-muted-foreground";
const secondaryClass =
  "flex min-h-12 w-full items-center gap-3 rounded-xl border border-border bg-card px-3.5 text-right text-[14px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** The home's current itinerary day, and which recommendations it already links. */
export type NearbyToday = { dayId: string; dayNumber: number; linkedRecIds: ReadonlySet<string> };

/**
 * Details of a saved place from the home "near you" card: name, type, distance, description,
 * navigate, plus "add to day" and "we were here" on the existing recommendation (never a new one).
 */
export function NearbyPlaceSheet({
  place,
  onClose,
  today = null,
  onNavigate,
}: {
  place: NearbyPlaceSelection | null;
  onClose: () => void;
  today?: NearbyToday | null;
  /** Called on "נווט" before the link opens; must not block navigation. */
  onNavigate?: (recId: string) => void;
}) {
  // Keep the last place while the sheet animates closed.
  const [shown, setShown] = useState(place);
  useEffect(() => {
    if (place) setShown(place);
  }, [place]);

  const qc = useQueryClient();
  const { data: recs } = useRecs();
  const { data: days = [] } = useDays();
  // Live row (status, rating, location) — the selection is a snapshot from when the row was tapped.
  const live = shown ? recs?.find((r) => r.id === shown.rec.id) ?? null : null;
  const [pickerOpen, setPickerOpen] = useState(false);
  const [rating, setRating] = useState<{ id: string; name: string; rating?: number; review?: string } | null>(null);
  const busyRef = useRef(false);

  const inToday = !!(today && live && today.linkedRecIds.has(live.id));
  const visited = live?.status === "visited";

  const refreshHome = () => {
    // Prefix keys: the home summary, day screens and the recommendations list all refetch.
    qc.invalidateQueries({ queryKey: ["day-entries-summary"] });
    qc.invalidateQueries({ queryKey: ["day-entries"] });
    qc.invalidateQueries({ queryKey: ["recs"] });
    qc.invalidateQueries({ queryKey: ["linked-recs"] });
  };

  // Same call and toast as "הוסף ליום" on the recommendations screen (linked_recommendation_id,
  // stored location, insertDayEntry ordering).
  const addToDay = useMutation({
    mutationFn: async (dayId: string) => {
      if (!live) throw new Error("המקום לא נמצא");
      await addRecommendationToDay(live, dayId);
    },
    onSettled: () => { busyRef.current = false; },
    onSuccess: () => {
      refreshHome();
      toast.success("נוסף ליום");
      setPickerOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const markVisited = useMutation({
    mutationFn: async () => {
      if (!live) throw new Error("המקום לא נמצא");
      await markRecommendationVisited(live);
      return live;
    },
    onSettled: () => { busyRef.current = false; },
    onSuccess: (rec) => {
      refreshHome();
      toast.success("✅ סומן שביקרתם");
      onClose();
      // Same optional rating step as after "היינו כאן".
      setRating({ id: rec.id, name: rec.name, rating: rec.rating ?? undefined, review: rec.review ?? undefined });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pickDay = (dayId: string) => {
    if (busyRef.current || !assertOnline()) return;
    if (today && dayId === today.dayId && inToday) {
      toast("כבר ביום הזה");
      return;
    }
    busyRef.current = true;
    addToDay.mutate(dayId);
  };
  const busy = addToDay.isPending || markVisited.isPending;

  const model = shown ? nearbyPlaceSheetModel(shown.rec, shown.point, shown.distance) : null;
  const meta = model
    ? [model.typeLabel, model.distanceText && `${model.distanceText} בקו אווירי`].filter(Boolean)
    : [];

  return (
    <>
    <BottomSheet
      open={!!place}
      onOpenChange={(o) => !o && onClose()}
      title={model?.name ?? ""}
      description="פרטי מקום שמור"
    >
      {model && shown && (
        <div className="space-y-2 pb-1" data-nearby-place-sheet>
          {meta.length > 0 && (
            <p className="-mt-1 px-0.5 text-[12px] text-muted-foreground" data-nearby-place-meta>
              {meta.map((part, i) => (
                <span key={i}>
                  {i > 0 && " · "}
                  <bdi>{part}</bdi>
                </span>
              ))}
            </p>
          )}
          {model.description && (
            <div className="px-0.5 pb-1" data-nearby-place-description>
              <RecDescription key={shown.rec.id} text={model.description} />
            </div>
          )}
          {model.navigateHref && (
            <a
              href={model.navigateHref}
              target="_blank"
              rel="noreferrer"
              className={primaryClass}
              onClick={() => {
                onNavigate?.(shown.rec.id);
                onClose();
              }}
            >
              <Navigation size={18} aria-hidden="true" />
              <span>נווט</span>
            </a>
          )}
          {model.openMapHref && (
            <a
              href={model.openMapHref}
              target="_blank"
              rel="noreferrer"
              className={secondaryClass}
              onClick={onClose}
            >
              <MapIcon
                size={18}
                className="shrink-0 text-[color:var(--accent)]"
                aria-hidden="true"
              />
              <span className="flex-1">פתח ב‑Google Maps</span>
            </a>
          )}
          {live && (
            <div className="grid grid-cols-2 gap-2 pt-1" data-nearby-place-actions>
              {today && inToday ? (
                <div className={statusClass} data-nearby-in-today>
                  <Check size={16} aria-hidden="true" /> כבר ביום הזה
                </div>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => (today ? pickDay(today.dayId) : setPickerOpen(true))}
                  className={actionClass}
                >
                  <CalendarPlus size={16} className="shrink-0 text-[color:var(--accent)]" aria-hidden="true" />
                  <span>{today ? `הוסף להיום · יום ${today.dayNumber}` : "הוסף ליום"}</span>
                </button>
              )}
              {visited ? (
                <div className={statusClass} data-nearby-visited>
                  ביקרתם ✓
                </div>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (busyRef.current || !assertOnline()) return;
                    busyRef.current = true;
                    markVisited.mutate();
                  }}
                  className={actionClass}
                >
                  <MapPin size={16} className="shrink-0 text-action-visited" aria-hidden="true" />
                  <span>היינו כאן</span>
                </button>
              )}
              {today && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setPickerOpen(true)}
                  className="col-span-2 min-h-11 text-[12px] font-medium text-[color:var(--accent)] disabled:opacity-60"
                >
                  להוסיף ליום אחר
                </button>
              )}
            </div>
          )}
        </div>
      )}
      {live && (
        <BottomSheet open={pickerOpen} onOpenChange={setPickerOpen} title={`הוסף את ${live.name} ליום`}>
          <DaySuggestionPicker rec={live} days={days} disabled={busy} onPick={pickDay} />
        </BottomSheet>
      )}
    </BottomSheet>
    {/* Outside the details sheet: it closes when the rating step opens. */}
    {rating && (
      <RatingSheet
        recId={rating.id}
        recName={rating.name}
        initialRating={rating.rating}
        initialReview={rating.review}
        onClose={() => setRating(null)}
      />
    )}
    </>
  );
}
