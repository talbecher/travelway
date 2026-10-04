import { useEffect, useId, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Search, X } from "lucide-react";
import {
  autocompletePlaces,
  getPlaceDetails,
  getPlacePhotoUrl,
  type PlaceSuggestion,
} from "@/lib/places.functions";

export type SelectedPlace = {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  google_maps_url: string;
  photo_url: string | null;
  city: string | null;
  rating: number | null;
  userRatingCount: number | null;
  primaryType?: string | null;
  /** Google place id (provider_place_id). */
  placeId?: string;
};

function newToken(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

export type PickedSuggestion = { placeId: string; label: string; sessionToken: string };

export function PlacesSearch({
  onSelect,
  placeholder = "חפש מקום...",
  autoFocus = false,
  fieldProfile = "default",
  suggestionOnly = false,
  onPick,
  initialQuery,
}: {
  onSelect: (place: SelectedPlace) => void;
  placeholder?: string;
  autoFocus?: boolean;
  /** "expense": skip photo/rating fields and the Photo Media call. Default keeps existing behavior. */
  fieldProfile?: "default" | "expense";
  /** When true, picking a suggestion only reports it via onPick — no Details/photo calls. */
  suggestionOnly?: boolean;
  /** suggestionOnly mode: called with the picked suggestion, or null when the pick is invalidated. */
  onPick?: (pick: PickedSuggestion | null) => void;
  /** Initial input text (not a selection). */
  initialQuery?: string;
}) {
  const autocomplete = useServerFn(autocompletePlaces);
  const details = useServerFn(getPlaceDetails);
  const getPhoto = useServerFn(getPlacePhotoUrl);

  const listId = useId();
  const [query, setQuery] = useState(initialQuery ?? "");
  const [results, setResults] = useState<PlaceSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [detailsError, setDetailsError] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [pickingId, setPickingId] = useState<string | null>(null);

  const wrapRef = useRef<HTMLDivElement>(null);
  const seqRef = useRef(0);
  const tokenRef = useRef<string | null>(null);
  const pickingRef = useRef(false);
  const mountedRef = useRef(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      seqRef.current++;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  async function run(q: string, my: number) {
    if (!tokenRef.current) tokenRef.current = newToken();
    const token = tokenRef.current;
    setLoading(true);
    setError(false);
    try {
      const r = await autocomplete({ data: { input: q, sessionToken: token } });
      if (!mountedRef.current || my !== seqRef.current) return;
      if (r.error) {
        setError(true);
        setResults([]);
        return;
      }
      setResults(r.suggestions);
      setActive(-1);
    } catch {
      if (mountedRef.current && my === seqRef.current) {
        setError(true);
        setResults([]);
      }
    } finally {
      if (mountedRef.current && my === seqRef.current) setLoading(false);
    }
  }

  function onChange(v: string) {
    const my = ++seqRef.current; // invalidate any in-flight response immediately
    setQuery(v);
    setOpen(true);
    setDetailsError(false);
    setActive(-1);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (v.trim().length < 2) {
      setResults([]);
      setLoading(false);
      setError(false);
      if (!v.trim()) tokenRef.current = null; // abandoned session
      return;
    }
    debounceRef.current = setTimeout(() => void run(v.trim(), my), 400);
  }

  function clear() {
    seqRef.current++;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    tokenRef.current = null;
    pickingRef.current = false;
    setPickingId(null);
    setQuery("");
    setResults([]);
    setOpen(false);
    setError(false);
    setDetailsError(false);
    setActive(-1);
  }

  async function pick(s: PlaceSuggestion) {
    if (pickingRef.current) return;
    pickingRef.current = true;
    const my = seqRef.current;
    const token = tokenRef.current ?? newToken();
    tokenRef.current = null; // Details ends the session; never reuse
    setPickingId(s.placeId);
    setDetailsError(false);
    const stale = () => !mountedRef.current || my !== seqRef.current;
    try {
      const r = await details({ data: { placeId: s.placeId, sessionToken: token, profile: fieldProfile } });
      if (stale()) return;
      if (!r.place) {
        setDetailsError(true);
        return;
      }
      const p = r.place;
      let photo_url: string | null = null;
      if (fieldProfile !== "expense" && p.photoName) {
        try {
          const ph = await getPhoto({ data: { photoName: p.photoName, maxWidthPx: 400 } });
          photo_url = ph.url;
        } catch {
          photo_url = null;
        }
      }
      if (stale()) return;
      onSelect({
        name: p.name,
        address: p.address,
        latitude: p.latitude,
        longitude: p.longitude,
        google_maps_url: p.google_maps_url,
        photo_url,
        city: p.city,
        rating: p.rating,
        userRatingCount: p.userRatingCount,
        primaryType: p.primaryType,
        placeId: p.id,
      });
      seqRef.current++;
      setOpen(false);
      setQuery("");
      setResults([]);
    } catch {
      if (!stale()) setDetailsError(true);
    } finally {
      pickingRef.current = false;
      if (mountedRef.current) setPickingId(null);
    }
  }

  const showList = open && query.trim().length >= 2;
  const activeId = active >= 0 && results[active] ? `${listId}-opt-${active}` : undefined;

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <Search
          size={16}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
        />
        <input
          type="text"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeId}
          value={query}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => query && setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setOpen(false);
              return;
            }
            if (e.key === "ArrowDown" && results.length) {
              e.preventDefault();
              setOpen(true);
              setActive((a) => (a + 1) % results.length);
              return;
            }
            if (e.key === "ArrowUp" && results.length) {
              e.preventDefault();
              setActive((a) => (a <= 0 ? results.length - 1 : a - 1));
              return;
            }
            if (e.key === "Enter") {
              e.preventDefault();
              if (showList && active >= 0 && results[active]) void pick(results[active]);
            }
          }}
          autoFocus={autoFocus}
          placeholder={placeholder}
          dir="rtl"
          className="w-full rounded-lg bg-background border border-input pr-9 pl-9 h-11 outline-none focus:border-[color:var(--accent)]"
        />
        {query && (
          <button
            type="button"
            aria-label="נקה"
            onClick={clear}
            className="absolute left-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center text-muted-foreground min-h-0"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {showList && (
        <div className="absolute z-30 left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg max-h-[320px] overflow-y-auto">
          {detailsError && (
            <div className="p-3 text-xs text-[color:var(--accent-2)]" role="alert">
              לא הצלחנו לטעון את פרטי המקום — נסה שוב
            </div>
          )}
          {loading && (
            <div className="p-3 text-xs text-muted-foreground flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-muted-foreground animate-pulse" />
              מחפש...
            </div>
          )}
          {!loading && error && (
            <div className="p-3 text-xs text-[color:var(--accent-2)]">שגיאה בחיפוש — נסה שוב</div>
          )}
          {!loading && !error && results.length === 0 && (
            <div className="p-3 text-xs text-muted-foreground">לא נמצאו תוצאות</div>
          )}
          {!loading && !error && results.length > 0 && (
            <ul id={listId} role="listbox" aria-label="הצעות מקומות">
              {results.map((r, i) => (
                <li
                  key={r.placeId}
                  id={`${listId}-opt-${i}`}
                  role="option"
                  aria-selected={i === active}
                  aria-disabled={pickingId !== null}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => void pick(r)}
                  className={
                    "w-full text-right flex items-center gap-2 p-2 border-b border-border last:border-b-0 cursor-pointer " +
                    (i === active ? "bg-muted" : "hover:bg-muted/50") +
                    (pickingId && pickingId !== r.placeId ? " opacity-50" : "")
                  }
                >
                  <div className="w-9 h-9 rounded-md bg-muted shrink-0 flex items-center justify-center text-base">
                    {pickingId === r.placeId ? (
                      <span className="inline-block w-2 h-2 rounded-full bg-muted-foreground animate-pulse" />
                    ) : (
                      "📍"
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate" dir="auto">
                      {r.main}
                    </div>
                    {r.secondary && (
                      <div className="text-[11px] text-muted-foreground truncate" dir="auto">
                        {r.secondary}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
