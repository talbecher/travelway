-- Test-only stand-in for production objects used by 0013/0015. Not a migration.
-- Minimal stand-in for the production schema (columns copied from production information_schema).
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('test.uid', true),'')::uuid $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO PUBLIC;
CREATE TYPE public.expense_category AS ENUM ('food','attraction','transport','shopping','accommodation','other');
CREATE TABLE public.trips (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL DEFAULT 't', start_date date NOT NULL DEFAULT '2026-11-01', end_date date NOT NULL DEFAULT '2026-11-20',
  currency_code text NOT NULL DEFAULT 'JPY', owner_id uuid NOT NULL, shared_user_ids uuid[] NOT NULL DEFAULT '{}');
CREATE TABLE public.settings (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), trip_id uuid NOT NULL, base_currency varchar NOT NULL DEFAULT 'ILS',
  foreign_currency varchar NOT NULL DEFAULT 'JPY', manual_exchange_rate numeric);
CREATE TABLE public.api_tokens (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, token_hash text NOT NULL, label text NOT NULL DEFAULT 'l',
  trip_id uuid, created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT now() + interval '30 days', revoked_at timestamptz,
  last_used_at timestamptz, scopes text[] NOT NULL DEFAULT '{read}');
CREATE TABLE public.expenses (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), trip_id uuid NOT NULL, amount_ils numeric NOT NULL, amount_foreign numeric,
  foreign_currency varchar, category public.expense_category NOT NULL, description text, location_name text, linked_recommendation_id uuid,
  expense_date date NOT NULL DEFAULT CURRENT_DATE, created_at timestamptz NOT NULL DEFAULT now(), linked_hotel_id uuid);
CREATE FUNCTION public.can_access_trip(_trip_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.trips t WHERE t.id = _trip_id AND (t.owner_id = auth.uid() OR auth.uid() = ANY(t.shared_user_ids))) $$;
CREATE FUNCTION public.api_resolve_token(_hash text, _trip_id uuid, OUT status text, OUT resolved_trip_id uuid) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN t.id IS NULL THEN 'invalid' WHEN t.revoked_at IS NOT NULL THEN 'revoked' ELSE 'ok' END, t.trip_id
  FROM (SELECT 1) x LEFT JOIN public.api_tokens t ON t.token_hash = _hash $$;
-- Itinerary objects referenced by 0013 (only in itinerary code paths).
CREATE TABLE public.itinerary_versions (id uuid PRIMARY KEY, trip_id uuid, is_active boolean);
CREATE TABLE public.itinerary_days (id uuid PRIMARY KEY, trip_id uuid, version_id uuid, date date, day_number int);
CREATE TYPE public.entry_type AS ENUM ('attraction','food','transport','note','flight','hotel_checkin');
CREATE TABLE public.day_entries (id uuid PRIMARY KEY, day_id uuid, entry_type public.entry_type, title text, description text, time_of_day text,
  location_name text, latitude numeric, longitude numeric, google_maps_url text, display_order int, linked_recommendation_id uuid);
CREATE TABLE public.recommendations (id uuid PRIMARY KEY);
