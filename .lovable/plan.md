## Fix 3 map/coord bugs

Note: there is no in-form MiniMap preview in the code today, so Bug 1's markup instruction is a no-op — but the CSS half of Bug 1 (Leaflet stacking contexts leaking) is applied globally as instructed.

### Bug 1 — Leaflet z-index leak

`src/styles.css` — append a small block (outside `@theme`):

```css
.leaflet-container { z-index: 0 !important; }
.leaflet-pane,
.leaflet-top,
.leaflet-bottom { z-index: 0 !important; }
```

This keeps Leaflet's internal panes (default z-index 400–700) from floating over the bottom sheet / nav / popovers. The DayMap parent (`#day-split > div`) creates its own stacking context via `overflow:hidden`, so pins still render correctly inside the split view.

### Bug 2+3 — React #418 hydration + partial marker mount

`src/components/DayMap.tsx`:

- Add `const [mounted, setMounted] = useState(false); useEffect(() => setMounted(true), []);`
- Before returning `<MapContainer>`, if `!mounted` return `<MapSkeleton />`.
- Import `MapSkeleton` and `useState` at the top.

`src/routes/itinerary.$dayId.tsx`:

- Remove `lazy`/`Suspense` around DayMap. Change `const DayMap = lazy(...)` to a plain `import DayMap from "@/components/DayMap"`.
- Remove the `<ClientOnly>` and `<Suspense>` wrappers around `<DayMap ...>` — the internal mount guard replaces both.
- Drop the now-unused `lazy`, `Suspense`, `ClientOnly` imports.

The mount guard runs only after hydration, so SSR emits the skeleton, client re-renders the real map — no hydration mismatch, no React #418, all markers mount.

### Bug 4 — Per-form resolved coords

Root cause per the report: coords should live in isolated per-form state, seeded from `existing`, and the insert payload must read from that state (not a shared closure).

`src/routes/itinerary.$dayId.tsx` — in `LodgingForm` and `PlaceForm`:

- Add:
  ```ts
  const [resolvedCoords, setResolvedCoords] = useState<{lat:number; lng:number} | null>(
    existing?.latitude != null && existing?.longitude != null
      ? { lat: Number(existing.latitude), lng: Number(existing.longitude) }
      : null
  );
  ```
- Wire the resolver hook to write into this state on success and clear on `idle`/`failed` (small callback prop or explicit setter after `tryResolve`/`scheduleDebounced`).
- On submit:
  ```ts
  const local = parseLatLngFromMapsUrl(mapsUrl);
  const awaited = mapsUrl && !local && !resolvedCoords
    ? await resolver.tryResolve(mapsUrl)
    : null;
  const c = local ?? resolvedCoords ?? awaited;
  mut.mutate({
    ...,
    latitude: c?.lat ?? null,
    longitude: c?.lng ?? null,
  }, ...);
  ```
- The insert payload reads only from this form-scoped `resolvedCoords` / `local` / `awaited` — no reference to any outer or module-level variable.

Because each `EntryForm` instance is keyed (`key={entryType}` in the picker, `key={editEntry.id}` in the editor), the `useState` truly isolates each form. Edits now also correctly preload the existing entry's saved coords instead of starting `null`.

### Files touched

- `src/styles.css` (append CSS block)
- `src/components/DayMap.tsx` (mount guard)
- `src/routes/itinerary.$dayId.tsx` (drop lazy/ClientOnly wrappers; per-form `resolvedCoords` state in `LodgingForm` and `PlaceForm`)

Nothing else changes.
