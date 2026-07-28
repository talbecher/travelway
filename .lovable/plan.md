## Fix: remove `owner_id IS NULL` bypass in trips RLS

**Current state (verified):** All 4 trips have non-null `owner_id`. `trips` INSERT policy already requires `owner_id = auth.uid()`, and `onboarding.tsx` always sets it. The `AuthGate` legacy claim step is no longer needed since no unclaimed trips exist.

**Migration:**
- Drop `trips: members can select` and recreate without `owner_id IS NULL`:
  `USING (owner_id = auth.uid() OR auth.uid() = ANY(shared_user_ids))`
- Drop `trips: members can update` and recreate without `owner_id IS NULL` in both `USING` and `WITH CHECK`.
- Set `owner_id` to `NOT NULL` to prevent any future null-owner rows.

**Code:**
- Remove the legacy "claim unowned trips" `.update({ owner_id }).is("owner_id", null)` block from `src/components/AuthGate.tsx` — it becomes a no-op and would fail RLS anyway.

No changes to `can_access_trip` (already correct — no null-owner clause).