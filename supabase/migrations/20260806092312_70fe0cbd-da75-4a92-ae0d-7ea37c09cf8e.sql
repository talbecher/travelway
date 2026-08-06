ALTER TABLE public.recommendations
  ADD COLUMN IF NOT EXISTS booking_deadline DATE,
  ADD COLUMN IF NOT EXISTS booking_time TEXT,
  ADD COLUMN IF NOT EXISTS booking_url TEXT,
  ADD COLUMN IF NOT EXISTS booking_note TEXT,
  ADD COLUMN IF NOT EXISTS booking_status TEXT DEFAULT 'none' CHECK (booking_status IN ('none','booked'));