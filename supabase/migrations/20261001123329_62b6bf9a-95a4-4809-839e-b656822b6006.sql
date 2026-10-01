CREATE TABLE public.api_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  token_hash text NOT NULL UNIQUE,
  label text NOT NULL,
  trip_id uuid REFERENCES public.trips(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  last_used_at timestamptz
);
CREATE INDEX api_tokens_user_idx ON public.api_tokens(user_id);
REVOKE ALL ON public.api_tokens FROM anon, authenticated;
GRANT ALL ON public.api_tokens TO service_role;
ALTER TABLE public.api_tokens ENABLE ROW LEVEL SECURITY;
-- No policies: only the server role can read or write tokens.

CREATE OR REPLACE FUNCTION public.api_resolve_token(_hash text, _trip_id uuid)
RETURNS TABLE(status text, token_user_id uuid, resolved_trip_id uuid)
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _t public.api_tokens%ROWTYPE;
  _trip uuid;
BEGIN
  SELECT * INTO _t FROM public.api_tokens t WHERE t.token_hash = _hash;
  IF NOT FOUND THEN RETURN QUERY SELECT 'invalid'::text, NULL::uuid, NULL::uuid; RETURN; END IF;
  IF _t.revoked_at IS NOT NULL THEN RETURN QUERY SELECT 'revoked'::text, NULL::uuid, NULL::uuid; RETURN; END IF;
  IF _t.expires_at <= now() THEN RETURN QUERY SELECT 'expired'::text, NULL::uuid, NULL::uuid; RETURN; END IF;

  IF _t.trip_id IS NOT NULL THEN
    IF _trip_id IS NOT NULL AND _trip_id <> _t.trip_id THEN
      RETURN QUERY SELECT 'scope_mismatch'::text, NULL::uuid, NULL::uuid; RETURN;
    END IF;
    _trip := _t.trip_id;
  ELSE
    IF _trip_id IS NULL THEN RETURN QUERY SELECT 'missing_trip'::text, NULL::uuid, NULL::uuid; RETURN; END IF;
    _trip := _trip_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.trips tr
    WHERE tr.id = _trip AND (tr.owner_id = _t.user_id OR _t.user_id = ANY(tr.shared_user_ids))
  ) THEN
    RETURN QUERY SELECT 'no_access'::text, NULL::uuid, NULL::uuid; RETURN;
  END IF;

  UPDATE public.api_tokens SET last_used_at = now()
  WHERE id = _t.id AND (last_used_at IS NULL OR last_used_at < now() - interval '5 minutes');

  RETURN QUERY SELECT 'ok'::text, _t.user_id, _trip;
END $$;
REVOKE ALL ON FUNCTION public.api_resolve_token(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_resolve_token(text, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.api_itinerary_items(
  _trip_id uuid, _version_id uuid, _date date,
  _after_date date, _after_order integer, _after_created timestamptz, _after_id uuid,
  _limit integer)
RETURNS TABLE(id uuid, day_date date, day_number integer, display_order integer, created_at timestamptz,
  entry_type text, title text, description text, time_of_day text, location_name text,
  latitude numeric, longitude numeric, google_maps_url text,
  linked_recommendation_id uuid, linked_hotel_id uuid)
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT e.id, d.date, d.day_number, e.display_order, e.created_at,
    e.entry_type::text, e.title, e.description, e.time_of_day, e.location_name,
    e.latitude, e.longitude, e.google_maps_url, e.linked_recommendation_id, e.linked_hotel_id
  FROM public.day_entries e
  JOIN public.itinerary_days d ON d.id = e.day_id
  WHERE d.trip_id = _trip_id AND d.version_id = _version_id
    AND (_date IS NULL OR d.date = _date)
    AND (_after_id IS NULL OR (d.date, e.display_order, e.created_at, e.id) > (_after_date, _after_order, _after_created, _after_id))
  ORDER BY d.date, e.display_order, e.created_at, e.id
  LIMIT LEAST(GREATEST(_limit, 1), 1001)
$$;
REVOKE ALL ON FUNCTION public.api_itinerary_items(uuid, uuid, date, date, integer, timestamptz, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_itinerary_items(uuid, uuid, date, date, integer, timestamptz, uuid, integer) TO service_role;