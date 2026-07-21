## Scope
Two UX changes in `src/routes/itinerary.$dayId.tsx` only. No schema/logic changes elsewhere.

## 1. Quick "note" entry (no location required)

The `note` entry type already exists in the picker and `NoteForm` doesn't require a location — it just isn't easy to discover. The current FAB is labeled "⭐ הוסף ממועדפים" but actually opens the full type picker (all 6 types incl. note), which is confusing.

Changes:
- Rename the FAB to `➕ הוסף פריט` (opens the existing type picker with all 6 types incl. `note`). Same `openPicker` handler.
- Add a small secondary pill directly under the FAB: `📝 הערה מהירה` that opens a new `BottomSheet` with `NoteForm` pre-selected (skips the type grid). Same tone, `bg-card border` style so it's clearly secondary.
- New local state `noteOpen`; sheet renders `<EntryForm entryType="note" .../>` and closes on save/back.

Result: adding a planning note / reminder is one tap away and doesn't go through the type-selection grid.

## 2. "לפרטים" opens a real Details sheet (not the actions menu)

Currently `לפרטים ›` opens the actions BottomSheet (edit / open in maps / update location / delete). We split this in two:

- **New `detailsFor` state + Details BottomSheet** — this is what `לפרטים` now opens. Shows:
  - Large photo (or emoji tile fallback) at top.
  - Title + type badge (colored dot + label) + time pill.
  - Location line (`📍 <location_name>`) — tap opens Google Maps if coords/URL exist.
  - Description (full text, `whitespace-pre-line`, no line clamp).
  - Linked recommendation info when `linked_recommendation_id` set: fetched once via a small `useQuery` for the rec row → shows rating (★), city, notes, "פתח בהמלצות" link. (Read-only; uses existing `recommendations` table.)
  - Bottom action row: `ערוך`, `פתח במפה` (if coords or maps URL), `עדכן מיקום` (if no coords and not a note), `מחק` — same handlers as today, just relocated. Closing the sheet routes into `setEditEntry` / `setEditLocationEntry` / `del.mutate` as before.
- Keep the existing `actionsFor` BottomSheet code path but stop using it from the card. `⋯` is no longer needed on the card. (We can delete `actionsFor` state and sheet entirely — actions live in the Details sheet now.)

Wiring:
- `SortableEntry` prop renamed `onOpenActions` → `onOpenDetails`. Card `לפרטים ›` button calls it.
- Parent passes `() => setDetailsFor(e)`.

## Files touched
- `src/routes/itinerary.$dayId.tsx` — add `noteOpen` + Note sheet + `📝 הערה מהירה` pill; replace actions sheet with a Details sheet that shows full info and hosts the actions row; rename main FAB to `➕ הוסף פריט`.

## Not touched
- Schema, mutations, DnD, map, PlacesSearch, SegmentConnector, routing, other routes, styles.css.
