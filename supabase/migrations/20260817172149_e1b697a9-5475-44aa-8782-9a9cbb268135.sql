CREATE TABLE public.day_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  day_id uuid NOT NULL REFERENCES public.itinerary_days(id) ON DELETE CASCADE,
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  name text NOT NULL,
  reason text NOT NULL DEFAULT 'manual',
  entries jsonb NOT NULL DEFAULT '[]'::jsonb,
  entry_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.day_snapshots TO authenticated;
GRANT ALL ON public.day_snapshots TO service_role;

ALTER TABLE public.day_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "day_snapshots: access via trip"
ON public.day_snapshots FOR ALL TO authenticated
USING (public.can_access_trip(trip_id))
WITH CHECK (public.can_access_trip(trip_id));

CREATE INDEX day_snapshots_day_created_idx ON public.day_snapshots (day_id, created_at DESC);