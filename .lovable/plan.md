## Plan

1. **Clean the existing duplicate hotel expenses**
   - For the current RIO Shinjuku case, remove the old stale hotel expense rows (`Hotel RIO Shinjuku`) that overlap the active hotel record (`rio hotel shinjuku`).
   - Keep exactly one accommodation expense per hotel night for 19.11–24.11, matching the current hotel price.

2. **Make future hotel sync overwrite safely**
   - Update `src/lib/hotels.ts` so hotel-generated expenses are linked to the hotel via `linked_recommendation_id` when possible.
   - Before re-inserting expenses, delete all previous generated expenses for that hotel by:
     - linked hotel/recommendation id
     - current hotel name
     - previous hotel name
     - same trip + accommodation + overlapping stay dates
   - This makes “הוסף למסלול” and editing hotel dates/prices idempotent: tap/save again = replace, not duplicate.

3. **Backfill legacy links where needed**
   - If existing hotel expense rows are still unlinked, link the kept current rows to the hotel id so the next sync can find and overwrite them reliably.

4. **Verify**
   - Re-query accommodation expenses and confirm there are no duplicate RIO rows.
   - Confirm the itinerary sync still creates start/end hotel entries without duplicating expenses.

## Technical details

- I confirmed the duplicate rows are not exact duplicates by name: the old rows are `Hotel RIO Shinjuku`, while the current hotel is `rio hotel shinjuku`, so the current delete-by-name logic only removed the new name and left the old-name rows behind.
- No schema change is required because `expenses.linked_recommendation_id` already exists and references recommendations/hotel recommendation ids.