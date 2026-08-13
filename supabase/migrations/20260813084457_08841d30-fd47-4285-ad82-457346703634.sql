CREATE TABLE public.itinerary_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'ai')),
  ai_tool TEXT,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.itinerary_versions TO authenticated;
GRANT ALL ON public.itinerary_versions TO service_role;

ALTER TABLE public.itinerary_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "versions: access via trip" ON public.itinerary_versions
  FOR ALL TO authenticated
  USING (public.can_access_trip(trip_id))
  WITH CHECK (public.can_access_trip(trip_id));

CREATE INDEX idx_itinerary_versions_trip ON public.itinerary_versions(trip_id);

ALTER TABLE public.itinerary_days
  ADD COLUMN IF NOT EXISTS version_id UUID REFERENCES public.itinerary_versions(id) ON DELETE CASCADE;

INSERT INTO public.itinerary_versions (trip_id, name, source, is_active)
SELECT id, 'המסלול שלי', 'manual', true FROM public.trips;

UPDATE public.itinerary_days d
SET version_id = v.id
FROM public.itinerary_versions v
WHERE v.trip_id = d.trip_id AND d.version_id IS NULL;

CREATE INDEX idx_itinerary_days_version ON public.itinerary_days(version_id);