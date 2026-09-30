CREATE OR REPLACE FUNCTION public.restore_day_snapshot(_snapshot_id uuid, _pre_restore_name text)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  _snap record;
  _day record;
  _cur jsonb;
  _e jsonb;
  _i int := 0;
  _rec uuid;
  _hotel uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT s.id, s.day_id, s.trip_id, s.entries INTO _snap
  FROM public.day_snapshots s WHERE s.id = _snapshot_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Snapshot not found or not accessible'; END IF;

  SELECT d.id, d.trip_id INTO _day
  FROM public.itinerary_days d WHERE d.id = _snap.day_id FOR UPDATE;
  IF NOT FOUND OR _day.trip_id <> _snap.trip_id THEN
    RAISE EXCEPTION 'Day not found or not accessible';
  END IF;

  -- Validate snapshot structure before any change.
  IF _snap.entries IS NULL OR jsonb_typeof(_snap.entries) <> 'array' THEN
    RAISE EXCEPTION 'Invalid snapshot data';
  END IF;
  FOR _e IN SELECT * FROM jsonb_array_elements(_snap.entries) LOOP
    IF jsonb_typeof(_e) <> 'object'
       OR NULLIF(btrim(COALESCE(_e->>'title', '')), '') IS NULL
       OR (_e->>'entry_type') IS NULL
       OR NOT ((_e->>'entry_type') = ANY (enum_range(NULL::public.entry_type)::text[])) THEN
      RAISE EXCEPTION 'Invalid snapshot entry';
    END IF;
    _rec := NULLIF(_e->>'linked_recommendation_id', '')::uuid;
    IF _rec IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.recommendations r WHERE r.id = _rec AND r.trip_id = _day.trip_id) THEN
      RAISE EXCEPTION 'Snapshot links a recommendation outside this trip or no longer available';
    END IF;
    _hotel := NULLIF(_e->>'linked_hotel_id', '')::uuid;
    IF _hotel IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.hotels h WHERE h.id = _hotel AND h.trip_id = _day.trip_id) THEN
      RAISE EXCEPTION 'Snapshot links a hotel outside this trip or no longer available';
    END IF;
  END LOOP;

  -- Lock existing entries, then capture the pre-restore state.
  PERFORM 1 FROM public.day_entries de WHERE de.day_id = _day.id FOR UPDATE;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'entry_type', de.entry_type, 'title', de.title, 'description', de.description,
      'time_of_day', de.time_of_day, 'location_name', de.location_name,
      'google_maps_url', de.google_maps_url, 'icon_emoji', de.icon_emoji,
      'display_order', de.display_order, 'linked_recommendation_id', de.linked_recommendation_id,
      'linked_hotel_id', de.linked_hotel_id, 'latitude', de.latitude, 'longitude', de.longitude,
      'photo_url', de.photo_url) ORDER BY de.display_order, de.created_at), '[]'::jsonb)
  INTO _cur FROM public.day_entries de WHERE de.day_id = _day.id;

  INSERT INTO public.day_snapshots(day_id, trip_id, name, reason, entries, entry_count)
  VALUES (_day.id, _day.trip_id,
          COALESCE(NULLIF(btrim(_pre_restore_name), ''), 'לפני שחזור'),
          'pre_restore', _cur, jsonb_array_length(_cur));

  DELETE FROM public.day_entries de WHERE de.day_id = _day.id;

  FOR _e IN SELECT * FROM jsonb_array_elements(_snap.entries) LOOP
    INSERT INTO public.day_entries(day_id, entry_type, title, description, time_of_day, location_name,
      google_maps_url, icon_emoji, display_order, linked_recommendation_id, linked_hotel_id,
      latitude, longitude, photo_url)
    VALUES (_day.id, (_e->>'entry_type')::public.entry_type, _e->>'title', _e->>'description',
      _e->>'time_of_day', _e->>'location_name', _e->>'google_maps_url', _e->>'icon_emoji', _i,
      NULLIF(_e->>'linked_recommendation_id', '')::uuid, NULLIF(_e->>'linked_hotel_id', '')::uuid,
      NULLIF(_e->>'latitude', '')::numeric, NULLIF(_e->>'longitude', '')::numeric, _e->>'photo_url');
    _i := _i + 1;
  END LOOP;

  RETURN _i;
END
$$;

REVOKE ALL ON FUNCTION public.restore_day_snapshot(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restore_day_snapshot(uuid, text) TO authenticated;