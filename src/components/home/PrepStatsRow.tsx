import { Link } from "@tanstack/react-router";
import { ChevronLeft, MapPin, UtensilsCrossed, BedDouble, Landmark } from "lucide-react";
import { useState } from "react";

export type SavedPlacePreview = {
  id: string;
  name: string;
  type: string;
  photoUrl: string | null;
  mapsUrl: string | null;
};

function TypeIcon({ type, size = 16 }: { type: string; size?: number }) {
  if (type === "food") return <UtensilsCrossed size={size} aria-hidden="true" />;
  if (type === "hotel") return <BedDouble size={size} aria-hidden="true" />;
  if (type === "attraction") return <Landmark size={size} aria-hidden="true" />;
  return <MapPin size={size} aria-hidden="true" />;
}

const linkClass =
  "min-w-0 rounded-lg text-right focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function PlaceLink({ place, children }: { place: SavedPlacePreview; children: React.ReactNode }) {
  return place.mapsUrl ? (
    <a href={place.mapsUrl} target="_blank" rel="noreferrer" className={linkClass}>
      {children}
    </a>
  ) : (
    <Link to="/recommendations" className={linkClass}>
      {children}
    </Link>
  );
}

/** Visual preview of the same active-trip records used by the saved count. */
export function SavedPlacesRow({ places }: { places: SavedPlacePreview[] }) {
  const visible = places.slice(0, 2);
  const [broken, setBroken] = useState<Record<string, true>>({});
  if (visible.length === 0) return null;

  const hasPhoto = (p: SavedPlacePreview) => Boolean(p.photoUrl) && !broken[p.id];
  const allPhotos = visible.every(hasPhoto);

  return (
    <section className="space-y-2.5">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
        <h2 className="min-w-0 break-words text-[17px] font-semibold">המקומות ששמרתם</h2>
        <Link
          to="/recommendations"
          className="inline-flex min-h-11 shrink-0 items-center gap-1 text-[12px] text-muted-foreground"
        >
          לכל {places.length} המקומות
          <ChevronLeft size={14} aria-hidden="true" />
        </Link>
      </div>

      {allPhotos ? (
        <div className="grid grid-cols-2 gap-2.5">
          {visible.map((place) => (
            <PlaceLink key={place.id} place={place}>
              <div className="h-[92px] overflow-hidden rounded-lg bg-surface-2 sm:h-[102px]">
                <img
                  src={place.photoUrl ?? undefined}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover"
                  onError={() => setBroken((prev) => ({ ...prev, [place.id]: true }))}
                />
              </div>
              <span className="line-clamp-2 px-0.5 pt-1.5 text-[12px] font-medium leading-snug">{place.name}</span>
            </PlaceLink>
          ))}
        </div>
      ) : (
        <div className="space-y-1.5">
          {visible.map((place) => (
            <PlaceLink key={place.id} place={place}>
              <div className="flex min-h-11 items-center gap-2.5 rounded-lg bg-card px-2.5 py-2 shadow-sm">
                {hasPhoto(place) ? (
                  <img
                    src={place.photoUrl ?? undefined}
                    alt=""
                    loading="lazy"
                    className="h-10 w-10 shrink-0 rounded-md object-cover"
                    onError={() => setBroken((prev) => ({ ...prev, [place.id]: true }))}
                  />
                ) : (
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-surface-2 text-muted-foreground">
                    <TypeIcon type={place.type} />
                  </span>
                )}
                <span className="min-w-0 line-clamp-2 text-[13px] font-medium leading-snug">{place.name}</span>
              </div>
            </PlaceLink>
          ))}
        </div>
      )}
    </section>
  );
}
