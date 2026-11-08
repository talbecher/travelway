ALTER TABLE public.day_replace_proposals ADD COLUMN IF NOT EXISTS location_sources text[] NOT NULL DEFAULT '{}';

CREATE OR REPLACE FUNCTION public.day_replace_proposals_guard()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
BEGIN
  IF current_setting('app.in_day_proposal', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'day_replace_proposals can only be written by proposal functions';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.itinerary_days d WHERE d.id = NEW.day_id AND d.trip_id = NEW.trip_id) THEN
    RAISE EXCEPTION 'Proposal trip does not match day';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id <> OLD.id OR NEW.trip_id <> OLD.trip_id OR NEW.day_id <> OLD.day_id
       OR NEW.token_id IS DISTINCT FROM OLD.token_id OR NEW.created_by <> OLD.created_by
       OR NEW.entries <> OLD.entries OR NEW.entry_count <> OLD.entry_count
       OR NEW.location_sources IS DISTINCT FROM OLD.location_sources
       OR NEW.note IS DISTINCT FROM OLD.note OR NEW.expires_at <> OLD.expires_at
       OR NEW.created_at <> OLD.created_at THEN
      RAISE EXCEPTION 'Proposal content is immutable';
    END IF;
    IF OLD.status <> 'pending' THEN RAISE EXCEPTION 'Proposal is final'; END IF;
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.api_create_day_proposal(_hash text, _trip_id uuid, _date date, _entries jsonb, _note text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _r record; _t public.api_tokens%ROWTYPE; _day public.itinerary_days%ROWTYPE;
  _vid uuid; _vcount int; _e jsonb; _k text; _id uuid; _exp timestamptz; _pending int;
  _out jsonb := '[]'::jsonb; _src text[] := '{}'; _lat numeric; _lng numeric; _n int;
  _m record;
BEGIN
  SELECT * INTO _r FROM public.api_resolve_token(_hash, _trip_id);
  IF _r.status IS DISTINCT FROM 'ok' THEN RETURN jsonb_build_object('status', COALESCE(_r.status, 'invalid')); END IF;
  SELECT * INTO _t FROM public.api_tokens t WHERE t.token_hash = _hash;
  IF _t.trip_id IS NULL OR NOT ('propose_day' = ANY(_t.scopes)) OR _t.trip_id <> _r.resolved_trip_id THEN
    RETURN jsonb_build_object('status', 'missing_scope');
  END IF;

  SELECT count(*), (array_agg(v.id))[1] INTO _vcount, _vid FROM public.itinerary_versions v
    WHERE v.trip_id = _t.trip_id AND v.is_active;
  IF _vcount <> 1 THEN RETURN jsonb_build_object('status', 'day_not_found'); END IF;
  SELECT * INTO _day FROM public.itinerary_days d WHERE d.trip_id = _t.trip_id AND d.version_id = _vid AND d.date = _date
    ORDER BY d.day_number LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'day_not_found'); END IF;

  IF _entries IS NULL OR jsonb_typeof(_entries) <> 'array' OR jsonb_array_length(_entries) = 0
     OR jsonb_array_length(_entries) > 40 OR octet_length(_entries::text) > 65536
     OR octet_length(COALESCE(_note, '')) > 2000 THEN
    RETURN jsonb_build_object('status', 'invalid_entries');
  END IF;
  FOR _e IN SELECT * FROM jsonb_array_elements(_entries) LOOP
    IF jsonb_typeof(_e) <> 'object'
       OR NULLIF(btrim(COALESCE(_e->>'title', '')), '') IS NULL OR char_length(_e->>'title') > 200
       OR NOT (COALESCE(_e->>'entry_type', '') = ANY (enum_range(NULL::public.entry_type)::text[]))
       OR (_e ? 'time_of_day' AND jsonb_typeof(_e->'time_of_day') <> 'null'
           AND (_e->>'time_of_day') !~ '^([01]\d|2[0-3]):[0-5]\d$') THEN
      RETURN jsonb_build_object('status', 'invalid_entries');
    END IF;
    FOR _k IN SELECT jsonb_object_keys(_e) LOOP
      IF _k NOT IN ('entry_type','title','description','time_of_day','location_name','icon_emoji',
                    'latitude','longitude','google_maps_url') THEN
        RETURN jsonb_build_object('status', 'invalid_entries');
      END IF;
      IF _k IN ('latitude','longitude') THEN
        IF jsonb_typeof(_e->_k) <> 'number' THEN RETURN jsonb_build_object('status', 'invalid_entries'); END IF;
      ELSIF jsonb_typeof(_e->_k) NOT IN ('string','null') OR char_length(COALESCE(_e->>_k, '')) > 2000 THEN
        RETURN jsonb_build_object('status', 'invalid_entries');
      END IF;
    END LOOP;
    -- Coordinates: complete, in-range pair only.
    IF (_e ? 'latitude') <> (_e ? 'longitude') THEN RETURN jsonb_build_object('status', 'invalid_entries'); END IF;
    IF _e ? 'google_maps_url' AND jsonb_typeof(_e->'google_maps_url') = 'string'
       AND (_e->>'google_maps_url') !~ '^https://(www\.)?(google\.[a-z.]+/maps|maps\.google\.[a-z.]+/)' THEN
      RETURN jsonb_build_object('status', 'invalid_entries');
    END IF;
    _lat := NULL; _lng := NULL;
    IF _e ? 'latitude' THEN
      _lat := (_e->>'latitude')::numeric; _lng := (_e->>'longitude')::numeric;
      IF _lat < -90 OR _lat > 90 OR _lng < -180 OR _lng > 180 OR (_lat = 0 AND _lng = 0) THEN
        RETURN jsonb_build_object('status', 'invalid_entries');
      END IF;
      -- Exact copy of a stored location from this day or this trip => existing.
      IF EXISTS (SELECT 1 FROM public.day_entries de WHERE de.day_id = _day.id AND de.latitude = _lat AND de.longitude = _lng)
         OR EXISTS (SELECT 1 FROM public.recommendations rc WHERE rc.trip_id = _t.trip_id AND rc.latitude = _lat AND rc.longitude = _lng)
         OR EXISTS (SELECT 1 FROM public.hotels h WHERE h.trip_id = _t.trip_id AND h.latitude = _lat AND h.longitude = _lng) THEN
        _src := _src || 'existing'::text;
      ELSE
        _src := _src || 'ai'::text;
      END IF;
      _out := _out || jsonb_build_array(_e);
    ELSIF NULLIF(_e->>'google_maps_url', '') IS NOT NULL THEN
      _src := _src || 'ai'::text;
      _out := _out || jsonb_build_array(_e);
    ELSE
      -- Conservative preservation: identical title AND identical non-empty location_name, unique row with valid coords.
      SELECT count(*) INTO _n FROM public.day_entries de
        WHERE de.day_id = _day.id
          AND lower(btrim(de.title)) = lower(btrim(_e->>'title'))
          AND NULLIF(btrim(COALESCE(_e->>'location_name','')), '') IS NOT NULL
          AND lower(btrim(COALESCE(de.location_name,''))) = lower(btrim(_e->>'location_name'));
      IF _n = 1 THEN
        SELECT de.latitude, de.longitude, de.google_maps_url INTO _m FROM public.day_entries de
          WHERE de.day_id = _day.id
            AND lower(btrim(de.title)) = lower(btrim(_e->>'title'))
            AND lower(btrim(COALESCE(de.location_name,''))) = lower(btrim(_e->>'location_name'));
      END IF;
      IF _n = 1 AND _m.latitude IS NOT NULL AND _m.longitude IS NOT NULL
         AND _m.latitude BETWEEN -90 AND 90 AND _m.longitude BETWEEN -180 AND 180
         AND NOT (_m.latitude = 0 AND _m.longitude = 0) THEN
        _out := _out || jsonb_build_array(_e || jsonb_strip_nulls(jsonb_build_object(
          'latitude', _m.latitude, 'longitude', _m.longitude, 'google_maps_url', _m.google_maps_url)));
        _src := _src || 'existing'::text;
      ELSE
        _out := _out || jsonb_build_array(_e);
        _src := _src || 'missing'::text;
      END IF;
    END IF;
  END LOOP;

  PERFORM 1 FROM public.trips tr WHERE tr.id = _t.trip_id FOR UPDATE;
  SELECT count(*) INTO _pending FROM public.day_replace_proposals p
    WHERE p.trip_id = _t.trip_id AND p.status = 'pending' AND p.expires_at > now()
      AND public._proposal_token_ok(p.token_id)
      AND public._proposal_done(p.day_id, p.request_id, p.superseded_request_ids) IS NULL;
  IF _pending >= 20 THEN RETURN jsonb_build_object('status', 'quota_exceeded'); END IF;

  PERFORM set_config('app.in_day_proposal', 'on', true);
  INSERT INTO public.day_replace_proposals(trip_id, day_id, token_id, created_by, note, entries, entry_count, fingerprint, location_sources)
  VALUES (_t.trip_id, _day.id, _t.id, _t.user_id, NULLIF(btrim(_note), ''), _out, jsonb_array_length(_out),
          public._day_replace_fingerprint(_day.id), _src)
  RETURNING id, expires_at INTO _id, _exp;
  PERFORM set_config('app.in_day_proposal', '', true);
  RETURN jsonb_build_object('status', 'ok', 'id', _id, 'expires_at', _exp, 'date', _day.date, 'day_number', _day.day_number,
    'location_sources', to_jsonb(_src));
