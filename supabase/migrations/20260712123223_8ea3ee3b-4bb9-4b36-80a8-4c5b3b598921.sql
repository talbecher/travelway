ALTER TABLE public.recommendations ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE public.day_entries ADD COLUMN IF NOT EXISTS photo_url TEXT;