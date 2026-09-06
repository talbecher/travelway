# Phase 3 — "Live Now" card on home screen

Add a single new card to `src/routes/index.tsx` that shows the user what is happening right now in today's itinerary and what comes next.

## Scope
- File: `src/routes/index.tsx` only.
- No new npm dependencies.
- No database or schema changes.
- Do not modify existing cards, sections, queries, FAB behavior, or navigation logic.

## When to show
Render the card as the first section only when all of these are true:
- `useTripIsActive()` returns `true`.
- A day in `useDays()` has `date === todayISO()`.
- That day has at least one `day_entries` row with `time_of_day` set.

If any condition is missing, skip the card entirely (no placeholder).

## Data source
Use the existing `entriesByDay` record already fetched in `Home()` (query key `["day-entries-summary", tripId, activeVersion?.id]`). It already contains `time_of_day`, `title`, `photo_url`, `entry_type`, `icon_emoji`, `location_name`, `latitude`, `longitude`, and `google_maps_url`.

## Card component: `LiveNowCard`
Create a local component inside `src/routes/index.tsx`.

### Logic
1. Get `todayDay` from `days` (already computed in `Home`).
2. Read `todayEntries = entriesByDay[todayDay.id] ?? []`.
3. Filter entries that have `time_of_day`, parse `HH:MM` to minutes, and sort ascending.
4. Compute `currentEntry` = last timed entry whose time is `<= now`.
5. Compute `nextEntry` = first timed entry whose time is `> now`.
6. Compute `minutesUntilNext` when `nextEntry` exists.

### Layout
Container:
- `bg-card`, `border border-border`, `rounded-2xl`, `overflow-hidden`.

Top strip:
- Full-width `8px` bar with `bg-accent`.
- Inside the strip: a small white pulsing dot + the text "עכשיו" (`text-[10px]`, white, font-medium).

Content area (`p-4`):
- **Current section** (when `currentEntry` exists):
  - Left: `photo_url` rendered as `52x52 rounded-xl object-cover`; fallback `52x52 rounded-xl bg-accent/15` with centered entry emoji (`24px`).
  - Right: title (`text-[15px] font-medium line-clamp-1`), time (`text-[11px] text-muted-foreground`), and location `"📍 " + location_name` (`text-[11px] text-muted-foreground line-clamp-1`).
- **Divider** `"─── הבא בתור ───"` styled like the city divider, `my-2.5`.
- **Next section** (when `nextEntry` exists):
  - Left: `32x32 rounded-lg bg-surface-2` with entry emoji (`20px`).
  - Right: title (`text-[13px] font-medium line-clamp-1`), remaining time (`text-[11px] text-muted-foreground`), and scheduled time (`text-[10px] text-muted-foreground/60`).
  - Remaining time format: `< 60` minutes → `"בעוד {n} דקות"`; otherwise `"בעוד {h}ש׳ {m}׳"`.
- **No current but has next**: show header text "הפעילות הראשונה של היום" and the next section only.
- **No next**: after current section show centered text `"זה הכל להיום 🎉"` (`text-[12px] text-muted-foreground`).

Quick actions at the bottom:
- Two side-by-side buttons (`h-9 rounded-xl`).
- **"🗺 נווט לשם"**: opens Google Maps navigation URL for `currentEntry` (or `nextEntry` if no current). Use `google_maps_url` if present, else `https://www.google.com/maps/dir/?api=1&destination={lat},{lng}`. If neither URL nor coordinates exist, render the button as disabled/gray.
- **"📅 פתח את היום"**: navigates to `/itinerary/{todayDay.id}` using the existing `navigate` helper.

### Pulse animation
Add an inline `@keyframes` style block or a small `<style>` block in the component for the white dot. Animation: `live-pulse` with opacity `1 → 0.5` and scale `1 → 0.85`, duration `2s`, infinite, ease-in-out. Alternatively, reuse Tailwind's `animate-ping` if it visually satisfies the spec.

### Loading state
While `entriesByDay` is still loading and the card should be visible, render a skeleton version of the same card (`animate-pulse`, same dimensions, gray placeholder blocks). Do not show the card at all if `isLoading` for the whole page is true (the global `HomeSkeleton` already covers that).

## Integration into `Home()`
Insert the new section as the very first item in the `sections` array, before the hero, gated by the show conditions above. Keep the existing `NowNextCard` and `DayPreviewCard` sections untouched below it.

## TypeScript notes
- Reuse the existing `EntrySlim` type.
- Keep helper functions (`parseMinutes`, `formatRemaining`, `navigateUrl`) inside the component file.
- Ensure all JSX text uses explicit strings or `{"..."}` escapes where braces appear.

## Verification
- `bunx tsc --noEmit` or the project's typecheck command must pass.
- Build must succeed with no errors.