END $function$;

CREATE OR REPLACE FUNCTION public.get_day_proposal_view(_id uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _p public.day_replace_proposals%ROWTYPE; _day public.itinerary_days%ROWTYPE; _done jsonb; _state text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _p FROM public.day_replace_proposals p WHERE p.id = _id;
  IF NOT FOUND OR NOT public.can_access_trip(_p.trip_id) THEN RAISE EXCEPTION 'Proposal not found or not accessible'; END IF;
  SELECT * INTO _day FROM public.itinerary_days d WHERE d.id = _p.day_id AND d.trip_id = _p.trip_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Proposal not found or not accessible'; END IF;
  _done := public._proposal_done(_p.day_id, _p.request_id, _p.superseded_request_ids);
  _state := CASE WHEN _done IS NOT NULL THEN 'applied'
                 WHEN _p.status = 'rejected' THEN 'rejected'
                 WHEN _p.expires_at <= now() THEN 'expired'
                 WHEN NOT public._proposal_token_ok(_p.token_id) THEN 'token_revoked'
                 ELSE 'pending' END;
  RETURN jsonb_build_object(
    'id', _p.id, 'trip_id', _p.trip_id, 'day_id', _p.day_id, 'state', _state, 'result', _done,
    'date', _day.date, 'day_number', _day.day_number, 'city_label', _day.city_label,
    'note', _p.note, 'entries', _p.entries, 'entry_count', _p.entry_count,
    'location_sources', to_jsonb(_p.location_sources),
    'fingerprint', _p.fingerprint, 'expires_at', _p.expires_at, 'created_at', _p.created_at,
    'current', public.prepare_day_replace(_p.day_id),
    'current_rows', (SELECT COALESCE(jsonb_agg(jsonb_build_object('title', x.title, 'time_of_day', x.time_of_day,
        'is_protected', x.is_protected) ORDER BY x.display_order, x.created_at, x.id), '[]'::jsonb)
      FROM public._day_replace_rows(_p.day_id) x));
END $function$;