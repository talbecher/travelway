-- Test-only stand-in for the production objects that revise_day_proposal_locations and
-- day_replace_proposals_guard touch. Not a migration. Never run against production.
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('test.uid', true),'')::uuid $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO PUBLIC;
CREATE TABLE public.trips (id uuid PRIMARY KEY, owner_id uuid NOT NULL);
CREATE TABLE public.itinerary_days (id uuid PRIMARY KEY, trip_id uuid NOT NULL);
CREATE TABLE public.day_entries (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), day_id uuid, latitude numeric, longitude numeric);
CREATE TABLE public.recommendations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), trip_id uuid, latitude numeric, longitude numeric);
CREATE TABLE public.hotels (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), trip_id uuid, latitude numeric, longitude numeric);
CREATE FUNCTION public.can_access_trip(_trip_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.trips t WHERE t.id = _trip_id AND t.owner_id = auth.uid()) $$;
CREATE FUNCTION public._proposal_token_ok(_token uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
CREATE FUNCTION public._day_replace_fingerprint(_day uuid) RETURNS text LANGUAGE sql STABLE AS $$ SELECT 'FP' $$;
-- Columns as in 0000 + 0007 + 0012.
CREATE TABLE public.day_replace_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), trip_id uuid NOT NULL, day_id uuid NOT NULL, token_id uuid,
  created_by uuid NOT NULL, note text, entries jsonb NOT NULL, entry_count integer NOT NULL, fingerprint text NOT NULL,
  request_id uuid NOT NULL DEFAULT gen_random_uuid(), superseded_request_ids uuid[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending', expires_at timestamptz NOT NULL DEFAULT (now() + interval '72 hours'),
  decided_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
  location_sources text[] NOT NULL DEFAULT '{}', location_source_names text[]);
