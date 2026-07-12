ALTER TABLE public.recommendations
  ADD COLUMN IF NOT EXISTS google_rating NUMERIC(2,1),
  ADD COLUMN IF NOT EXISTS google_rating_count INTEGER;