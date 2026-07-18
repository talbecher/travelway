## 1. `enrichRecommendationPhoto` server function

New export in `src/lib/places.functions.ts`.

- Method: POST. Input validator: `{ id?: string, name: string, city?: string | null, lat?: number | null, lng?: number | null }` (id optional — the import flow doesn't have a DB row yet; the backfill flow passes id).
- Handler:
  1. Read `process.env.GOOGLE_PLACES_KEY`; if missing return `{ updated: false }`.
  2. Call `places:searchText` with `textQuery = "${name}${city ? ' ' + city : ''}"`, `languageCode: "he"`, and — when lat/lng finite — `locationBias: { circle: { center: { latitude, longitude }, radius: 500 } }`. FieldMask: `places.photos,places.rating,places.userRatingCount`.
  3. Take the first place with a photo (or first result overall for rating). If it has `photos[0].name`, call the same photo-media endpoint used by `getPlacePhotoUrl` and read `photoUri`.
  4. If `id` provided AND at least one of `photo_url` / `rating` / `userRatingCount` resolved → `UPDATE recommendations SET photo_url = COALESCE(existing_photo_url_stays_null, new), google_rating = ..., google_rating_count = ...` via a server-only supabase client. Use the admin client via `await import("@/integrations/supabase/client.server")` inside the handler (server-fn splitting keeps it out of the client bundle). Only set columns that came back non-null (`COALESCE` in JS: skip fields we didn't find).
  5. Return `{ updated: boolean, photo_url: string | null, google_rating: number | null, google_rating_count: number | null }`.
- All errors caught → return `{ updated: false, photo_url: null, google_rating: null, google_rating_count: null }` (no throw). Timeouts 8s like existing calls.

## 2. Import flow enrichment — `src/components/ImportFromMyMapsSheet.tsx`

Change the `importMut` mutation:

1. Build `basePayloads` from selected places (same fields as today plus `photo_url/google_rating/google_rating_count = null`).
2. Add `enriching` state: `{ done: number, total: number }` and render, under the submit button while pending: `🔍 מעשיר נתונים... {done}/{total}` (small muted text).
3. Enrich in batches of 5 in parallel:
   ```ts
   const enrichFn = useServerFn(enrichRecommendationPhoto);
   for (let i = 0; i < payloads.length; i += 5) {
     const slice = payloads.slice(i, i + 5);
     const results = await Promise.all(slice.map(p =>
       p.latitude != null && p.longitude != null
         ? enrichFn({ data: { name: p.name, city: p.city, lat: p.latitude, lng: p.longitude } }).catch(() => null)
         : Promise.resolve(null)
     ));
     results.forEach((r, k) => {
       if (r?.updated) {
         slice[k].photo_url = r.photo_url;
         slice[k].google_rating = r.google_rating;
         slice[k].google_rating_count = r.google_rating_count;
       }
     });
     setEnriching({ done: Math.min(i + 5, payloads.length), total: payloads.length });
   }
   ```
4. After the loop, single `supabase.from("recommendations").insert(payloads)`; then invalidate `["recs", tripId]`. `tripId` = `getActiveTripId()`.
5. On success toast unchanged. `enriching` reset in `reset()`.

Payload shape per the user's spec (adds `photo_url/google_rating/google_rating_count`; keeps `status: "wishlist"`).

## 3. Admin backfill button — `src/routes/recommendations.tsx`

Header area (near the existing "ייבא מ-My Maps" button):

- Read `useSearch({ strict: false })` OR simply `window.location.search.includes("admin=1")` inside a `useMemo` to avoid touching the route search schema. If `admin=1` is present, render an extra button `🛠 עדכן תמונות חסרות`.
- On click:
  1. Query current-trip candidates: `supabase.from("recommendations").select("id,name,city,latitude,longitude").eq("trip_id", tripId).is("photo_url", null).in("type", ["food","attraction"])` → array `candidates`.
  2. `if (!confirm(\`נמצאו ${candidates.length} המלצות ללא תמונה. להמשיך?\`)) return;`
  3. Component-level `abortRef = useRef(false)` and `progress` state `{ done, total, updated }`.
  4. Show a persistent progress toast via `toast.loading("מעדכן תמונות... 0/N", { id, action: { label: "עצור", onClick: () => (abortRef.current = true) } })`. Update it each batch: `toast.loading(\`מעדכן תמונות... ${done}/${total}\`, { id })`.
  5. Loop in batches of 10 with `Promise.all` calls to `enrichFn({ data: { id, name, city, lat, lng } })`. After each batch: bump `done`, count `updated`, break the loop if `abortRef.current`.
  6. On finish: `toast.success(\`✅ עודכנו ${updated} תמונות\`, { id })`, `qc.invalidateQueries({ queryKey: ["recs", tripId] })`. `abortRef.current` reset.

The button is not shown in normal UI (no `?admin=1`).

## Verification

- `?admin=1` on `/recommendations`: click the extra button → confirm dialog with correct count → progress toast advances → recs list refreshes with new photos.
- Import a My Maps URL with ~15 places: after clicking "ייבא N מקומות" the small progress text advances 5/15 → 10/15 → 15/15, then success toast; the newly imported cards show photos where Places matched.
- No new columns / migrations; imports without lat/lng still save (no enrichment attempted).

## Technical notes

- `enrichRecommendationPhoto` lives in a client-safe `.functions.ts` file. The admin/supabase import is done inside the `.handler()` via `await import(...)` to keep the client bundle clean (per TanStack import-graph rules).
- Uses `useServerFn(enrichRecommendationPhoto)` on the client side.
- No changes to the existing `searchPlaces` / `getPlacePhotoUrl` signatures.
