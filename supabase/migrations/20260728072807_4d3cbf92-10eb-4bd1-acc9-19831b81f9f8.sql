ALTER TABLE public.trips ALTER COLUMN owner_id SET NOT NULL;

DROP POLICY IF EXISTS "trips: members can select" ON public.trips;
CREATE POLICY "trips: members can select" ON public.trips
  FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR auth.uid() = ANY (shared_user_ids));

DROP POLICY IF EXISTS "trips: members can update" ON public.trips;
CREATE POLICY "trips: members can update" ON public.trips
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid() OR auth.uid() = ANY (shared_user_ids))
  WITH CHECK (owner_id = auth.uid() OR auth.uid() = ANY (shared_user_ids));