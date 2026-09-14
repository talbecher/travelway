import { useState } from "react";
import { Star, ExternalLink, Check, MapPin } from "lucide-react";
import type { DiscoverPlace } from "@/lib/discover.functions";

function explanation(p: DiscoverPlace): string {
  const parts: string[] = [];
  if (p.area) parts.push(`${p.categoryLabel} באזור ${p.area}`);
  else parts.push(p.categoryLabel);
  if (p.rating != null && p.ratingCount != null) {
    parts.push(`מדורג ${p.rating} על בסיס ${p.ratingCount} ביקורות`);
  } else if (p.rating != null) {
    parts.push(`מדורג ${p.rating}`);
  }
  return parts.join(", ");
}

export function DiscoverCard({
  place,
  selected,
  onToggle,
}: {
  place: DiscoverPlace;
  selected: boolean;
  onToggle: () => void;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const showImg = !!place.photoUrl && !imgFailed;

  return (
    <div
      className={`flex gap-3 p-2.5 rounded-xl border bg-card ${
        selected ? "border-[color:var(--accent)]" : "border-border"
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-label={selected ? `בטל בחירה ב${place.name}` : `בחר את ${place.name}`}
        aria-pressed={selected}
        className={`shrink-0 w-[72px] h-[72px] rounded-lg overflow-hidden flex items-center justify-center min-h-0 p-0 ${
          showImg ? "" : "bg-muted text-muted-foreground"
        }`}
      >
        {showImg ? (
          <img
            src={place.photoUrl!}
            alt=""
            loading="lazy"
            onError={() => setImgFailed(true)}
            className="w-full h-full object-cover"
          />
        ) : (
          <MapPin size={22} />
        )}
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2">
          <h3 className="text-sm font-medium leading-snug flex-1 min-w-0 truncate">{place.name}</h3>
          <button
            type="button"
            onClick={onToggle}
            aria-label={selected ? `בטל בחירה ב${place.name}` : `בחר את ${place.name}`}
            aria-pressed={selected}
            className={`shrink-0 w-6 h-6 rounded-md border flex items-center justify-center min-h-0 ${
              selected
                ? "bg-[color:var(--accent)] text-white border-transparent"
                : "border-border text-transparent"
            }`}
          >
            <Check size={14} />
          </button>
        </div>

        <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{explanation(place)}</p>

        <div className="flex items-center gap-3 mt-1.5 text-[11px] text-muted-foreground">
          {place.rating != null && (
            <span className="inline-flex items-center gap-1">
              <Star size={12} className="fill-current" />
              {place.rating}
              {place.ratingCount != null && <span>({place.ratingCount})</span>}
            </span>
          )}
          <a
            href={place.googleMapsUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[color:var(--accent)]"
          >
            <ExternalLink size={12} /> Google Maps
          </a>
        </div>
      </div>
    </div>
  );
}
