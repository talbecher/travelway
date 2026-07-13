## 3 fixes for hotels & itinerary

### 1. HotelForm — add Google Places search (like the food/attraction form)

**File:** `src/routes/recommendations.tsx` (`HotelForm`)

- Add a `PlacesSearch` block at the top of the form (only when not editing, same as `RecForm` for a new record).
- On `onSelect(place)`:
  - Autofill `hotel_name` ← `place.name`, `city` ← `place.city`, `confirmation_url` ← `place.google_maps_url` (only if empty), and store `place.latitude/longitude` + `place.google_maps_url` for save.
- Extend the `hotels` insert/update payload to persist `latitude`, `longitude`, `address`, `google_maps_url` (schema already has these columns per the existing hotels list of 16 fields — verify and, if missing, add them in a small migration in the same batch).
- Keep manual entry fully working; Places search is optional.

### 2. Off-by-one on trip start date

**File:** `src/routes/onboarding.tsx`

Both the create and edit branches build days with:
```ts
const d = new Date(startDate + "T00:00:00"); d.setDate(d.getDate()+i);
return d.toISOString().slice(0,10);
```
`toISOString()` converts to UTC, so in Israel (UTC+2/+3) the ISO date shifts back one day → user picks 17.11, gets 16.11.

**Fix:** compute the date as a pure string (no `Date`/UTC round-trip):
```ts
function addDaysISO(iso: string, n: number) {
  const [y,m,d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m-1, d));
  dt.setUTCDate(dt.getUTCDate()+n);
  return dt.toISOString().slice(0,10);
}
```
Use it in both the "create days" and the "reconcile desired" loops. Also change `autoTitle`'s year extraction to parse `startDate.slice(0,4)` to be safe.

### 3. "Add hotel to itinerary" — creates entries + auto-splits expense across nights

**Files:** `src/routes/recommendations.tsx` (HotelCard), `src/hooks/use-trip.ts` (already exposes days), maybe a small helper in `src/lib/recommendations.ts` or new `src/lib/hotels.ts`.

**Button on `HotelCard`:** "➕ הוסף למסלול" (disabled if `checkin_date`/`checkout_date` missing or no matching itinerary days).

**On click:**

1. Load `itinerary_days` (already via `useDays()`) and select days whose `date` is in `[checkin_date, checkout_date)` (checkout day itself excluded — user checks out that morning). If no days match, toast "התאריכים של המלון לא חופפים למסלול".
2. For each matching day, insert a `day_entries` row:
   - `entry_type = "hotel_checkin"` on first night, `"note"` (or a new "hotel_stay" reuse of `hotel_checkin`) for subsequent nights — simplest: use `hotel_checkin` for every night.
   - `title = hotel_name`, `location_name = city`, `google_maps_url = confirmation_url` (only if it's a google maps link) or the hotel's stored maps url if present, `icon_emoji = "🏨"`, `latitude/longitude` from hotel if available, `display_order = existing count`, `linked_recommendation_id = null` (hotels are not in `recommendations`).
   - Guard: skip if a day_entry with `entry_type = hotel_checkin` and the same `title` already exists for that day (idempotent — pressing twice doesn't duplicate).
3. Auto-split the cost into `expenses`:
   - `nights = daysBetween(checkin, checkout)` (already in code).
   - `perNight = price_per_night_ils ?? total_cost_ils / nights`.
   - For each linked day insert one `expenses` row: `category = "accommodation"`, `amount_ils = perNight`, `description = hotel_name`, `location_name = city`, `expense_date = day.date`.
   - Guard against double-charging: before inserting, check that no `expenses` row exists with the same `description = hotel_name`, `category = accommodation`, `expense_date = day.date`. Also do NOT re-add if the hotel already has any linked expenses for those dates.
4. Invalidate `["day-entries", ...]`, `["day-entries-summary"]`, `["expenses"]`, and toast `"נוסף למסלול · N לילות · Xk₪"`.

**Card UI:** show a small "כבר במסלול" chip when we detect at least one matching day already has a `hotel_checkin` entry with this hotel name (cheap client-side check against days + a lightweight query, or simply toggled after successful add — good enough).

### Technical notes

- All hotel-linked expenses use existing category `accommodation` so the budget screen picks them up automatically — no schema change to `expenses` needed.
- If the `hotels` table already has `latitude`/`longitude`/`google_maps_url`/`address` columns (needs a `psql \d public.hotels` check during build), no migration is required for #1. If any are missing, add one migration adding the columns as nullable with proper GRANTs preserved.
- No changes to `RecsMap`, `DayMap`, budget screen, or other screens.
