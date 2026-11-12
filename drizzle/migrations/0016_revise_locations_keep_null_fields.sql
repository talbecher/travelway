-- Fix: saving a location for a stop on a pending day proposal always failed when the stop had a
-- null-valued field (icon_emoji, description, location_name or time_of_day — the API always sends
-- these keys, often as null).
--
-- Cause: 0009 wrapped the whole entry in jsonb_strip_nulls(_e || {...}), which also removed the
-- stop's own null fields. day_replace_proposals_guard (0012) compares each entry without
-- latitude/longitude/google_maps_url, saw the removed keys and raised 'Proposal content is immutable'.
--
-- What changes: ONLY public.revise_day_proposal_locations, one expression — strip nulls from the new
-- location object only: _e || jsonb_strip_nulls(jsonb_build_object(...)), the same pattern as
-- api_create_day_proposal (0012). Signature, SECURITY DEFINER, search_path and grants are unchanged.
-- The guard trigger is not touched.

CREATE OR REPLACE FUNCTION public.revise_day_proposal_locations(_id uuid, _seen_fingerprint text, _locations jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _p public.day_replace_proposals%ROWTYPE;
  _loc jsonb; _idx int; _lat numeric; _lng numeric; _url text;
  _entries jsonb; _src text[]; _e jsonb; _curfp text; _seen int[] := '{}';
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('status', 'unauthorized'); END IF;
  SELECT * INTO _p FROM public.day_replace_proposals p WHERE p.id = _id FOR UPDATE;
  IF NOT FOUND OR NOT public.can_access_trip(_p.trip_id) THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;
  IF _p.status <> 'pending' THEN RETURN jsonb_build_object('status', 'not_pending'); END IF;
  IF _p.expires_at <= now() THEN RETURN jsonb_build_object('status', 'expired'); END IF;
  IF NOT public._proposal_token_ok(_p.token_id) THEN RETURN jsonb_build_object('status', 'token_revoked'); END IF;
  _curfp := public._day_replace_fingerprint(_p.day_id);
  IF _seen_fingerprint IS DISTINCT FROM _curfp THEN RETURN jsonb_build_object('status', 'day_changed'); END IF;
  IF _locations IS NULL OR jsonb_typeof(_locations) <> 'array'
     OR jsonb_array_length(_locations) = 0 OR jsonb_array_length(_locations) > 40 THEN
    RETURN jsonb_build_object('status', 'invalid_locations');
  END IF;

  _entries := _p.entries;
  _src := COALESCE(_p.location_sources, ARRAY(SELECT 'missing' FROM generate_series(1, _p.entry_count)));

  FOR _loc IN SELECT * FROM jsonb_array_elements(_locations) LOOP
    IF jsonb_typeof(_loc) <> 'object'
       OR jsonb_typeof(_loc->'index') <> 'number'
       OR jsonb_typeof(_loc->'latitude') <> 'number'
       OR jsonb_typeof(_loc->'longitude') <> 'number' THEN
      RETURN jsonb_build_object('status', 'invalid_locations');
    END IF;
    _idx := (_loc->>'index')::int;
    IF _idx < 0 OR _idx >= _p.entry_count OR _idx = ANY(_seen) THEN
      RETURN jsonb_build_object('status', 'invalid_locations');
    END IF;
    _seen := _seen || _idx;
    _lat := (_loc->>'latitude')::numeric; _lng := (_loc->>'longitude')::numeric;
    IF _lat < -90 OR _lat > 90 OR _lng < -180 OR _lng > 180 OR (_lat = 0 AND _lng = 0) THEN
      RETURN jsonb_build_object('status', 'invalid_locations');
    END IF;
    _e := _entries->_idx;
    -- Only fill entries that are still missing coordinates.
    IF (_e ? 'latitude') OR (_e ? 'longitude') OR _src[_idx+1] <> 'missing' THEN
      RETURN jsonb_build_object('status', 'invalid_locations');
    END IF;
    _url := NULL;
    IF _loc ? 'google_maps_url' AND jsonb_typeof(_loc->'google_maps_url') = 'string' THEN
      IF (_loc->>'google_maps_url') !~ '^https://(www\.)?(google\.[a-z.]+/maps|maps\.google\.[a-z.]+/)'
         OR char_length(_loc->>'google_maps_url') > 2000 THEN
        RETURN jsonb_build_object('status', 'invalid_locations');
      END IF;
      _url := _loc->>'google_maps_url';
    END IF;
    _entries := jsonb_set(_entries, ARRAY[_idx::text],
      _e || jsonb_strip_nulls(jsonb_build_object('latitude', _lat, 'longitude', _lng, 'google_maps_url', _url)));
    IF EXISTS (SELECT 1 FROM public.day_entries de WHERE de.day_id = _p.day_id AND de.latitude = _lat AND de.longitude = _lng)
       OR EXISTS (SELECT 1 FROM public.recommendations rc WHERE rc.trip_id = _p.trip_id AND rc.latitude = _lat AND rc.longitude = _lng)
       OR EXISTS (SELECT 1 FROM public.hotels h WHERE h.trip_id = _p.trip_id AND h.latitude = _lat AND h.longitude = _lng) THEN
      _src[_idx+1] := 'existing';
    ELSE
      _src[_idx+1] := 'ai';
    END IF;
  END LOOP;

  PERFORM set_config('app.in_day_proposal_revise', 'on', true);
  UPDATE public.day_replace_proposals SET entries = _entries, location_sources = _src WHERE id = _id;
  PERFORM set_config('app.in_day_proposal_revise', '', true);
  RETURN jsonb_build_object('status', 'ok', 'entry_count', jsonb_array_length(_entries));
END $function$;

REVOKE ALL ON FUNCTION public.revise_day_proposal_locations(uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revise_day_proposal_locations(uuid, text, jsonb) TO authenticated, service_role;
