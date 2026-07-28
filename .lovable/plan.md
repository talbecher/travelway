## Fix 4 — Move entry between days

**File:** `src/routes/itinerary.$dayId.tsx`

- In the `EntryDetails` bottom sheet, add a new action button **"📅 העבר ליום אחר"** below the existing actions.
- Add local state `movePickerOpen` and a `moveMutation` that runs:
  1. `supabase.from("day_entries").update({ day_id: selectedDayId }).eq("id", entry.id)`
  2. Invalidates `["day-entries", currentDayId]`, `["day-entries", selectedDayId]`, `["day-entries-summary"]`.
  3. Toasts `✅ הועבר ליום {day_number}`.
  4. Closes both sheets and navigates back to `/itinerary`.
- Render a second `BottomSheet` titled `העבר את {entry.title} ליום...` listing all days from the existing `useDays()` hook.
- Each row (h-52px, full width): `יום {N} · {formatted date} · {city_label}`.
- Current day row is rendered but disabled (`opacity-50 pointer-events-none`) with `(היום הנוכחי)` suffix.

## Fix 5 — "מה קרוב אליי" card on home

**File:** `src/routes/index.tsx`

- New section placed **after** the quick actions grid and **before** the hotel alerts section.
- State: `nearbyFilter` (`"all" | "food" | "attraction"`), `userPos`, `geoError`.
- On mount: `navigator.geolocation.getCurrentPosition` (timeout 8000); set pos or `geoError`.
- Uses existing `useRecs()` and `haversine` from `src/lib/geo.ts`.
- `useMemo` filters recs that have coords, matches filter, computes distance, sorts asc, takes top 3.
- Filter pills row: `[🍜 אוכל] [⛩ אטרקציות] [הכל]`, active = `bg-accent text-white`, inactive = `bg-surface-2 border text-muted-foreground`.
- Rows: 40×40 rounded photo (or emoji 🍜/⛩ fallback) · name (14px/600) + distance (`320 מ׳` under 1km, else `1.2 ק״מ`) · 🗺 button opening `google_maps_url` or `https://www.google.com/maps/search/?api=1&query={lat},{lng}` in a new tab.
- "ראה הכל ›" navigates to `/recommendations`.
- States:
  - Geo denied/error → muted centered "📍 אפשר גישה למיקום כדי לראות מה קרוב אליך".
  - No matches → "לא נמצאו מקומות שמורים בקטגוריה זו".
  - Loading pos → 3 `animate-pulse` skeleton rows.
- Card wrapper: `bg-card border border-border rounded-2xl p-4 shadow-sm`.

## Constraints

- Only the two files above are touched.
- No DB changes, no new dependencies.
- Existing hooks (`useDays`, `useRecs`) and existing `haversine` reused as-is.

## Technical note on haversine

`src/lib/geo.ts` exports `haversine({lat, lon}, {lat, lon})` (object args, `lon` not `lng`). The Fix-5 call sites will pass `{ lat, lon }` objects to match the current signature; no change to `geo.ts`.
