## Goal

Replace the single "נווט את כל היום" footer button with a per-segment navigation UX between consecutive stops, plus a compact "כל היום" walking shortcut at the top of the list.

## Scope

Only `src/routes/itinerary.$dayId.tsx`. No changes to map, coord flow, data, or other files.

## Changes

### 1. Remove footer button
Delete the `directionsEnabled ? <a>...</a> : <button disabled>` block (lines ~326–337) and the "צריך לפחות 2 פריטים..." hint under it. Keep the "הוסף פעילות" button.

### 2. Add "כל היום" summary button at top of list
Above the `DndContext` block (inside the list pane, before the entries map), render a compact button:
- Label: `🗺 פתח את כל היום בגוגל מפות (ברגל)`
- Style: outlined pill, small (h-9, text-xs), full width
- `title` tooltip: `לשינוי מצב תחבורה — השתמש בכפתורי הניווט בין הנקודות למטה`
- Uses existing `googleDirectionsUrl(...)` (walking, multi-waypoint).
- Only shown when `mapStops.length >= 2`. When only 1 stop: hide entirely. When 0 stops: already gated by empty-day view.

### 3. Per-segment connector component
Replace the plain `<div>{connector}</div>` (lines 303–305) with a new inline `SegmentConnector` element rendered when both `a` (prev coords) and `b` (current coords) exist:

```text
    │  (2px vertical line, var(--border), 12px tall)
    ├─ → 1.2 ק״מ          (muted, text-[11px])
    │  [🚶 ברגל] [🚌 תחבורה] [🚗 מכונית]
    │  (2px vertical line, 12px tall)
```

Layout: right-aligned to the card content (`mr-14` matches current indent). Buttons in a horizontal row, 28px height, 12px padding, rounded-full, text-[11px].

Suggested-mode logic (based on `haversine(a, b)` km):
- `< 1.5` → walking is suggested
- `1.5–10` → transit is suggested
- `> 10` → driving is suggested

Suggested pill: `background: var(--accent); color: white; border: transparent`.
Others: `background: transparent; border: 1px solid var(--border); color: var(--foreground)`.

Each pill is an `<a target="_blank" rel="noreferrer">` to:
`https://www.google.com/maps/dir/?api=1&origin={a.lat},{a.lng}&destination={b.lat},{b.lng}&travelmode={walking|transit|driving}`

### 4. Fallback when either side has no coords
Keep the current plain divider behavior: when `a` or `b` is null (i.e. previous connector logic didn't produce a value), show a plain thin 1px divider line (`<div className="h-px bg-border mr-14 my-1" />`) with no distance text and no buttons — replaces the current "no connector rendered at all" behavior only when `prev` exists.

## Technical notes

- All URL construction happens inline in the connector — no changes to `src/lib/coords.ts`. The existing `googleDirectionsUrl` is reused only for the top "כל היום" button.
- `haversine` is already imported and used at line 296; reuse the same `km` value for both distance display and suggested-mode selection.
- Buttons use `target="_blank" rel="noreferrer"` and stop click propagation so drag/reorder is not affected.
- No changes to Supabase, hooks, DayMap, or CSS files.
