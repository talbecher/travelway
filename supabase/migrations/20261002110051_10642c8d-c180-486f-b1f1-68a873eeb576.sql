ALTER TABLE public.recommendations
  ADD COLUMN IF NOT EXISTS name_norm text GENERATED ALWAYS AS (lower(btrim(name))) STORED;
DROP INDEX IF EXISTS public.recommendations_trip_name_norm_idx;
CREATE INDEX IF NOT EXISTS recommendations_trip_name_norm_idx
  ON public.recommendations (trip_id, name_norm);

CREATE OR REPLACE FUNCTION public.import_my_map(_trip_id uuid, _name text, _url text, _places jsonb, _city text)
 RETURNS TABLE(recommendation_id uuid, is_new boolean, place_index integer)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  _source_id uuid;
  _p jsonb;
  _i int := 0;
  _lat numeric; _lng numeric;
  _match uuid; _cnt int;
  _rid uuid;
  _norm text;
  -- 50 m in degrees of latitude, with 10% safety margin. Pre-filter only.
  _dlat float8 := 50.0 / 111320.0 * 1.1;
  _dlng float8;
  _use_lng boolean;
BEGIN
  IF NOT public.can_access_trip(_trip_id) THEN RAISE EXCEPTION 'Trip not accessible'; END IF;
  IF NULLIF(btrim(_name), '') IS NULL THEN RAISE EXCEPTION 'Source name required'; END IF;
  IF jsonb_typeof(_places) <> 'array' OR jsonb_array_length(_places) = 0 THEN RAISE EXCEPTION 'No places'; END IF;

  INSERT INTO public.import_sources(trip_id, name, source_url)
  VALUES (_trip_id, btrim(_name), NULLIF(btrim(_url), '')) RETURNING id INTO _source_id;

  FOR _p IN SELECT * FROM jsonb_array_elements(_places) LOOP
    _lat := NULLIF(_p->>'latitude', '')::numeric;
    _lng := NULLIF(_p->>'longitude', '')::numeric;
    _match := NULL; _cnt := 0;
    IF _lat IS NOT NULL AND _lng IS NOT NULL THEN
      -- Same normalization as before; name_norm is generated as lower(btrim(name)).
      _norm := lower(btrim(_p->>'name'));
      -- Longitude pre-filter only when safe: away from the poles and not crossing ±180.
      _use_lng := abs(_lat::float8) + _dlat < 85;
      IF _use_lng THEN
        _dlng := _dlat / cos(radians(abs(_lat::float8) + _dlat));
        _use_lng := (_lng::float8 - _dlng) > -180 AND (_lng::float8 + _dlng) < 180;
      END IF;

      SELECT count(*), (array_agg(r.id))[1] INTO _cnt, _match
      FROM public.recommendations r
      WHERE r.trip_id = _trip_id
        AND r.name_norm = _norm
        AND r.latitude IS NOT NULL AND r.longitude IS NOT NULL
        AND r.latitude BETWEEN (_lat::float8 - _dlat) AND (_lat::float8 + _dlat)
        AND (NOT _use_lng OR r.longitude BETWEEN (_lng::float8 - _dlng) AND (_lng::float8 + _dlng))
        AND 6371000 * 2 * asin(sqrt(
              power(sin(radians((r.latitude - _lat)::float8) / 2), 2) +
              cos(radians(_lat::float8)) * cos(radians(r.latitude::float8)) *
              power(sin(radians((r.longitude - _lng)::float8) / 2), 2))) <= 50;
    END IF;

    IF _cnt = 1 THEN
      _rid := _match;
      recommendation_id := _rid; is_new := false;
    ELSE
      INSERT INTO public.recommendations(trip_id, type, city, name, notes, latitude, longitude, google_maps_url, status)
      VALUES (_trip_id, (_p->>'type')::rec_type, NULLIF(btrim(_city), ''), _p->>'name',
              NULLIF(_p->>'notes', ''), _lat, _lng, NULLIF(_p->>'google_maps_url', ''), 'wishlist')
      RETURNING id INTO _rid;
      recommendation_id := _rid; is_new := true;
    END IF;

    INSERT INTO public.recommendation_sources(recommendation_id, source_id)
    VALUES (_rid, _source_id) ON CONFLICT DO NOTHING;
    place_index := _i;
    RETURN NEXT;
    _i := _i + 1;
  END LOOP;
END
$function$;