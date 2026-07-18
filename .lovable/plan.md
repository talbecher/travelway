## Goal
Enable location repair on entries missing coords, and keep recommendations ↔ day_entries in sync when either side is edited.

## Verified current state
- `src/lib/recommendations.ts` `addRecommendationToDay` already sets `linked_recommendation_id: rec.id` — no fix needed for regular recs.
- `src/routes/recommendations.tsx` HotelCard `insertEndOfDay` and checkout insert do NOT include `linked_recommendation_id` — needs fix.
- `src/routes/itinerary.$dayId.tsx` already selects `linked_recommendation_id` on entries (line 52), so it is available on cards.

## Changes

### 1. `src/routes/itinerary.$dayId.tsx` — "לא זוהה מיקום" prompt
- On each entry card where `latitude == null || longitude == null`, render a small tappable hint under the title:
  - Text: `📍 לא זוהה מיקום — לחץ לעדכון`
  - Style: `text-[11px] text-muted-foreground underline`
- Clicking opens a new `BottomSheet` (local component state `editLocationEntry`).
- Sheet title: `עדכן מיקום — <entry.title>`.
- Body: reuse existing `PlacesSearch` component.
- On place selected, run a mutation:
  1. `update day_entries` row: `latitude`, `longitude`, `google_maps_url` (and `location_name` from `place.city` if empty; keep out to stay minimal — spec only lists three fields, so update only those three).
  2. If `entry.linked_recommendation_id` is set, also `update recommendations` with the same three fields where `id = linked_recommendation_id`.
  3. Invalidate `["day-entries", dayId]` and `["recs", tripId]`.
  4. Toast `✅ מיקום עודכן`, close sheet.

### 2. Visual indicators on entry cards (itinerary.$dayId.tsx)
- Entry has coords → small 8px accent-color dot next to title.
- Entry has `linked_recommendation_id` → small 🔗 icon next to title with `title="מסונכרן עם המלצות"`.

### 3. `src/routes/recommendations.tsx` — sync on rec update
- In the RecForm update mutation, after successful `.update()` on `recommendations`:
  - Query `day_entries` where `linked_recommendation_id = rec.id` selecting `id, day_id`.
  - If any exist, run one bulk `.update()` on `day_entries` filtered by `linked_recommendation_id = rec.id` setting: `title`, `location_name` (from `address`), `latitude`, `longitude`, `google_maps_url`, `photo_url`.
  - Invalidate `["day-entries", dayId]` for each unique dayId.
  - Toast: `✅ עודכן גם ב-<N> ימים במסלול` (only when N > 0).

### 4. `src/routes/recommendations.tsx` — HotelCard link fix
- Add `linked_recommendation_id: h.id` to both hotel `day_entries.insert` calls (check-in/middle in `insertEndOfDay` and checkout insert). This uses the same column to reference the hotel row (per spec) so future hotel edits can sync the same way as regular recs. (Sync of hotel edits themselves is out of scope — spec only asks for the link.)

## Files touched
- `src/routes/itinerary.$dayId.tsx`
- `src/routes/recommendations.tsx`

No schema or migration changes.