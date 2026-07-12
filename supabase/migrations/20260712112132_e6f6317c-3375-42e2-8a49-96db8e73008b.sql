
-- 1. Add ownership + sharing columns to trips (additive, non-destructive)
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS shared_user_ids uuid[] NOT NULL DEFAULT '{}';
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS share_token text UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex');

-- Backfill share_token for any pre-existing rows (DEFAULT only applies to future inserts if column pre-existed)
UPDATE public.trips SET share_token = encode(gen_random_bytes(16), 'hex') WHERE share_token IS NULL;

-- 2. Access helper (SECURITY DEFINER, avoids RLS recursion on trips)
CREATE OR REPLACE FUNCTION public.can_access_trip(_trip_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.trips
    WHERE id = _trip_id
      AND (owner_id = auth.uid() OR auth.uid() = ANY(shared_user_ids))
  )
$$;

-- 3. Claim-by-share-token RPC
CREATE OR REPLACE FUNCTION public.claim_share(_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _trip_id uuid;
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  SELECT id INTO _trip_id FROM public.trips WHERE share_token = _token;
  IF _trip_id IS NULL THEN
    RAISE EXCEPTION 'Invalid share token';
  END IF;
  UPDATE public.trips
    SET shared_user_ids = array_append(shared_user_ids, _uid)
    WHERE id = _trip_id
      AND owner_id IS DISTINCT FROM _uid
      AND NOT (_uid = ANY(shared_user_ids));
  RETURN _trip_id;
END
$$;

GRANT EXECUTE ON FUNCTION public.can_access_trip(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_share(text) TO authenticated;

-- 4. Drop old open policies
DROP POLICY IF EXISTS "open trips" ON public.trips;
DROP POLICY IF EXISTS "open days" ON public.itinerary_days;
DROP POLICY IF EXISTS "open entries" ON public.day_entries;
DROP POLICY IF EXISTS "open recs" ON public.recommendations;
DROP POLICY IF EXISTS "open hotels" ON public.hotels;
DROP POLICY IF EXISTS "open expenses" ON public.expenses;
DROP POLICY IF EXISTS "open settings" ON public.settings;

-- 5. Revoke anon grants; ensure authenticated + service_role have CRUD
REVOKE ALL ON public.trips, public.itinerary_days, public.day_entries, public.recommendations, public.hotels, public.expenses, public.settings FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trips, public.itinerary_days, public.day_entries, public.recommendations, public.hotels, public.expenses, public.settings TO authenticated;
GRANT ALL ON public.trips, public.itinerary_days, public.day_entries, public.recommendations, public.hotels, public.expenses, public.settings TO service_role;

-- 6. Trips policies
CREATE POLICY "trips: members can select" ON public.trips
  FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR auth.uid() = ANY(shared_user_ids) OR owner_id IS NULL);

CREATE POLICY "trips: authenticated can insert as self" ON public.trips
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "trips: members can update" ON public.trips
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid() OR auth.uid() = ANY(shared_user_ids) OR owner_id IS NULL)
  WITH CHECK (owner_id = auth.uid() OR auth.uid() = ANY(shared_user_ids));

CREATE POLICY "trips: owner can delete" ON public.trips
  FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

-- 7. Child-table policies (all use can_access_trip)
CREATE POLICY "days: access via trip" ON public.itinerary_days
  FOR ALL TO authenticated
  USING (public.can_access_trip(trip_id))
  WITH CHECK (public.can_access_trip(trip_id));

CREATE POLICY "entries: access via day's trip" ON public.day_entries
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.itinerary_days d WHERE d.id = day_entries.day_id AND public.can_access_trip(d.trip_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.itinerary_days d WHERE d.id = day_entries.day_id AND public.can_access_trip(d.trip_id)));

CREATE POLICY "recs: access via trip" ON public.recommendations
  FOR ALL TO authenticated
  USING (public.can_access_trip(trip_id))
  WITH CHECK (public.can_access_trip(trip_id));

CREATE POLICY "hotels: access via trip" ON public.hotels
  FOR ALL TO authenticated
  USING (public.can_access_trip(trip_id))
  WITH CHECK (public.can_access_trip(trip_id));

CREATE POLICY "expenses: access via trip" ON public.expenses
  FOR ALL TO authenticated
  USING (public.can_access_trip(trip_id))
  WITH CHECK (public.can_access_trip(trip_id));

CREATE POLICY "settings: access via trip" ON public.settings
  FOR ALL TO authenticated
  USING (public.can_access_trip(trip_id))
  WITH CHECK (public.can_access_trip(trip_id));
