## Goal
1. Ensure every field in the "Add / Edit Hotel" form is reachable on mobile and desktop — no hidden fields, sticky save button.
2. Rename the "Recommendations" screen title to "המלצות ומקומות שמורים".

## 1. HotelForm — scrollable body + sticky submit
File: `src/routes/recommendations.tsx` (function `HotelForm`, ~lines 1132-1265).

Apply the same layout pattern already used by `RecForm`:
- Change the `<form>` to `flex flex-col min-h-[62vh] pt-1 pb-2`.
- Wrap the fields area (place search + confirmed place badge + all `Field` rows) inside a scroll container: `<div className="flex-1 overflow-y-auto space-y-3 -mx-1 px-1">…</div>`.
- Move the "שמור" submit button out of the scroll area into a sticky footer:
  `<div className="sticky bottom-0 -mx-5 px-5 pt-3 pb-1 bg-card border-t border-border/60 shrink-0">…</div>`.
- Keep all existing state, mutation, and field logic unchanged.

This ensures the last fields (הערות, לינק להזמנה, פלטפורמה) are reachable via inner scroll and the save button is always visible above the safe-area inset — matching the recommendation form that already works.

## 2. Rename title
File: `src/routes/recommendations.tsx`, line 188.
- Change `<h1>המלצות</h1>` → `<h1>המלצות ומקומות שמורים</h1>`.

Leave bottom-nav label ("המלצות"), home tile label, and other toast strings unchanged — the request is specifically to rename the page title.

## Verification
- Open the hotel add sheet on the mobile viewport preview: scroll inside the sheet reaches the "שמור" button and every field between; button stays pinned.
- Same check on desktop viewport.
- Page header on `/recommendations` displays the new title.
