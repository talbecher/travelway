-- Import sources (e.g. a named Google My Maps map) and many-to-many links to recommendations.
CREATE TABLE public.import_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (btrim(name) <> ''),
  kind text NOT NULL DEFAULT 'google_my_maps',
  source_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_sources TO authenticated;
GRANT ALL ON public.import_sources TO service_role;
ALTER TABLE public.import_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "import_sources: access via trip" ON public.import_sources
  FOR ALL TO authenticated USING (public.can_access_trip(trip_id)) WITH CHECK (public.can_access_trip(trip_id));
CREATE INDEX import_sources_trip_idx ON public.import_sources(trip_id);

-- Deleting a source removes only links; deleting a recommendation removes its links.
CREATE TABLE public.recommendation_sources (
  recommendation_id uuid NOT NULL REFERENCES public.recommendations(id) ON DELETE CASCADE,
  source_id uuid NOT NULL REFERENCES public.import_sources(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (recommendation_id, source_id)
);
GRANT SELECT, INSERT, DELETE ON public.recommendation_sources TO authenticated;
GRANT ALL ON public.recommendation_sources TO service_role;
ALTER TABLE public.recommendation_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "recommendation_sources: same accessible trip" ON public.recommendation_sources
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.import_sources s JOIN public.recommendations r ON r.trip_id = s.trip_id
                 WHERE s.id = source_id AND r.id = recommendation_id AND public.can_access_trip(s.trip_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.import_sources s JOIN public.recommendations r ON r.trip_id = s.trip_id
                 WHERE s.id = source_id AND r.id = recommendation_id AND public.can_access_trip(s.trip_id)));
CREATE INDEX recommendation_sources_source_idx ON public.recommendation_sources(source_id);

-- Atomic My Maps import: creates the source, inserts new recs, links all — one transaction.
-- Auto-match to an existing rec only when both have coords, same normalized name,
-- within 50m, and exactly one candidate. Otherwise a new rec is inserted.
CREATE OR REPLACE FUNCTION public.import_my_map(_trip_id uuid, _name text, _url text, _places jsonb, _city text)
RETURNS TABLE(recommendation_id uuid, is_new boolean, place_index int)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  _source_id uuid;
  _p jsonb;
  _i int := 0;
  _lat numeric; _lng numeric;
  _match uuid; _cnt int;
  _rid uuid;
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
      SELECT count(*), (array_agg(r.id))[1] INTO _cnt, _match
      FROM public.recommendations r
      WHERE r.trip_id = _trip_id
        AND r.latitude IS NOT NULL AND r.longitude IS NOT NULL
        AND lower(btrim(r.name)) = lower(btrim(_p->>'name'))
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
$$;