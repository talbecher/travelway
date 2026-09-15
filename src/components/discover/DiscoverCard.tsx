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
  saved = false,
  inDay = false,
  dayId = null,
  maybeDuplicate = false,
  failed = false,
}: {
  place: DiscoverPlace;
  selected: boolean;
  onToggle: () => void;
  /** exists in the trip recommendations, not linked to this day */
  saved?: boolean;
  /** already linked to the day the sheet was opened from */
  inDay?: boolean;
  /** day context — saved places can be selected for add-to-day when set */
  dayId?: string | null;
  maybeDuplicate?: boolean;
  failed?: boolean;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const showImg = !!place.photoUrl && !imgFailed;
  // selectable: fresh places always; saved places only to add them to the day
  const selectable = !inDay && (!saved || !!dayId);
  const toggle = () => {
    if (!selectable) return;
    onToggle();
  };

  return (
    <div
      className={`flex gap-3 p-2.5 rounded-xl border bg-card ${
        selected ? "border-[color:var(--accent)]" : "border-border"
      } ${!selectable ? "opacity-70" : ""}`}
    >
      <button
        type="button"
        disabled={!selectable}
        onClick={toggle}
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
          {inDay ? (
            <span className="shrink-0 inline-flex items-center gap-1 text-[11px] text-[color:var(--accent)]">
              <Check size={13} /> ביום זה ✓
            </span>
          ) : saved ? (
            selectable ? (
              <button
                type="button"
                onClick={toggle}
                aria-label={selected ? `בטל בחירה ב${place.name} להוספה ליום` : `הוסף את ${place.name} ליום`}
                aria-pressed={selected}
                className={`shrink-0 inline-flex items-center gap-1.5 text-[11px] text-[color:var(--accent)] min-h-0`}
              >
                <span className="inline-flex items-center gap-1">
                  <Check size={13} /> נשמר ✓
                </span>
                <span
                  className={`w-5 h-5 rounded-md border flex items-center justify-center ${
                    selected
                      ? "bg-[color:var(--accent)] text-white border-transparent"
                      : "border-border text-transparent"
                  }`}
                >
                  <Check size={12} />
                </span>
              </button>
            ) : (
              <span className="shrink-0 inline-flex items-center gap-1 text-[11px] text-[color:var(--accent)]">
                <Check size={13} /> נשמר ✓
              </span>
            )
          ) : (
            <button
              type="button"
              onClick={toggle}
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
          )}
        </div>

        <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{explanation(place)}</p>

        {saved && !inDay && (
          <p className="text-[11px] text-muted-foreground mt-0.5">כבר קיים ברשימת ההמלצות</p>
        )}
        {!saved && !inDay && maybeDuplicate && (
          <p className="text-[11px] text-muted-foreground mt-0.5">ייתכן שכבר קיים ברשימת ההמלצות</p>
        )}
        {failed && <p className="text-[11px] text-[color:var(--accent-2)] mt-0.5">השמירה נכשלה</p>}

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
