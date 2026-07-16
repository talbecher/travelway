## Problem

In the screenshot of the "הוסף המלצה" (Add Recommendation) sheet on mobile:

1. The map's "מקרא" (legend) chip visibly bleeds through/over the BottomSheet header row — it overlaps the "לינה" category tab.
2. The sheet feels sparse/empty: when a place is selected, the sticky "Save" button sits right under "שם" with a large empty area beneath the sheet, and the form fields feel cramped/misaligned.

### Root cause

- Leaflet's `Legend` in `RecsMap.tsx` uses `zIndex: 500`. It lives inside the map container whose ancestors don't establish a stacking context, so 500 competes on the page. Our `BottomSheet` uses Tailwind `z-50` (z-index: 50) for both overlay and content → the sheet renders **beneath** the legend.
- Add form structure: when only PlacesSearch is showing (no place picked, not manual), the form is only ~2 rows tall, so the drawer auto-sizes short and leaves lots of empty screen. Once a place is selected, the sticky footer button sits directly below "שם" because there is very little vertical rhythm between fields, and Save can occlude the last field on scroll.

## Fix

### 1) BottomSheet z-index (`src/components/BottomSheet.tsx`)

Raise overlay and content above Leaflet's 500/1000 range:

- Overlay: `z-50` → `z-[1000]`
- Content: `z-50` → `z-[1001]`

This is a one-file fix that also protects DayMap/RecsMap sheets everywhere.

### 2) Add Recommendation form polish (`src/routes/recommendations.tsx`, `RecForm`)

- Give the sheet a **minimum working height** so an empty form doesn't collapse the drawer: wrap the form in `min-h-[62vh] flex flex-col` and let the field area `flex-1`. Result: the sheet reserves a comfortable canvas whether the user just opened it or has a place selected.
- Move the segmented type tabs out of `sticky top-0` (they cause the "מקרא" overlap illusion and add no value in a short sheet) — keep them as a normal row with `mb-3`.
- Group fields in a scroll region: `<div className="flex-1 overflow-y-auto space-y-3 -mx-1 px-1">` around name/city/address/notes.
- Sticky Save footer: keep `sticky bottom-0` but drop the gradient (it looks like dead space on dark bg). Use `pt-3 border-t border-border/60 bg-card`.
- Tighten placeSelected chip: reduce padding, single-line address ellipsis is already there — add `gap-3` and `py-2.5`.

### 3) No other files touched

No backend, no data model, no map behavior change. Legend behavior in `RecsMap.tsx` stays exactly the same — the sheet just correctly stacks above it.

## Files

- `src/components/BottomSheet.tsx` — bump z-indexes.
- `src/routes/recommendations.tsx` — `RecForm` layout only (lines ~737–806).

## Verification

- Open Recs → Map view → tap Add (+). Sheet should fully cover the legend; no "מקרא" visible through the header.
- Empty form state renders with generous space, no huge gap at the bottom of the screen.
- With a place selected, name/city/address/notes are all visible and scroll under a clean sticky Save button.
- Typecheck passes.
