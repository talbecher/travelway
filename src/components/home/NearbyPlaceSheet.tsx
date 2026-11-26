import { useEffect, useState } from "react";
import { MapIcon, Navigation } from "lucide-react";
import { BottomSheet } from "@/components/BottomSheet";
import { RecDescription } from "@/components/RecDescription";
import type { LatLng } from "@/lib/coords";
import { nearbyPlaceSheetModel, type NearbyPlaceSheetRec } from "@/lib/nearby-place-sheet";

export type NearbyPlaceSelection = {
  rec: NearbyPlaceSheetRec & { id: string };
  point: LatLng | null;
  distance: number | null;
};

const primaryClass =
  "flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-[color:var(--accent)] px-3.5 text-[15px] font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const secondaryClass =
  "flex min-h-12 w-full items-center gap-3 rounded-xl border border-border bg-card px-3.5 text-right text-[14px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Details of a saved place from the home "near you" card: name, type, distance, description, navigate. */
export function NearbyPlaceSheet({
  place,
  onClose,
}: {
  place: NearbyPlaceSelection | null;
  onClose: () => void;
}) {
  // Keep the last place while the sheet animates closed.
  const [shown, setShown] = useState(place);
  useEffect(() => {
    if (place) setShown(place);
  }, [place]);

  const model = shown ? nearbyPlaceSheetModel(shown.rec, shown.point, shown.distance) : null;
  const meta = model
    ? [model.typeLabel, model.distanceText && `${model.distanceText} בקו אווירי`].filter(Boolean)
    : [];

  return (
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
              onClick={onClose}
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
        </div>
      )}
    </BottomSheet>
  );
}
