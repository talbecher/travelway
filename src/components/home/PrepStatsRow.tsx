import { Link } from "@tanstack/react-router";
import { ChevronLeft, MapPin } from "lucide-react";

export type SavedPlacePreview = {
  id: string;
  name: string;
  type: string;
  photoUrl: string | null;
  mapsUrl: string | null;
};

function PlaceVisual({ place }: { place: SavedPlacePreview }) {
  const fallback = (
    <div className="flex h-full w-full items-center justify-center bg-surface-2 text-muted-foreground">
      <MapPin size={22} aria-hidden="true" />
    </div>
  );
  if (!place.photoUrl) return fallback;
  return (
    <div className="relative h-full w-full bg-surface-2">
      <img
        src={place.photoUrl}
        alt=""
        loading="lazy"
        className="h-full w-full object-cover"
        onError={(event) => {
          event.currentTarget.style.display = "none";
          event.currentTarget.nextElementSibling?.removeAttribute("hidden");
        }}
      />
      <div hidden className="absolute inset-0">{fallback}</div>
    </div>
  );
}

/** Visual preview of the same active-trip records used by the saved count. */
export function SavedPlacesRow({ places }: { places: SavedPlacePreview[] }) {
  if (places.length === 0) return null;
  const visible = places.slice(0, 2);
  return (
    <section className="space-y-2.5">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
        <h2 className="min-w-0 break-words text-[17px] font-semibold">המקומות ששמרתם</h2>
        <Link to="/recommendations" className="inline-flex min-h-11 shrink-0 items-center gap-1 text-[12px] text-muted-foreground">
          לכל {places.length} המקומות
          <ChevronLeft size={14} aria-hidden="true" />
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        {visible.map((place) => {
          const content = (
            <>
              <div className="h-[96px] overflow-hidden rounded-lg sm:h-[106px]">
                <PlaceVisual place={place} />
              </div>
              <span className="line-clamp-2 px-0.5 pt-1.5 text-[12px] font-medium leading-snug">{place.name}</span>
            </>
          );
          const className = "min-w-0 rounded-lg text-right focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
          return place.mapsUrl ? (
            <a key={place.id} href={place.mapsUrl} target="_blank" rel="noreferrer" className={className}>{content}</a>
          ) : (
            <Link key={place.id} to="/recommendations" className={className}>{content}</Link>
          );
        })}
      </div>
    </section>
  );
}
