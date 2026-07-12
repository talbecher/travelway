
## Scope

Changes are limited to the recommendations screen and its dependencies: `src/lib/places.functions.ts`, `src/components/PlacesSearch.tsx`, `src/routes/recommendations.tsx`, `src/components/RecsMap.tsx`, plus one small migration.

## 1. Auto-fill city from Places API

- Extend `X-Goog-FieldMask` in `searchPlaces` to include `places.addressComponents`.
- Extract city from address components: prefer `locality`, then `administrative_area_level_2`, then `administrative_area_level_1` (fallback). Use `longText`.
- Add `city: string | null` to `PlaceResult` DTO returned by `searchPlaces`.
- Propagate through `SelectedPlace` type in `PlacesSearch.tsx`.
- In `RecForm` (recommendations.tsx), when a place is selected, set `city` field from `place.city` (still editable).

## 2. Google rating in search results + on cards

Migration (new file under `supabase/migrations/`):

```sql
ALTER TABLE public.recommendations
  ADD COLUMN IF NOT EXISTS google_rating NUMERIC(2,1),
  ADD COLUMN IF NOT EXISTS google_rating_count INTEGER;
```

No RLS/GRANT changes needed (existing table policies cover new columns).

- Extend FieldMask: `places.rating,places.userRatingCount`.
- Add `rating: number | null`, `userRatingCount: number | null` to `PlaceResult` and `SelectedPlace`.
- In `PlacesSearch` dropdown row (under name/address): if rating present, render `★ {rating} ({count.toLocaleString('he-IL')} ביקורות)` in muted 12px text.
- In `RecForm` insert/update mutation: persist `google_rating` and `google_rating_count` from selected place.
- On `PlaceCard` (list view): show `★ 4.6 גוגל` as small muted line (kept separate from user's personal `rating`/`review` block).

## 3. Tap card → open in Google Maps

- Wrap the entire `PlaceCard` inner content in `<a href={rec.google_maps_url} target="_blank" rel="noreferrer">` **only when** `rec.google_maps_url` exists.
- The Edit/Delete icon buttons and "+ הוסף ליום" button must not trigger the link: attach `onClick` handlers with `e.preventDefault(); e.stopPropagation();`. The existing "ניווט" anchor stays.
- Add a small `↗` (or `ExternalLink` from lucide) icon absolutely positioned top-left of the card when a URL exists.
- No wrapper when URL missing.

## 4. "הכל" tab + type badges

- Extend `Tab` type to `"all" | "food" | "attractions" | "hotels"`; add to zod `searchSchema`.
- Sub-tabs order: `הכל | 🍜 אוכל | ⛩ אטרקציות | 🏨 לינה`. Default tab becomes `"all"`.
- `PlacesList` accepts `type: "food" | "attraction" | "all"`. When `"all"`: include food+attraction (hotels excluded to preserve existing hotel-specific behavior; matches the "map view hidden for hotels" pattern), sort by `created_at desc`.
  - Note: `useRecs` currently returns recs; verify it exposes `created_at`. If not, extend the query select. (Field check confirmed at implementation.)
- Cities pill row: in "all" show cities aggregated across food+attraction.
- Map view: allowed in "all" tab (pins from both food+attraction).
- On `PlaceCard`: pass a `showTypeBadge` prop; when true, render top-right corner badge:
  - food → 🍜 אוכל, bg `#FF6B6B22`, text coral
  - attraction → ⛩ אטרקציה, bg `#6C63FF22`, text violet
  - hotel → 🏨 לינה, bg `#FFD93D22`, text amber
  - `rounded-full px-2 py-0.5 text-[11px]`
- In non-"all" tabs, hide the badge (redundant).

## 5. Fix map view in recommendations

Edit `src/components/RecsMap.tsx`:

- Replace `FitAll` logic:
  - 0 pins → `setView([35.6762, 139.6503], 10)`
  - 1 pin → `setView([lat, lng], 15)`
  - 2–5 pins → `fitBounds(bounds, { padding: [60,60], maxZoom: 15 })`
  - 6+ pins → `fitBounds(bounds, { padding: [40,40], maxZoom: 15 })`
  - Wrap fit call in `setTimeout(..., 100)` inside `useEffect`; cleanup with `clearTimeout`.
  - Effect deps: `pins.map(p=>p.id).join(',')`, `map`.
- `TileLayer`: add `maxZoom={19}` `minZoom={5}`.
- Add a transient toast overlay (absolute bottom-center) when `pins.length >= 6`: `🔍 זום פנימה לצפייה בפינים קרובים`, auto-dismiss after 3s via `useState + setTimeout` inside the component.
- Empty state overlay when `pins.length === 0`: centered card `📍 אין מיקומים שמורים — הוסף המלצות עם לינק גוגל מפות כדי שיופיעו כאן`. (In recommendations.tsx the outer 0-pin branch already handles empty; the map itself gets the overlay for defense in depth.)

Edit `src/routes/recommendations.tsx`:

- Map container height: `calc(100vh - 180px)` (replacing the current `calc(100dvh - 260px)`).

## Technical notes

- `SelectedPlace` shape becomes `{ name, address, latitude, longitude, google_maps_url, photo_url, city, rating, userRatingCount }`.
- `PlaceCard` currently supports food/attraction; hotel tab uses a separate `HotelsList` component so type-badge logic only needs to handle food/attraction/hotel visual definitions if we ever show it in "all" — hotels excluded from "all" here to keep hotel screen behavior untouched (Hotels list has its own layout).
- Card link wrapping: to keep interactive controls working inside an anchor, use `stopPropagation` + `preventDefault` on their click handlers rather than nesting (nested interactive elements inside `<a>` are invalid HTML). Convert action buttons to `<button>` inside the anchor and handle events.
- Migration is additive; no data backfill.

## Files touched

- `src/lib/places.functions.ts` — FieldMask, DTO fields
- `src/components/PlacesSearch.tsx` — SelectedPlace type, rating row in results
- `src/routes/recommendations.tsx` — "all" tab, city autofill, save Google rating, tappable card + type badge, map height
- `src/components/RecsMap.tsx` — FitBounds rewrite, TileLayer zoom, hint toast, empty overlay
- `supabase/migrations/<new>.sql` — `google_rating`, `google_rating_count` columns
