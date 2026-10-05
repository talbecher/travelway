REVOKE DELETE, TRUNCATE ON public.day_replace_runs FROM authenticated, anon;

CREATE OR REPLACE FUNCTION public.day_replace_runs_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_setting('app.in_replace_day_entries', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'day_replace_runs can only be written by replace_day_entries';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.itinerary_days d WHERE d.id = NEW.day_id AND d.trip_id = NEW.trip_id) THEN
    RAISE EXCEPTION 'Replace run trip does not match day';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'pending' OR NEW.result IS NOT NULL THEN
      RAISE EXCEPTION 'Replace run must start as pending';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.status <> 'pending' THEN
    RAISE EXCEPTION 'Replace run is final and cannot be changed';
  END IF;
  IF NEW.status NOT IN ('done','day_changed') THEN
    RAISE EXCEPTION 'Invalid replace run transition';
  END IF;
  IF NEW.id <> OLD.id OR NEW.request_id <> OLD.request_id OR NEW.payload_hash <> OLD.payload_hash
     OR NEW.day_id <> OLD.day_id OR NEW.trip_id <> OLD.trip_id OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'Replace run identity fields are immutable';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS day_replace_runs_guard ON public.day_replace_runs;
CREATE TRIGGER day_replace_runs_guard BEFORE INSERT OR UPDATE ON public.day_replace_runs
  FOR EACH ROW EXECUTE FUNCTION public.day_replace_runs_guard();

CREATE OR REPLACE FUNCTION public.replace_day_entries(_day_id uuid, _expected_fingerprint text, _request_id uuid, _entries jsonb, _snapshot_name text)
 RETURNS jsonb LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
