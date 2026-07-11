## Scope
Only `src/components/RecsMap.tsx` and `src/routes/recommendations.tsx`. No other files, no data changes.

## Changes

### 1. `recommendations.tsx` — pass richer pin data + status
Extend `mapPins` (currently `{id, lat, lng, type, name}`) to also include the fields the popup needs:
- `city`, `address`, `status`, `rating`, `google_maps_url`
Keep the same `type` filter (active tab) and city pill filter and coord-not-null filter.

Update the `RecsMap` invocation to add a new `onAddToDay(id)` prop that reuses the existing `setMapPickRec` flow *only if* the popup's "+ הוסף ליום" is preferred to be handled inline. Since the spec says buttons live inside the popup itself, we'll implement them inside `RecsMap` and delete the `mapPickRec` `BottomSheet`-based `MapPickCard` path is NOT required — but to keep behavior compatible we'll:
- Keep `onPinTap` as a no-op (or remove usage). Instead the pin popup renders the ניווט / הוסף ליום buttons directly.
- The "+ הוסף ליום" button in the popup calls `onAddToDay(rec.id)` → parent opens the existing day-picker bottom sheet by setting `mapPickRec` to that rec (reusing existing `MapPickCard` which shows the day list).

Result: tapping a pin shows the Leaflet popup with details + navigation button; tapping "+ הוסף ליום" opens the existing day-picker sheet.

### 2. `RecsMap.tsx` — full rewrite of pin + popup rendering

**Props:**
```ts
type RecPin = {
  id: string; lat: number; lng: number; type: string; name: string;
  city: string | null; address: string | null;
  status: string; rating: number | null;
  google_maps_url: string | null;
};
props: { pins: RecPin[]; userPos: {lat,lng}|null;
         onAddToDay: (id: string) => void }
```

**Emoji pin (`L.divIcon`)** — 40×40 white circle, 2.5px colored border, type emoji inside:
- food → 🍜, border `#FF6B6B`
- attraction → ⛩, border `#6C63FF`
- hotel → 🏨, border `#FFD93D`
- `iconAnchor: [20,20]`, box-shadow as spec.

**User dot** — 16×16 `#4A90E2` circle, 3px white border, halo shadow, `iconAnchor:[8,8]`, `zIndexOffset: 1000`.

**Popup** — Leaflet `<Popup className="custom-popup" closeButton={false}>` (style already exists in `styles.css` from DayMap work). Content:
- Name (bold, 14px, `dir="ltr"`)
- `city · address` muted 12px
- Status badge: רשימה (muted) / ביקרנו (accent-3 tint) / דילגנו (muted line-through)
- If `status === "visited"` and `rating`: ★ × rating in accent-2
- Row of two buttons:
  - `[🗺 ניווט]` — `<a href={google_maps_url} target="_blank">`, disabled/greyed if URL missing
  - `[+ הוסף ליום]` — `<button onClick={() => onAddToDay(rec.id)}>`

Popup opens by default on marker click (native Leaflet behavior). No custom onPinTap needed.

### 3. FitBounds
Replace current `FitAll` logic with:
- 0 pins → `map.setView([35.6762, 139.6503], 10)`
- 1 pin → `map.setView([p.lat,p.lng], 15)`
- ≥2 pins → `map.fitBounds(L.latLngBounds(pins), { padding: [40,40] })` (approx 15% of a phone viewport). Include `userPos` in bounds only when present (keeps current behavior).

### 4. Empty-map path
The parent already renders an empty-state placeholder when `mapPins.length === 0`, so RecsMap always receives ≥1 pin in practice. The 0-pin branch in RecsMap remains as a safety fallback (Japan default center).

## Non-goals
- No changes to tabs (no "הכל" tab exists; current tab always filters by one type — the "all types" clause is moot with the current UI).
- No changes to CSS files; `.custom-popup` was already added by earlier work in `styles.css`.
- No changes to hotels list, forms, or data flow.
