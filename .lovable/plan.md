# "What's saved near me?" for an active trip

## What already exists (checked in code)
- Home card "מהמקומות ששמרתם, לידכם" (`NearbyCard` in `src/routes/index.tsx`): asks for location automatically when the card appears, shows the 3 closest saved places (no distance limit), has food/attractions/all chips, and "לשמורים" only opens the recommendations page as a list.
- Recommendations page: search (name, notes, review, city, address, type words — so notes are already searched), category tabs, city filter, source filter, "new from Discover", list/map toggle. The map asks for location on its own when opened, and receives pins already filtered on the page.
- Tapping a map pin opens the existing card (`MapPickCard`) with Google Maps link, "add to day" and other actions.

## What will change

### Home card
- Tapping the card (and its "see all" button) opens the recommendations page in a new "near me" mode: `/recommendations?near=1`.
- The card's current contents and chips remain as they are.

### Recommendations page — "near me" mode
- Entering from home: map view, radius 500 m, all categories, all cities, all sources, empty search, "new from Discover" off.
- Location is requested once, right after the tap (entering this mode). No continuous tracking; location is kept in memory only.
- A small bar above the map: "קרוב אליי · 500 מ׳" with a switch to 1 km, and "יציאה" to leave the mode.
- Radius, category and search work together: a place shows only if it has valid coordinates, is within the radius (straight-line distance, shown as "מ׳/ק״מ", never as walking time), matches the chosen category, and the typed text appears in its name or notes (e.g. "גיוזה" in notes).
- Any filter the user picks afterwards shows up visibly in the existing controls; city/source filters stay visible, so nothing hides results without explanation.
- The map centers on the user and shows their dot; pins are filtered before markers are created.
- No results: clear empty message with a "הרחב ל־1 ק״מ" button (at 1 km: "יציאה למפה הרגילה").
- Location denied or unavailable: short message plus a button to the regular recommendations map.
- Leaving the mode: removes `near` from the address, clears the radius, returns to the regular page behavior.

## Not changed
No database changes, no Google Maps Platform, no new API, no change to saving or "add to day", nothing added on the day screen.

## Technical details
- `searchSchema` gets `near: z.literal(1).optional()` (or boolean). A `useEffect` on `search.near` resets tab/city/source/q/recentOnly, sets `view="map"`, radius=500, and calls `getCurrentPosition` once with a status state (`idle|locating|ok|denied`).
- `nearFilter(r)` uses the existing `haversine` from `src/lib/geo.ts`; applied inside `mapPins` (and `visibleIds`) only when near mode is on and a position exists — pure client-side, O(n) over ~1,500 recs.
- The existing map-view geolocation effect is skipped in near mode to avoid a second request; `userPos` is passed to `RecsMap`. `RecsMap` gets an optional `focusUser` prop so `FitAll` fits user+pins (or centers the user at zoom ~16 when empty) instead of the default fit.
- Exit: `navigate({ search: {} })`, reset radius state.
- `NearbyCard`: `onSeeAll` and card tap navigate to `/recommendations?near=1`.
- Verify: `bunx tsgo --noEmit`, `bun run build`. Browser check limited: the test account has no trip with data.
