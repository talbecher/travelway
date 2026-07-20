## Add trip deletion (from switcher + settings)

### Where the trash icon appears
1. **Trip switcher sheet** (`TripPicker`): each trip row gets a small trash icon on the left side. Tap → confirm dialog → delete.
2. **Settings** (onboarding edit page): a "מחק טיול זה" destructive button near the bottom, same confirm flow.

### Behavior
- **Confirm dialog** (native `confirm` or existing `ConfirmDialog` if present): "למחוק את הטיול '<title>'? הפעולה בלתי הפיכה." Cancel / מחק.
- **Permission**: only the owner can delete (`trip.owner_id === user.id`). For shared users the trash icon is hidden in the picker; in settings the button is hidden too (or shown disabled with tooltip "רק היוצר יכול למחוק"). Confirm on read.
- **Delete**: DELETE from `trips` where id = tripId AND owner_id = auth.uid(). Cascading rows (itinerary_days, day_entries, recommendations, expenses, hotels) — verify FK ON DELETE CASCADE via `supabase--read_query`; if missing, add a small migration to set cascades before shipping the UI.
- **After delete**:
  - Invalidate `useTripsList` + clear query cache.
  - If the deleted trip was active: pick another trip from the list, `setActiveTripId(nextId)`, navigate `/`.
  - If no trips remain: `setActiveTripId(null)` and navigate to `/onboarding` (first-time flow).
  - Toast: "הטיול נמחק".
- **Sheet UX**: close switcher sheet after deletion.

### Files to touch
- `src/components/TripPicker.tsx` — add trash icon per row (owner only), confirm, delete mutation, post-delete routing via a new `onDelete` callback so both mount points can handle navigation.
- `src/routes/__root.tsx` — wire `SwitchTripButton` to close sheet + route on delete.
- `src/routes/onboarding.tsx` — add "מחק טיול זה" destructive button in the settings section (only when `isEditing` and owner).
- No schema changes unless the FK cascade check shows orphans risk.

### Verification
- Read `trips` FK constraints via `supabase--read_query` before build.
- Owner deletes trip with siblings → active switches, still on `/`.
- Owner deletes last trip → redirected to `/onboarding`.
- Non-owner sees no trash / no delete button.
