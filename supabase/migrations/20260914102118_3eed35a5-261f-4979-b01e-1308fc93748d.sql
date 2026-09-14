ALTER TABLE public.recommendations
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS provider_place_id text;

CREATE UNIQUE INDEX IF NOT EXISTS recommendations_trip_provider_place_uidx
  ON public.recommendations (trip_id, provider, provider_place_id)
  WHERE provider_place_id IS NOT NULL;