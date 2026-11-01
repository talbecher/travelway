CREATE OR REPLACE FUNCTION public.api_create_day_proposal(_hash text, _trip_id uuid, _date date, _entries jsonb, _note text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _r record; _t public.api_tokens%ROWTYPE; _day public.itinerary_days%ROWTYPE;
  _vid uuid; _vcount int; _e jsonb; _k text; _id uuid; _exp timestamptz; _pending int;
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
      IF _k NOT IN ('entry_type','title','description','time_of_day','location_name','icon_emoji') THEN
        RETURN jsonb_build_object('status', 'invalid_entries');
      END IF;
      IF jsonb_typeof(_e->_k) NOT IN ('string','null') OR char_length(COALESCE(_e->>_k, '')) > 2000 THEN
        RETURN jsonb_build_object('status', 'invalid_entries');
      END IF;
    END LOOP;
  END LOOP;

  PERFORM 1 FROM public.trips tr WHERE tr.id = _t.trip_id FOR UPDATE;
  SELECT count(*) INTO _pending FROM public.day_replace_proposals p
    WHERE p.trip_id = _t.trip_id AND p.status = 'pending' AND p.expires_at > now()
      AND public._proposal_token_ok(p.token_id)
      AND public._proposal_done(p.day_id, p.request_id, p.superseded_request_ids) IS NULL;
  IF _pending >= 20 THEN RETURN jsonb_build_object('status', 'quota_exceeded'); END IF;

  PERFORM set_config('app.in_day_proposal', 'on', true);
  INSERT INTO public.day_replace_proposals(trip_id, day_id, token_id, created_by, note, entries, entry_count, fingerprint)
  VALUES (_t.trip_id, _day.id, _t.id, _t.user_id, NULLIF(btrim(_note), ''), _entries, jsonb_array_length(_entries),
          public._day_replace_fingerprint(_day.id))
  RETURNING id, expires_at INTO _id, _exp;
  PERFORM set_config('app.in_day_proposal', '', true);
  RETURN jsonb_build_object('status', 'ok', 'id', _id, 'expires_at', _exp, 'date', _day.date, 'day_number', _day.day_number);
END $$;
REVOKE ALL ON FUNCTION public.api_create_day_proposal(text, uuid, date, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_create_day_proposal(text, uuid, date, jsonb, text) TO service_role;