DECLARE
  _trip uuid; _hash text; _run public.day_replace_runs%ROWTYPE; _inserted boolean;
  _e jsonb; _snap_entries jsonb; _snap_id uuid; _remove uuid[]; _keep uuid[];
  _new_ids uuid[] := '{}'; _nid uuid; _i int := 0; _result jsonb;
  _prev_flag text := COALESCE(current_setting('app.in_replace_day_entries', true), '');
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _request_id IS NULL OR _expected_fingerprint IS NULL THEN RAISE EXCEPTION 'Missing request data'; END IF;
  IF _entries IS NULL OR jsonb_typeof(_entries) <> 'array' OR jsonb_array_length(_entries) = 0
     OR jsonb_array_length(_entries) > 100 THEN
    RAISE EXCEPTION 'Invalid entries';
  END IF;
  FOR _e IN SELECT * FROM jsonb_array_elements(_entries) LOOP
    IF jsonb_typeof(_e) <> 'object'
       OR NULLIF(btrim(COALESCE(_e->>'title','')), '') IS NULL
       OR NOT (COALESCE(_e->>'entry_type','') = ANY (enum_range(NULL::public.entry_type)::text[]))
       OR _e ? 'linked_recommendation_id' OR _e ? 'linked_hotel_id' THEN
      RAISE EXCEPTION 'Invalid entry';
    END IF;
  END LOOP;

  SELECT d.trip_id INTO _trip FROM public.itinerary_days d WHERE d.id = _day_id FOR UPDATE;
  IF _trip IS NULL OR NOT public.can_access_trip(_trip) THEN
    RAISE EXCEPTION 'Day not found or not accessible';
  END IF;
  PERFORM 1 FROM public.day_entries de WHERE de.day_id = _day_id FOR UPDATE;
  PERFORM 1 FROM public.recommendations r
    WHERE r.id IN (SELECT de.linked_recommendation_id FROM public.day_entries de WHERE de.day_id = _day_id)
    FOR SHARE;

  _hash := md5(_entries::text);
  -- Flag enabled only after auth + input validation; transaction-local; restored before every return.
  -- On error the transaction (or enclosing subtransaction) aborts and the GUC change is rolled back.
  PERFORM set_config('app.in_replace_day_entries', 'on', true);
  INSERT INTO public.day_replace_runs(day_id, trip_id, request_id, payload_hash, status)
  VALUES (_day_id, _trip, _request_id, _hash, 'pending')
  ON CONFLICT (day_id, request_id) DO NOTHING
  RETURNING true INTO _inserted;

  IF _inserted IS NULL THEN
    PERFORM set_config('app.in_replace_day_entries', _prev_flag, true);
    SELECT * INTO _run FROM public.day_replace_runs WHERE day_id = _day_id AND request_id = _request_id;
    IF _run.payload_hash <> _hash THEN
      RETURN jsonb_build_object('status', 'request_conflict');
    ELSIF _run.status = 'done' THEN
      RETURN COALESCE(_run.result, '{}'::jsonb) || jsonb_build_object('status', 'already_applied');
    ELSIF _run.status = 'day_changed' THEN
      RETURN jsonb_build_object('status', 'day_changed');
    ELSE
      RETURN jsonb_build_object('status', 'in_progress');
    END IF;
  END IF;

  IF public._day_replace_fingerprint(_day_id) <> _expected_fingerprint THEN
    UPDATE public.day_replace_runs SET status = 'day_changed', result = jsonb_build_object('status','day_changed')
      WHERE day_id = _day_id AND request_id = _request_id;
    PERFORM set_config('app.in_replace_day_entries', _prev_flag, true);
    RETURN jsonb_build_object('status', 'day_changed');
  END IF;
  PERFORM set_config('app.in_replace_day_entries', _prev_flag, true);

  SELECT array_agg(x.id) FILTER (WHERE NOT x.is_protected), array_agg(x.id) FILTER (WHERE x.is_protected)
    INTO _remove, _keep FROM public._day_replace_rows(_day_id) x;
  _remove := COALESCE(_remove, '{}'); _keep := COALESCE(_keep, '{}');

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'entry_type', de.entry_type, 'title', de.title, 'description', de.description,
      'time_of_day', de.time_of_day, 'location_name', de.location_name,
      'google_maps_url', de.google_maps_url, 'icon_emoji', de.icon_emoji,
      'display_order', de.display_order, 'linked_recommendation_id', de.linked_recommendation_id,
      'linked_hotel_id', de.linked_hotel_id, 'latitude', de.latitude, 'longitude', de.longitude,
      'photo_url', de.photo_url) ORDER BY de.display_order, de.created_at), '[]'::jsonb)
    INTO _snap_entries FROM public.day_entries de WHERE de.day_id = _day_id;
  INSERT INTO public.day_snapshots(day_id, trip_id, name, reason, entries, entry_count)
  VALUES (_day_id, _trip, COALESCE(NULLIF(btrim(_snapshot_name), ''), 'לפני החלפת יום'),
          'ai_replace', _snap_entries, jsonb_array_length(_snap_entries))
  RETURNING id INTO _snap_id;

  DELETE FROM public.day_entries de WHERE de.day_id = _day_id AND de.id = ANY(_remove);

  FOR _e IN SELECT * FROM jsonb_array_elements(_entries) LOOP
    INSERT INTO public.day_entries(day_id, entry_type, title, description, time_of_day, location_name,
      google_maps_url, icon_emoji, display_order, latitude, longitude, photo_url)
    VALUES (_day_id, (_e->>'entry_type')::public.entry_type, btrim(_e->>'title'), NULLIF(_e->>'description',''),
      NULLIF(_e->>'time_of_day',''), NULLIF(_e->>'location_name',''), NULLIF(_e->>'google_maps_url',''),
      NULLIF(_e->>'icon_emoji',''), 100000 + _i,
      NULLIF(_e->>'latitude','')::numeric, NULLIF(_e->>'longitude','')::numeric, NULLIF(_e->>'photo_url',''))
    RETURNING id INTO _nid;
    _new_ids := _new_ids || _nid;
    _i := _i + 1;
  END LOOP;

  WITH base AS (
    SELECT de.id, de.time_of_day,
      CASE WHEN de.id = ANY(_keep) THEN 0 ELSE 1 END AS part, de.display_order, de.created_at
    FROM public.day_entries de
    WHERE de.day_id = _day_id AND (de.id = ANY(_keep) OR de.id = ANY(_new_ids))
  ), seqd AS (
    SELECT id, CASE WHEN time_of_day ~ '^([01]\d|2[0-3]):[0-5]\d$' THEN time_of_day END AS t,
      row_number() OVER (ORDER BY part, display_order, created_at, id) AS seq FROM base
  ), grp AS (
    SELECT id, t, seq, sum(CASE WHEN t IS NOT NULL OR seq = 1 THEN 1 ELSE 0 END) OVER (ORDER BY seq) AS g FROM seqd
  ), gt AS (
    SELECT id, seq, g, first_value(t) OVER (PARTITION BY g ORDER BY seq) AS gtime FROM grp
  ), ord AS (
    SELECT id, row_number() OVER (ORDER BY gtime NULLS FIRST, g, seq) - 1 AS n FROM gt
  )
  UPDATE public.day_entries de SET display_order = ord.n FROM ord
  WHERE de.id = ord.id AND de.display_order IS DISTINCT FROM ord.n;

  _result := jsonb_build_object('removed', cardinality(_remove), 'kept', cardinality(_keep),
    'added', cardinality(_new_ids), 'snapshot_id', _snap_id);
  PERFORM set_config('app.in_replace_day_entries', 'on', true);
  UPDATE public.day_replace_runs SET status = 'done', result = _result
    WHERE day_id = _day_id AND request_id = _request_id;
  PERFORM set_config('app.in_replace_day_entries', _prev_flag, true);
  RETURN _result || jsonb_build_object('status', 'done');
END $function$;