CREATE TABLE public.day_replace_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  day_id uuid NOT NULL REFERENCES public.itinerary_days(id) ON DELETE CASCADE,
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  payload_hash text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done','day_changed')),
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (day_id, request_id)
);
GRANT SELECT, INSERT, UPDATE ON public.day_replace_runs TO authenticated;
GRANT ALL ON public.day_replace_runs TO service_role;
ALTER TABLE public.day_replace_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "day_replace_runs: select via trip" ON public.day_replace_runs
  FOR SELECT TO authenticated USING (public.can_access_trip(trip_id));
CREATE POLICY "day_replace_runs: insert pending via trip" ON public.day_replace_runs
  FOR INSERT TO authenticated WITH CHECK (
    status = 'pending' AND public.can_access_trip(trip_id)
    AND EXISTS (SELECT 1 FROM public.itinerary_days d WHERE d.id = day_id AND d.trip_id = day_replace_runs.trip_id));
CREATE POLICY "day_replace_runs: update via trip" ON public.day_replace_runs
  FOR UPDATE TO authenticated USING (public.can_access_trip(trip_id)) WITH CHECK (public.can_access_trip(trip_id));

CREATE OR REPLACE FUNCTION public.day_replace_runs_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
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
CREATE TRIGGER day_replace_runs_guard BEFORE UPDATE ON public.day_replace_runs
  FOR EACH ROW EXECUTE FUNCTION public.day_replace_runs_guard();

-- Single source of truth: rows + protection rule.
CREATE OR REPLACE FUNCTION public._day_replace_rows(_day_id uuid)
RETURNS TABLE(id uuid, entry_type text, title text, time_of_day text, display_order integer,
  created_at timestamptz, linked_recommendation_id uuid, linked_hotel_id uuid,
  booking_status text, is_protected boolean, protect_reason text, row_sig text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT e.id, e.entry_type::text, e.title, e.time_of_day, e.display_order, e.created_at,
    e.linked_recommendation_id, e.linked_hotel_id, r.booking_status,
    (e.entry_type = 'hotel_checkin' OR r.booking_status = 'booked') AS is_protected,
    CASE WHEN e.entry_type = 'hotel_checkin' THEN 'hotel'
         WHEN r.booking_status = 'booked' THEN 'booked' END AS protect_reason,
    concat_ws('|', e.id, e.entry_type, e.title, e.description, e.time_of_day, e.location_name,
      e.google_maps_url, e.icon_emoji, e.display_order, e.linked_recommendation_id, e.linked_hotel_id,
      e.latitude, e.longitude, e.photo_url, r.booking_status) AS row_sig
  FROM public.day_entries e
  JOIN public.itinerary_days d ON d.id = e.day_id
  LEFT JOIN public.recommendations r ON r.id = e.linked_recommendation_id AND r.trip_id = d.trip_id
  WHERE e.day_id = _day_id
  ORDER BY e.display_order, e.created_at, e.id
$$;

CREATE OR REPLACE FUNCTION public._day_replace_fingerprint(_day_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT md5(COALESCE(string_agg(row_sig, E'\n' ORDER BY display_order, created_at, id), ''))
  FROM public._day_replace_rows(_day_id)
$$;

CREATE OR REPLACE FUNCTION public.prepare_day_replace(_day_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE _trip uuid;
BEGIN
  SELECT d.trip_id INTO _trip FROM public.itinerary_days d WHERE d.id = _day_id;
  IF _trip IS NULL OR NOT public.can_access_trip(_trip) THEN
    RAISE EXCEPTION 'Day not found or not accessible';
  END IF;
  RETURN (
    SELECT jsonb_build_object(
      'fingerprint', public._day_replace_fingerprint(_day_id),
      'remove_count', count(*) FILTER (WHERE NOT x.is_protected),
      'keep_count', count(*) FILTER (WHERE x.is_protected),
      'protected', COALESCE(jsonb_agg(jsonb_build_object('id', x.id, 'title', x.title,
          'time_of_day', x.time_of_day, 'reason', x.protect_reason)
        ORDER BY x.display_order, x.created_at) FILTER (WHERE x.is_protected), '[]'::jsonb))
    FROM public._day_replace_rows(_day_id) x);
END $$;

CREATE OR REPLACE FUNCTION public.replace_day_entries(_day_id uuid, _expected_fingerprint text,
  _request_id uuid, _entries jsonb, _snapshot_name text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  _trip uuid; _hash text; _run public.day_replace_runs%ROWTYPE; _inserted boolean;
  _e jsonb; _snap_entries jsonb; _snap_id uuid; _remove uuid[]; _keep uuid[];
  _new_ids uuid[] := '{}'; _nid uuid; _i int := 0; _result jsonb;
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

  -- Lock the day: serializes replaces/retries of the same day.
  SELECT d.trip_id INTO _trip FROM public.itinerary_days d WHERE d.id = _day_id FOR UPDATE;
  IF _trip IS NULL OR NOT public.can_access_trip(_trip) THEN
    RAISE EXCEPTION 'Day not found or not accessible';
  END IF;
  PERFORM 1 FROM public.day_entries de WHERE de.day_id = _day_id FOR UPDATE;
  PERFORM 1 FROM public.recommendations r
    WHERE r.id IN (SELECT de.linked_recommendation_id FROM public.day_entries de WHERE de.day_id = _day_id)
    FOR SHARE;

  _hash := md5(_entries::text);
  INSERT INTO public.day_replace_runs(day_id, trip_id, request_id, payload_hash, status)
  VALUES (_day_id, _trip, _request_id, _hash, 'pending')
  ON CONFLICT (day_id, request_id) DO NOTHING
  RETURNING true INTO _inserted;

  IF _inserted IS NULL THEN
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
    RETURN jsonb_build_object('status', 'day_changed');
  END IF;

  SELECT array_agg(x.id) FILTER (WHERE NOT x.is_protected), array_agg(x.id) FILTER (WHERE x.is_protected)
    INTO _remove, _keep FROM public._day_replace_rows(_day_id) x;
  _remove := COALESCE(_remove, '{}'); _keep := COALESCE(_keep, '{}');

  -- Full backup (same shape as restore_day_snapshot).
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

  -- Server-side merge by time (kept rows in existing order, then new rows in input order;
  -- untimed rows stay attached to the row before them). Only locked kept rows + new rows are touched.
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
  UPDATE public.day_replace_runs SET status = 'done', result = _result
    WHERE day_id = _day_id AND request_id = _request_id;
  RETURN _result || jsonb_build_object('status', 'done');
END $$;

REVOKE ALL ON FUNCTION public._day_replace_rows(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public._day_replace_fingerprint(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.prepare_day_replace(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.replace_day_entries(uuid, text, uuid, jsonb, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.day_replace_runs_guard() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._day_replace_rows(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public._day_replace_fingerprint(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_day_replace(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.replace_day_entries(uuid, text, uuid, jsonb, text) TO authenticated;