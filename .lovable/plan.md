## Overview

Implement three complete UX flows: (1) a rich day planner with timeline + 6 entry-type forms, (2) enhanced quick expense with Google Maps link + save-to-recommendations, (3) full recommendations CRUD with sub-tabs, city filter, hotels sub-flow, and GPS sort.

## 1. Day Detail — Full Daily Planner

**File:** `src/routes/itinerary.$dayId.tsx` (rewrite)

**Layout:**
- Header: `יום N · <date>` with inline-editable city label (reuses inline-edit pattern from itinerary list).
- Timeline: entries sorted by `time_of_day` (nulls last), rendered as vertical rail with connector line. Each entry = card with colored type chip (emoji in tinted circle), title, subtitle (location / flight # / time range), and a right-side drag handle.
- Empty state: centered SVG + large primary button `+ הוסף פעילות לאותו יום` opening the entry-type picker.
- Persistent bottom "+" button when entries exist.

**Entry type picker (BottomSheet, 2×3 grid):**
✈️ טיסה / 🏨 לינה / ⛩ אטרקציה / 🍜 אוכל / 🚆 תחבורה / 📝 הערה. Tapping a tile swaps sheet content to that entry's form.

**Per-type forms (all write to `day_entries`):**
- Common: `entry_type`, `title`, `description`, `time_of_day` (stored as `HH:MM` text), `location_name`, `google_maps_url`, `icon_emoji`, `display_order`.
- Flight: departure/arrival time, flight number, origin, destination, notes → serialized into `description` + `title="<flight#> ORIG→DEST"`, `time_of_day=departure`.
- Lodging: hotel name, check-in time, price/night, booking URL, free-cancel date, notes.
- Attraction: name (title), planned time, area (location_name), Maps URL, notes; checkbox **"שמור גם בהמלצות"** → also insert into `recommendations` (type=attraction) and link `linked_recommendation_id`.
- Food: same as attraction but type=food.
- Transport: transport-type dropdown (רכבת/אוטובוס/מונית/הליכה/שינקנסן/מטרו), from, to, departure time, duration, notes.
- Note: optional title + required content.

**Entry card interactions:**
- Row tap → edit sheet (reuses same form pre-filled).
- Trailing action buttons: ✏️ edit, 🗑 delete (confirm).
- Up/down reorder buttons on each card (keeps parity with existing pattern; drag reordering deferred — the spec mentions drag handle, we render a visual handle but wire it to up/down for reliability on mobile).

**Data:** all fields fit existing `day_entries` schema (title, description, time_of_day, location_name, google_maps_url, icon_emoji, entry_type, linked_recommendation_id, display_order). No migration needed.

## 2. Quick Expense — Location + Maps + Save-to-Recs

**File:** `src/components/GlobalFab.tsx`

Replace the single "מיקום" input with:
- `שם המקום` (text)
- `לינק גוגל מפות` (URL, optional)
- Checkbox `שמור גם בהמלצות` — enabled only when category is `food`, `attraction`, or `accommodation` (mapped to recommendation types food/attraction/hotel). Hidden for transport/shopping/other.

On submit:
1. Insert expense with `location_name` + `linked_recommendation_id` (if created).
2. If checkbox on and name present, insert into `recommendations` (name, google_maps_url, type, city left blank), capture id, and set `expenses.linked_recommendation_id`.

## 3. Recommendations — Full Add/Edit/Manage

**File:** `src/routes/recommendations.tsx` (rewrite) + new small components.

**Screen:**
- Sub-tabs: 🍜 אוכל / ⛩ אטרקציות / 🏨 לינה.
- City filter pills row (distinct `city` values from recs + `הכל`), horizontal scroll.
- List of recommendation cards (see below).
- Bottom-right **"+" FAB** (positioned above BottomNav, offset from existing expense FAB on the opposite side — expense FAB is bottom-left already, so recs FAB goes bottom-right).

**Add/Edit recommendation sheet:**
- Segmented control: אוכל / אטרקציה / לינה.
- Fields: name (required), city (required), area/neighborhood (address column), Maps URL, notes.
- If type=hotel: additional block writing to `hotels` table with check-in/out dates, price/night, booking URL, free-cancel date. (Recommendations table still gets the base entry; hotel-specific data goes in `hotels` linked by name+city for now — see technical notes.)

**Card:**
- Bold name, `city · area` caption.
- Type chip (food=coral / attraction=violet / hotel=teal — using existing `--accent-2/3` tokens).
- Status badge: `רשימה / ביקרנו / דילגנו` (from `status` enum).
- If `status='visited'`: 1–5 star rating + review preview.
- Actions: `ניווט` (opens `google_maps_url` if set), `הוסף ליום` (opens day picker sheet → creates `day_entries` row with matching type, `linked_recommendation_id` set, and `title` = rec name).
- Long-press → edit/delete (using pointerdown timer; fallback: tap ✏️/🗑 icons on the card for reliability).

**Hotels sub-tab:**
- Reads from `hotels` table (not recommendations) since it has the specialized fields.
- Card shows check-in/out dates, computed total cost (`price_per_night_ils × nights`), cancellation deadline with traffic-light badge (🟢 >7d / 🟡 3–7d / 🔴 ≤3d, computed from today).
- After checkout date: inline rating + review inputs (writes `post_stay_rating`, `post_stay_review`).

**GPS sort (food + attractions tabs only):**
- On tab mount, call `navigator.geolocation.getCurrentPosition` (once).
- If granted: sort cards by Haversine distance from user to rec `latitude/longitude`; show `X ק״מ` under each card (reusing `src/lib/geo.ts`). Recs missing coords fall to the bottom, alphabetized.
- If denied/unavailable: alphabetical sort, no error banner.

## Technical Notes

- All new inserts scope to `TRIP_ID` from `src/lib/constants.ts`.
- Time stored as `HH:MM` text in `day_entries.time_of_day` (already `text`).
- Save-to-recommendations helper (shared): `saveRecommendation({ type, name, city?, address?, google_maps_url?, notes? }) → id`. Used by day-entry attraction/food forms and by quick expense checkbox.
- Add-to-day helper: `addRecommendationToDay(rec, day)` → inserts `day_entries` row with `entry_type` mapped from rec type (food/attraction/hotel_checkin), `title=rec.name`, `location_name=rec.city`, `google_maps_url`, `linked_recommendation_id=rec.id`, `display_order=max+1`.
- Query invalidations: after mutation invalidate `["day-entries", dayId]`, `["day-entries-summary"]`, `["recs"]`, `["hotels"]`, `["expenses"]` as relevant.
- Reuse existing `BottomSheet`, `EmptyState`, `CategoryPill` components.
- No schema/migration changes required — existing tables cover all fields.

## Out of Scope

- Real drag-and-drop reorder (using ↑/↓ buttons instead for touch reliability).
- Google Maps autocomplete/Places API (users paste Maps URLs manually; connector setup is a separate task).
- Auth/PIN changes.

## Files Touched

- `src/routes/itinerary.$dayId.tsx` — rewrite (timeline + picker + 6 forms).
- `src/components/GlobalFab.tsx` — add Maps URL + save-to-recs.
- `src/routes/recommendations.tsx` — rewrite (sub-tabs, filter, FAB, cards, sheets, hotels, GPS).
- `src/lib/recommendations.ts` — new shared helpers (saveRecommendation, addRecommendationToDay, type mapping).
