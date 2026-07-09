
-- Enums
CREATE TYPE public.entry_type AS ENUM ('flight','hotel_checkin','attraction','food','transport','note');
CREATE TYPE public.rec_type AS ENUM ('food','attraction','hotel');
CREATE TYPE public.rec_status AS ENUM ('wishlist','visited','skipped');
CREATE TYPE public.hotel_type AS ENUM ('hotel','ryokan','other');
CREATE TYPE public.expense_category AS ENUM ('food','attraction','transport','shopping','accommodation','other');

-- trips
CREATE TABLE public.trips (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  destination_country TEXT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  num_travelers INT NOT NULL DEFAULT 2,
  total_budget_ils NUMERIC NOT NULL DEFAULT 0,
  entry_pin TEXT NOT NULL,
  currency_code TEXT NOT NULL DEFAULT 'JPY',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trips TO anon, authenticated;
GRANT ALL ON public.trips TO service_role;
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open trips" ON public.trips FOR ALL USING (true) WITH CHECK (true);

-- itinerary_days
CREATE TABLE public.itinerary_days (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  day_number INT NOT NULL,
  city_label TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX itinerary_days_trip_idx ON public.itinerary_days(trip_id, day_number);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.itinerary_days TO anon, authenticated;
GRANT ALL ON public.itinerary_days TO service_role;
ALTER TABLE public.itinerary_days ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open days" ON public.itinerary_days FOR ALL USING (true) WITH CHECK (true);

-- recommendations (create before day_entries since day_entries references it)
CREATE TABLE public.recommendations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type public.rec_type NOT NULL,
  city TEXT,
  address TEXT,
  google_maps_url TEXT,
  latitude NUMERIC,
  longitude NUMERIC,
  notes TEXT,
  status public.rec_status NOT NULL DEFAULT 'wishlist',
  rating INT CHECK (rating BETWEEN 1 AND 5),
  review TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recommendations TO anon, authenticated;
GRANT ALL ON public.recommendations TO service_role;
ALTER TABLE public.recommendations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open recs" ON public.recommendations FOR ALL USING (true) WITH CHECK (true);

-- day_entries
CREATE TABLE public.day_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  day_id UUID NOT NULL REFERENCES public.itinerary_days(id) ON DELETE CASCADE,
  entry_type public.entry_type NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  time_of_day TEXT,
  location_name TEXT,
  google_maps_url TEXT,
  icon_emoji TEXT,
  display_order INT NOT NULL DEFAULT 0,
  linked_recommendation_id UUID REFERENCES public.recommendations(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX day_entries_day_idx ON public.day_entries(day_id, display_order);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.day_entries TO anon, authenticated;
GRANT ALL ON public.day_entries TO service_role;
ALTER TABLE public.day_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open entries" ON public.day_entries FOR ALL USING (true) WITH CHECK (true);

-- hotels
CREATE TABLE public.hotels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  hotel_name TEXT NOT NULL,
  type public.hotel_type NOT NULL DEFAULT 'hotel',
  city TEXT,
  checkin_date DATE,
  checkout_date DATE,
  price_per_night_ils NUMERIC,
  total_cost_ils NUMERIC,
  booking_platform TEXT,
  confirmation_url TEXT,
  cancellation_deadline DATE,
  notes TEXT,
  post_stay_rating INT CHECK (post_stay_rating BETWEEN 1 AND 5),
  post_stay_review TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hotels TO anon, authenticated;
GRANT ALL ON public.hotels TO service_role;
ALTER TABLE public.hotels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open hotels" ON public.hotels FOR ALL USING (true) WITH CHECK (true);

-- expenses
CREATE TABLE public.expenses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  amount_ils NUMERIC NOT NULL,
  amount_foreign NUMERIC,
  foreign_currency VARCHAR(8),
  category public.expense_category NOT NULL,
  description TEXT,
  location_name TEXT,
  linked_recommendation_id UUID REFERENCES public.recommendations(id) ON DELETE SET NULL,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX expenses_trip_idx ON public.expenses(trip_id, expense_date DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO anon, authenticated;
GRANT ALL ON public.expenses TO service_role;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open expenses" ON public.expenses FOR ALL USING (true) WITH CHECK (true);

-- settings
CREATE TABLE public.settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE UNIQUE,
  base_currency VARCHAR(8) NOT NULL DEFAULT 'ILS',
  foreign_currency VARCHAR(8) NOT NULL DEFAULT 'JPY',
  manual_exchange_rate NUMERIC
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.settings TO anon, authenticated;
GRANT ALL ON public.settings TO service_role;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open settings" ON public.settings FOR ALL USING (true) WITH CHECK (true);
