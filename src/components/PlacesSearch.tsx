import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Search, X } from "lucide-react";
import { searchPlaces, getPlacePhotoUrl, type PlaceResult } from "@/lib/places.functions";

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
};

export function PlacesSearch({
  onSelect,
  placeholder = "חפש מקום...",
  autoFocus = false,
}: {
  onSelect: (place: SelectedPlace) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const search = useServerFn(searchPlaces);
  const getPhoto = useServerFn(getPlacePhotoUrl);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [photos, setPhotos] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState(false);

  const wrapRef = useRef<HTMLDivElement>(null);
  const seqRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Close on outside click
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const run = useCallback(
    async (q: string) => {
      const my = ++seqRef.current;
      setLoading(true);
      setError(false);
      try {
        const r = await search({ data: { query: q } });
        if (my !== seqRef.current) return;
        if (r.error) {
          setError(true);
          setResults([]);
          return;
        }
        setResults(r.results);
        setPhotos({});
        // Lazy-load photos for top 3
        r.results.slice(0, 3).forEach(async (p) => {
          if (!p.photoName) return;
          const photo = await getPhoto({ data: { photoName: p.photoName, maxWidthPx: 120 } });
          if (my !== seqRef.current) return;
          setPhotos((prev) => ({ ...prev, [p.id]: photo.url }));
        });
      } catch {
        if (my === seqRef.current) {
          setError(true);
          setResults([]);
        }
      } finally {
        if (my === seqRef.current) setLoading(false);
      }
    },
    [search, getPhoto],
  );

  function onChange(v: string) {
    setQuery(v);
    setOpen(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (v.trim().length < 2) {
      setResults([]);
      setLoading(false);
      setError(false);
      return;
    }
    debounceRef.current = setTimeout(() => void run(v.trim()), 400);
  }

  async function pick(p: PlaceResult) {
    let photo_url = photos[p.id] ?? null;
    if (photo_url === undefined || (photo_url == null && p.photoName)) {
      try {
        const r = await getPhoto({ data: { photoName: p.photoName!, maxWidthPx: 400 } });
        photo_url = r.url;
      } catch {
        photo_url = null;
      }
    } else if (photo_url && p.photoName) {
      // We only cached a small (120px) preview; re-fetch a larger one for storage
      try {
        const r = await getPhoto({ data: { photoName: p.photoName, maxWidthPx: 400 } });
        photo_url = r.url ?? photo_url;
      } catch {
        /* keep small one */
      }
    }
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
    });
    setOpen(false);
    setQuery("");
    setResults([]);
  }

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <Search
          size={16}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
        />
        <input
          type="text"
          value={query}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => query && setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
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
            onClick={() => {
              setQuery("");
              setResults([]);
              setOpen(false);
            }}
            className="absolute left-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center text-muted-foreground min-h-0"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {open && query.trim().length >= 2 && (
        <div className="absolute z-30 left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg max-h-[320px] overflow-y-auto">
          {loading && (
            <div className="p-3 text-xs text-muted-foreground flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-muted-foreground animate-pulse" />
              מחפש...
            </div>
          )}
          {!loading && error && (
            <div className="p-3 text-xs text-[color:var(--accent-2)]">
              שגיאה בחיפוש — נסה שוב
            </div>
          )}
          {!loading && !error && results.length === 0 && (
            <div className="p-3 text-xs text-muted-foreground">לא נמצאו תוצאות</div>
          )}
          {!loading &&
            !error &&
            results.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => void pick(r)}
                className="w-full text-right flex items-center gap-2 p-2 hover:bg-muted/50 border-b border-border last:border-b-0 min-h-0"
              >
                {photos[r.id] ? (
                  <img
                    src={photos[r.id]!}
                    alt=""
                    loading="lazy"
                    className="w-11 h-11 rounded-md object-cover shrink-0"
                  />
                ) : (
                  <div className="w-11 h-11 rounded-md bg-muted shrink-0 flex items-center justify-center text-lg">
                    📍
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate" dir="ltr">
                    {r.name}
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate" dir="ltr">
                    {r.address}
                  </div>
                  {r.rating != null && (
                    <div className="text-[12px] text-muted-foreground" dir="ltr">
                      ★ {r.rating.toFixed(1)}
                      {r.userRatingCount != null && (
                        <span> ({r.userRatingCount.toLocaleString("he-IL")} ביקורות)</span>
                      )}
                    </div>
                  )}
                  {r.primaryType && (
                    <div className="text-[10px] text-muted-foreground/80">{r.primaryType}</div>
                  )}
                </div>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
