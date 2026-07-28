## Multi-select adding from saved recommendations

Add checkbox multi-select to `SavedRecsPicker` in `src/routes/itinerary.$dayId.tsx` so the user can pick several saved places at once and add them all to the day in one action.

### Behavior
- Each result row gets a checkbox (right side, RTL) alongside the existing row content.
- Tapping the row or checkbox toggles selection instead of adding immediately.
- A sticky action bar at the bottom of the picker shows: `נבחרו N` + primary button `➕ הוסף את כל הנבחרים` + secondary `נקה`.
- The button is disabled while the list is empty.
- On tap: iterate selected recs sequentially and call the existing `addRecommendationToDay(...)` for each (keeps `display_order` correct since it re-reads the count per insert). Show a small progress state ("מוסיף X מתוך N").
- On completion: invalidate `["day-entries", dayId]` and `["day-entries-summary", tripId]` once, toast `✅ נוספו N פעילויות למסלול`, clear selection, and call `onAdded()`.
- On partial failure: toast the error, keep successfully added items added, keep the failed ones still selected so the user can retry.
- Search filter and existing empty-state stay unchanged. Selection persists across search filtering (selected items that get filtered out are still counted).

### Files
- `src/routes/itinerary.$dayId.tsx` — modify `SavedRecsPicker` only. No DB changes, no changes to `addRecommendationToDay`, no new dependencies.
