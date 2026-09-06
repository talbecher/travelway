# Proactive offline mutation blocking

## Goal
Stop every save/add/import action from firing a mutation while the device is offline, and give the user immediate visual feedback (disabled FAB + toast) instead of letting the request fail and relying on the reactive error toast.

## Why more than two files are needed
- The existing reactive handler lives in `src/router.tsx`, but it only runs **after** a mutation fails.
- The actual "+" quick-expense trigger is the `ActionTile` on the home screen (`src/routes/index.tsx`), not inside `src/router.tsx`.
- The save forms are spread across the routes/components listed below.
- `src/router.tsx` will keep its fallback error handler; no edit is required there.

## Files to change

### 1. `src/hooks/use-online.ts`
- Keep `useOnline()` and `isOffline()` as-is.
- Add a small helper:
  ```ts
  export function assertOnline(): boolean {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      toast.error("אין חיבור לאינטרנט", {
        description: "צריך חיבור כדי לשמור",
      });
      return false;
    }
    return true;
  }
  ```
- Import `toast` from `sonner`.

### 2. `src/routes/index.tsx` — quick-expense "+" tile
- Import `useOnline` / `assertOnline`.
- For the `הוצאה מהירה` `ActionTile`:
  - Compute `const isOnline = useOnline()`.
  - Pass an `onClick` that calls `assertOnline()`; if it returns `false`, do nothing (toast already shown).
  - Pass `disabled={!isOnline}` so the tile renders with `opacity-50`.
  - Update `ActionTile` so its `disabled` branch still renders a tappable `<button aria-disabled>` (currently it renders a non-clickable `<div>`), otherwise the toast cannot fire.

### 3. Form submit guards — add at the very top of each handler
Add `if (!assertOnline()) return;` (or the equivalent `navigator.onLine` check + toast) **before** any mutation is called.

| File | Handler(s) |
|------|-------------|
| `src/components/GlobalFab.tsx` | Quick-expense form `onSubmit` |
| `src/routes/recommendations.tsx` | Rec form `onSubmit` (line ~897) and rating save button if it triggers a mutation |
| `src/components/HotelForm.tsx` | Hotel form `onSubmit` |
| `src/routes/onboarding.tsx` | Trip create/edit form `onSubmit` |
| `src/routes/budget.tsx` | Expense form `onSubmit` |
| `src/routes/itinerary.$dayId.tsx` | `FlightForm`, single-night form, hotel-entry form, food/attraction form, `TransportForm`, `NoteForm` |
| `src/routes/documents.tsx` | `handleSave` (save button in document sheet) |
| `src/routes/checklist.tsx` | `quickAdd()` and `EditForm` save button |
| `src/components/ImportFromMyMapsSheet.tsx` | Import button (if treated as a save action) |

### 4. `src/components/OfflineBanner.tsx`
- Add a 6px red pulsing dot to the left of the text when offline.
- Keep the existing "מוצגים נתונים שנשמרו · <timestamp>" line.
- Add inline `@keyframes offline-pulse` (or a CSS class) for the dot.

```text
🔴 אין חיבור · מוצגים נתונים שנשמרו · עודכן לפני 3 דק׳
```

### 5. `src/router.tsx`
- No change. The existing `MutationCache.onError` toast remains a safety net for any guard that is missed.

## Verification
- Run `bunx tsc --noEmit` — must pass with zero errors.
- Confirm the latest `/tmp/observability/build-errors.log` entry reports `build OK`.

## Out of scope
- Delete/remove mutations (e.g., delete expense, delete rec, delete day) are not covered unless they are part of a form save handler. The request focuses on **save/add** actions.
- No new dependencies.
