CREATE TABLE public.item_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  token_id uuid REFERENCES public.api_tokens(id),
  created_by uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('itinerary','expenses')),
  request_id uuid NOT NULL,
  payload_hash text NOT NULL,
  note text,
  ops jsonb NOT NULL,
  op_count integer NOT NULL,
  base jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','applied','rejected')),
  result jsonb,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '72 hours'),
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX item_proposals_token_request_uq ON public.item_proposals(token_id, request_id);
CREATE INDEX item_proposals_trip_idx ON public.item_proposals(trip_id, kind, status);
GRANT SELECT ON public.item_proposals TO authenticated;
GRANT ALL ON public.item_proposals TO service_role;
ALTER TABLE public.item_proposals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trip members read item proposals" ON public.item_proposals
  FOR SELECT TO authenticated USING (public.can_access_trip(trip_id));

CREATE OR REPLACE FUNCTION public.item_proposals_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_setting('app.in_item_proposal', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'item_proposals can only be written by proposal functions';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id <> OLD.id OR NEW.trip_id <> OLD.trip_id OR NEW.token_id IS DISTINCT FROM OLD.token_id
       OR NEW.created_by <> OLD.created_by OR NEW.kind <> OLD.kind OR NEW.ops <> OLD.ops OR NEW.base <> OLD.base
       OR NEW.note IS DISTINCT FROM OLD.note OR NEW.expires_at <> OLD.expires_at OR NEW.created_at <> OLD.created_at
       OR NEW.request_id <> OLD.request_id OR NEW.payload_hash <> OLD.payload_hash OR NEW.op_count <> OLD.op_count THEN
      RAISE EXCEPTION 'Proposal content is immutable';
    END IF;
    IF OLD.status <> 'pending' THEN RAISE EXCEPTION 'Proposal is final'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER item_proposals_guard BEFORE INSERT OR UPDATE ON public.item_proposals
  FOR EACH ROW EXECUTE FUNCTION public.item_proposals_guard();

CREATE OR REPLACE FUNCTION public._item_token_live(_token_id uuid, _trip_id uuid, _scope text)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.api_tokens t JOIN public.trips tr ON tr.id = t.trip_id
    WHERE t.id = _token_id AND t.trip_id = _trip_id
      AND t.revoked_at IS NULL AND t.expires_at > now() AND _scope = ANY(t.scopes)
      AND (tr.owner_id = t.user_id OR t.user_id = ANY(tr.shared_user_ids)))
$$;

CREATE OR REPLACE FUNCTION public._expense_sig(_e public.expenses)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT md5(to_jsonb(_e)::text)
$$;

CREATE OR REPLACE FUNCTION public._item_money_ctx(_trip_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT jsonb_build_object(
    'base_currency', upper(COALESCE(NULLIF(s.base_currency, ''), 'ILS')),
    'target_currency', upper(COALESCE(NULLIF(tr.currency_code, ''), NULLIF(s.foreign_currency, ''), 'ILS')),
    'manual_rate', CASE WHEN s.manual_exchange_rate > 0 THEN s.manual_exchange_rate END)
  FROM public.trips tr LEFT JOIN public.settings s ON s.trip_id = tr.id
  WHERE tr.id = _trip_id
  ORDER BY s.id LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public._is_google_maps_url(_u text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT COALESCE(_u ~ '^https://(www\.)?(google\.[a-z.]+/maps|maps\.google\.[a-z.]+/)', false)
$$;

CREATE OR REPLACE FUNCTION public._item_text_ok(_o jsonb, _k text, _max int)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT NOT (_o ? _k) OR (jsonb_typeof(_o->_k) IN ('string','null') AND char_length(COALESCE(_o->>_k, '')) <= _max)
$$;

CREATE OR REPLACE FUNCTION public.api_create_itinerary_proposal(_hash text, _trip_id uuid, _request_id uuid, _ops jsonb, _note text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _r record; _t public.api_tokens%ROWTYPE; _ex public.item_proposals%ROWTYPE; _ph text;
  _vid uuid; _vc int; _o jsonb; _k text; _day public.itinerary_days%ROWTYPE; _cur public.day_entries%ROWTYPE;
  _rows record; _rec record; _loc jsonb; _src text; _sname text; _set jsonb; _vals jsonb; _out jsonb := '[]';
  _items jsonb := '{}'; _ids uuid[] := '{}'; _lat numeric; _lng numeric; _pending int; _id uuid; _exp timestamptz;
BEGIN
  IF _request_id IS NULL THEN RETURN jsonb_build_object('status','invalid_ops','reason','request_id_required'); END IF;
  SELECT * INTO _r FROM public.api_resolve_token(_hash, _trip_id);
  IF _r.status IS DISTINCT FROM 'ok' THEN RETURN jsonb_build_object('status', COALESCE(_r.status,'invalid')); END IF;
  SELECT * INTO _t FROM public.api_tokens t WHERE t.token_hash = _hash;
  IF _t.trip_id IS NULL OR NOT ('propose_itinerary' = ANY(_t.scopes)) OR _t.trip_id <> _r.resolved_trip_id THEN
    RETURN jsonb_build_object('status','missing_scope');
  END IF;
  IF _ops IS NULL OR jsonb_typeof(_ops) <> 'array' OR jsonb_array_length(_ops) = 0 OR jsonb_array_length(_ops) > 10
     OR octet_length(_ops::text) > 65536 OR octet_length(COALESCE(_note,'')) > 2000 THEN
    RETURN jsonb_build_object('status','invalid_ops');
  END IF;
  _ph := md5(jsonb_build_array('itinerary', _ops, NULLIF(btrim(_note),''))::text);
  PERFORM pg_advisory_xact_lock(hashtextextended(_t.id::text || _request_id::text, 0));
  SELECT * INTO _ex FROM public.item_proposals p WHERE p.token_id = _t.id AND p.request_id = _request_id;
  IF FOUND THEN
    IF _ex.payload_hash = _ph THEN RETURN jsonb_build_object('status','ok','id',_ex.id,'expires_at',_ex.expires_at,'replayed',true); END IF;
    RETURN jsonb_build_object('status','idempotency_conflict');
  END IF;

  SELECT count(*), (array_agg(v.id))[1] INTO _vc, _vid FROM public.itinerary_versions v WHERE v.trip_id = _t.trip_id AND v.is_active;
  IF _vc <> 1 THEN RETURN jsonb_build_object('status','no_active_version'); END IF;

  FOR _o IN SELECT * FROM jsonb_array_elements(_ops) LOOP
    IF jsonb_typeof(_o) <> 'object' OR NOT COALESCE(_o->>'op' IN ('add','update'), false) THEN RETURN jsonb_build_object('status','invalid_ops','reason','bad_op'); END IF;
    FOR _k IN SELECT jsonb_object_keys(_o) LOOP
      IF _k NOT IN ('op','id','date','entry_type','title','description','time_of_day','location_name',
                    'latitude','longitude','google_maps_url','source_saved_place_id','location_decision')
         OR (_o->>'op' = 'add' AND _k IN ('id','location_decision'))
         OR (_o->>'op' = 'update' AND _k = 'date') THEN
        RETURN jsonb_build_object('status','invalid_ops','reason','bad_key');
      END IF;
    END LOOP;
    IF NOT (public._item_text_ok(_o,'title',200) AND public._item_text_ok(_o,'description',2000)
        AND public._item_text_ok(_o,'location_name',300) AND public._item_text_ok(_o,'google_maps_url',2000)
        AND public._item_text_ok(_o,'time_of_day',5)) THEN
      RETURN jsonb_build_object('status','invalid_ops','reason','bad_field');
    END IF;
    IF _o ? 'entry_type' AND (jsonb_typeof(_o->'entry_type') <> 'string'
        OR NOT (_o->>'entry_type' = ANY (enum_range(NULL::public.entry_type)::text[])) OR _o->>'entry_type' = 'hotel_checkin') THEN
      RETURN jsonb_build_object('status','invalid_ops','reason','bad_entry_type');
    END IF;
    IF _o ? 'title' AND NULLIF(btrim(COALESCE(_o->>'title','')),'') IS NULL THEN RETURN jsonb_build_object('status','invalid_ops','reason','title_required'); END IF;
    IF jsonb_typeof(_o->'time_of_day') = 'string' AND (_o->>'time_of_day') !~ '^([01]\d|2[0-3]):[0-5]\d$' THEN
      RETURN jsonb_build_object('status','invalid_ops','reason','bad_time');
    END IF;
    IF (_o ? 'latitude') <> (_o ? 'longitude') THEN RETURN jsonb_build_object('status','invalid_ops','reason','bad_coordinates'); END IF;
    IF _o ? 'latitude' THEN
      IF jsonb_typeof(_o->'latitude') <> 'number' OR jsonb_typeof(_o->'longitude') <> 'number' THEN RETURN jsonb_build_object('status','invalid_ops','reason','bad_coordinates'); END IF;
      _lat := (_o->>'latitude')::numeric; _lng := (_o->>'longitude')::numeric;
      IF _lat < -90 OR _lat > 90 OR _lng < -180 OR _lng > 180 OR (_lat = 0 AND _lng = 0) THEN RETURN jsonb_build_object('status','invalid_ops','reason','bad_coordinates'); END IF;
    END IF;
    IF jsonb_typeof(_o->'google_maps_url') = 'string' AND NOT public._is_google_maps_url(_o->>'google_maps_url') THEN
      RETURN jsonb_build_object('status','invalid_ops','reason','bad_url');
    END IF;
    IF _o ? 'location_decision' AND NOT COALESCE(_o->>'location_decision' IN ('keep','clear'), false) THEN
      RETURN jsonb_build_object('status','invalid_ops','reason','bad_location_decision');
    END IF;

    _loc := NULL; _src := NULL; _sname := NULL;
    IF _o ? 'source_saved_place_id' THEN
      IF jsonb_typeof(_o->'source_saved_place_id') <> 'string'
         OR (_o->>'source_saved_place_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        RETURN jsonb_build_object('status','invalid_ops','reason','bad_source');
      END IF;
      SELECT rc.name, rc.latitude, rc.longitude, rc.google_maps_url INTO _rec FROM public.recommendations rc
        WHERE rc.id = (_o->>'source_saved_place_id')::uuid AND rc.trip_id = _t.trip_id;
      IF NOT FOUND THEN RETURN jsonb_build_object('status','invalid_ops','reason','bad_source'); END IF;
      _sname := _rec.name;
      IF _rec.latitude IS NOT NULL AND _rec.longitude IS NOT NULL AND _rec.latitude BETWEEN -90 AND 90
         AND _rec.longitude BETWEEN -180 AND 180 AND NOT (_rec.latitude = 0 AND _rec.longitude = 0) THEN
        _loc := jsonb_build_object('latitude', _rec.latitude, 'longitude', _rec.longitude,
          'google_maps_url', CASE WHEN public._is_google_maps_url(_rec.google_maps_url) THEN _rec.google_maps_url END);
        _src := 'saved';
      ELSE
        _loc := jsonb_build_object('latitude', NULL, 'longitude', NULL, 'google_maps_url', NULL);
        _src := 'saved_missing';
      END IF;
    ELSIF _o ? 'latitude' THEN
      _loc := jsonb_build_object('latitude', _lat, 'longitude', _lng, 'google_maps_url', NULLIF(_o->>'google_maps_url',''));
      _src := 'supplied';
    ELSIF NULLIF(_o->>'google_maps_url','') IS NOT NULL THEN
      _loc := jsonb_build_object('latitude', NULL, 'longitude', NULL, 'google_maps_url', _o->>'google_maps_url');
      _src := 'supplied_url';
    END IF;
    IF _loc IS NOT NULL AND _o ? 'location_decision' THEN RETURN jsonb_build_object('status','invalid_ops','reason','bad_location_decision'); END IF;

    _vals := jsonb_strip_nulls(jsonb_build_object(
      'entry_type', _o->>'entry_type', 'title', btrim(_o->>'title')))
      || CASE WHEN _o ? 'description' THEN jsonb_build_object('description', NULLIF(btrim(COALESCE(_o->>'description','')),'')) ELSE '{}' END
      || CASE WHEN _o ? 'time_of_day' THEN jsonb_build_object('time_of_day', NULLIF(_o->>'time_of_day','')) ELSE '{}' END
      || CASE WHEN _o ? 'location_name' THEN jsonb_build_object('location_name', NULLIF(btrim(COALESCE(_o->>'location_name','')),'')) ELSE '{}' END;

    IF _o->>'op' = 'add' THEN
      IF jsonb_typeof(_o->'date') IS DISTINCT FROM 'string' OR (_o->>'date') !~ '^\d{4}-\d{2}-\d{2}$' THEN RETURN jsonb_build_object('status','invalid_ops','reason','date_required'); END IF;
      IF NOT (_o ? 'title') OR NOT (_o ? 'entry_type') THEN RETURN jsonb_build_object('status','invalid_ops','reason','title_and_type_required'); END IF;
      _day := NULL;
      BEGIN
        SELECT * INTO _day FROM public.itinerary_days d WHERE d.trip_id = _t.trip_id AND d.version_id = _vid AND d.date = (_o->>'date')::date
          ORDER BY d.day_number, d.id LIMIT 1;
      EXCEPTION WHEN others THEN RETURN jsonb_build_object('status','invalid_ops','reason','bad_date');
      END;
      IF _day.id IS NULL THEN RETURN jsonb_build_object('status','day_not_found'); END IF;
      _out := _out || jsonb_build_array(jsonb_build_object('op','add','day_id',_day.id,'date',_day.date,'day_number',_day.day_number,
        'values', _vals || COALESCE(_loc, '{}'::jsonb),
        'location', jsonb_build_object('source', COALESCE(_src,'none'), 'source_name', _sname)));
    ELSE
      IF jsonb_typeof(_o->'id') IS DISTINCT FROM 'string' OR (_o->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        RETURN jsonb_build_object('status','invalid_ops','reason','id_required');
      END IF;
      IF (_o->>'id')::uuid = ANY(_ids) THEN RETURN jsonb_build_object('status','invalid_ops','reason','duplicate_id'); END IF;
      _ids := _ids || (_o->>'id')::uuid;
      SELECT e.* INTO _cur FROM public.day_entries e JOIN public.itinerary_days d ON d.id = e.day_id
        WHERE e.id = (_o->>'id')::uuid AND d.trip_id = _t.trip_id AND d.version_id = _vid;
      IF NOT FOUND THEN RETURN jsonb_build_object('status','item_not_found'); END IF;
      SELECT x.* INTO _rows FROM public._day_replace_rows(_cur.day_id) x WHERE x.id = _cur.id;
      IF _rows.is_protected THEN RETURN jsonb_build_object('status','protected_item'); END IF;
      IF _vals = '{}'::jsonb AND _loc IS NULL AND NOT (_o ? 'location_decision') THEN
        RETURN jsonb_build_object('status','invalid_ops','reason','empty_update');
      END IF;
      _set := _vals;
      IF _loc IS NOT NULL THEN
        _set := _set || _loc;
      ELSIF _o->>'location_decision' = 'clear' THEN
        _set := _set || jsonb_build_object('latitude', NULL, 'longitude', NULL, 'google_maps_url', NULL);
        _src := 'cleared';
      ELSIF ((_vals ? 'title' AND lower(btrim(_vals->>'title')) <> lower(btrim(_cur.title)))
          OR (_vals ? 'location_name' AND lower(btrim(COALESCE(_vals->>'location_name',''))) <> lower(btrim(COALESCE(_cur.location_name,'')))))
          AND (_cur.latitude IS NOT NULL OR _cur.google_maps_url IS NOT NULL) THEN
        IF _o->>'location_decision' = 'keep' THEN _src := 'kept';
        ELSE RETURN jsonb_build_object('status','invalid_ops','reason','location_decision_required'); END IF;
      ELSE
        _src := 'unchanged';
      END IF;
      _items := _items || jsonb_build_object(_cur.id::text, jsonb_build_object('sig', _rows.row_sig, 'day_id', _cur.day_id, 'before', to_jsonb(_cur)));
      _out := _out || jsonb_build_array(jsonb_build_object('op','update','id',_cur.id,'day_id',_cur.day_id,
        'set', _set, 'location', jsonb_build_object('source', _src, 'source_name', _sname)));
    END IF;
  END LOOP;

  PERFORM 1 FROM public.trips tr WHERE tr.id = _t.trip_id FOR UPDATE;
  SELECT count(*) INTO _pending FROM public.item_proposals p
    WHERE p.trip_id = _t.trip_id AND p.kind = 'itinerary' AND p.status = 'pending' AND p.expires_at > now();
  IF _pending >= 20 THEN RETURN jsonb_build_object('status','quota_exceeded'); END IF;

  PERFORM set_config('app.in_item_proposal','on',true);
  INSERT INTO public.item_proposals(trip_id, token_id, created_by, kind, request_id, payload_hash, note, ops, op_count, base)
  VALUES (_t.trip_id, _t.id, _t.user_id, 'itinerary', _request_id, _ph, NULLIF(btrim(_note),''), _out, jsonb_array_length(_out),
          jsonb_build_object('version_id', _vid, 'items', _items))
  RETURNING id, expires_at INTO _id, _exp;
  PERFORM set_config('app.in_item_proposal','',true);
  RETURN jsonb_build_object('status','ok','id',_id,'expires_at',_exp,'operation_count',jsonb_array_length(_out));
END $$;

CREATE OR REPLACE FUNCTION public.api_create_expense_proposal(_hash text, _trip_id uuid, _request_id uuid, _ops jsonb, _note text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _r record; _t public.api_tokens%ROWTYPE; _ex public.item_proposals%ROWTYPE; _ph text; _o jsonb; _k text;
  _ctx jsonb; _cur public.expenses%ROWTYPE; _set jsonb; _money jsonb; _amt numeric; _cc text; _out jsonb := '[]';
  _items jsonb := '{}'; _ids uuid[] := '{}'; _pending int; _id uuid; _exp timestamptz; _any_money boolean := false;
BEGIN
  IF _request_id IS NULL THEN RETURN jsonb_build_object('status','invalid_ops','reason','request_id_required'); END IF;
  SELECT * INTO _r FROM public.api_resolve_token(_hash, _trip_id);
  IF _r.status IS DISTINCT FROM 'ok' THEN RETURN jsonb_build_object('status', COALESCE(_r.status,'invalid')); END IF;
  SELECT * INTO _t FROM public.api_tokens t WHERE t.token_hash = _hash;
  IF _t.trip_id IS NULL OR NOT ('propose_expenses' = ANY(_t.scopes)) OR _t.trip_id <> _r.resolved_trip_id THEN
    RETURN jsonb_build_object('status','missing_scope');
  END IF;
  IF _ops IS NULL OR jsonb_typeof(_ops) <> 'array' OR jsonb_array_length(_ops) = 0 OR jsonb_array_length(_ops) > 10
     OR octet_length(_ops::text) > 32768 OR octet_length(COALESCE(_note,'')) > 2000 THEN
    RETURN jsonb_build_object('status','invalid_ops');
  END IF;
  _ph := md5(jsonb_build_array('expenses', _ops, NULLIF(btrim(_note),''))::text);
  PERFORM pg_advisory_xact_lock(hashtextextended(_t.id::text || _request_id::text, 0));
  SELECT * INTO _ex FROM public.item_proposals p WHERE p.token_id = _t.id AND p.request_id = _request_id;
  IF FOUND THEN
    IF _ex.payload_hash = _ph THEN RETURN jsonb_build_object('status','ok','id',_ex.id,'expires_at',_ex.expires_at,'replayed',true); END IF;
    RETURN jsonb_build_object('status','idempotency_conflict');
  END IF;
  _ctx := public._item_money_ctx(_t.trip_id);

  FOR _o IN SELECT * FROM jsonb_array_elements(_ops) LOOP
    IF jsonb_typeof(_o) <> 'object' OR NOT COALESCE(_o->>'op' IN ('add','update'), false) THEN RETURN jsonb_build_object('status','invalid_ops','reason','bad_op'); END IF;
    FOR _k IN SELECT jsonb_object_keys(_o) LOOP
      IF _k NOT IN ('op','id','date','category','description','location_name','amount','currency')
         OR (_o->>'op' = 'add' AND _k = 'id') THEN
        RETURN jsonb_build_object('status','invalid_ops','reason','bad_key');
      END IF;
    END LOOP;
    IF NOT (public._item_text_ok(_o,'description',500) AND public._item_text_ok(_o,'location_name',300)) THEN
      RETURN jsonb_build_object('status','invalid_ops','reason','bad_field');
    END IF;
    IF _o ? 'category' AND (jsonb_typeof(_o->'category') <> 'string' OR NOT (_o->>'category' = ANY (enum_range(NULL::public.expense_category)::text[]))) THEN
      RETURN jsonb_build_object('status','invalid_ops','reason','bad_category');
    END IF;
    IF _o ? 'date' THEN
      IF jsonb_typeof(_o->'date') <> 'string' OR (_o->>'date') !~ '^\d{4}-\d{2}-\d{2}$' THEN RETURN jsonb_build_object('status','invalid_ops','reason','bad_date'); END IF;
      BEGIN PERFORM (_o->>'date')::date; EXCEPTION WHEN others THEN RETURN jsonb_build_object('status','invalid_ops','reason','bad_date'); END;
    END IF;
    IF (_o ? 'amount') <> (_o ? 'currency') THEN RETURN jsonb_build_object('status','invalid_ops','reason','amount_and_currency_required'); END IF;
    _money := NULL;
    IF _o ? 'amount' THEN
      IF jsonb_typeof(_o->'amount') <> 'number' OR jsonb_typeof(_o->'currency') <> 'string'
         OR upper(_o->>'currency') !~ '^[A-Z]{3}$' THEN RETURN jsonb_build_object('status','invalid_ops','reason','bad_money'); END IF;
      _amt := (_o->>'amount')::numeric; _cc := upper(_o->>'currency');
      IF _amt <= 0 OR _amt > 1000000000 THEN RETURN jsonb_build_object('status','invalid_ops','reason','bad_money'); END IF;
      IF _cc = _ctx->>'base_currency' THEN
        _money := jsonb_build_object('input_amount', _amt, 'input_currency', _cc, 'base_currency', _ctx->>'base_currency',
          'rate', 1, 'rate_source', 'same', 'amount_ils', _amt, 'amount_foreign', NULL, 'foreign_currency', NULL);
      ELSIF _cc = _ctx->>'target_currency' AND (_ctx->>'manual_rate') IS NOT NULL THEN
        _money := jsonb_build_object('input_amount', _amt, 'input_currency', _cc, 'base_currency', _ctx->>'base_currency',
          'rate', (_ctx->>'manual_rate')::numeric, 'rate_source', 'manual',
          'amount_ils', round(_amt / (_ctx->>'manual_rate')::numeric, 2), 'amount_foreign', _amt, 'foreign_currency', _cc);
      ELSE
        RETURN jsonb_build_object('status','no_valid_rate','reason', _cc);
      END IF;
      _any_money := true;
    END IF;
    _set := '{}'::jsonb
      || CASE WHEN _o ? 'date' THEN jsonb_build_object('expense_date', _o->>'date') ELSE '{}' END
      || CASE WHEN _o ? 'category' THEN jsonb_build_object('category', _o->>'category') ELSE '{}' END
      || CASE WHEN _o ? 'description' THEN jsonb_build_object('description', NULLIF(btrim(COALESCE(_o->>'description','')),'')) ELSE '{}' END
      || CASE WHEN _o ? 'location_name' THEN jsonb_build_object('location_name', NULLIF(btrim(COALESCE(_o->>'location_name','')),'')) ELSE '{}' END
      || CASE WHEN _money IS NOT NULL THEN jsonb_build_object('amount_ils', _money->'amount_ils', 'amount_foreign', _money->'amount_foreign', 'foreign_currency', _money->'foreign_currency') ELSE '{}' END;
    IF _o->>'op' = 'add' THEN
      IF NOT (_o ? 'date') OR NOT (_o ? 'category') OR _money IS NULL THEN
        RETURN jsonb_build_object('status','invalid_ops','reason','date_category_amount_required');
      END IF;
      _out := _out || jsonb_build_array(jsonb_build_object('op','add','values',_set,'money',_money));
    ELSE
      IF jsonb_typeof(_o->'id') IS DISTINCT FROM 'string' OR (_o->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        RETURN jsonb_build_object('status','invalid_ops','reason','id_required');
      END IF;
      IF (_o->>'id')::uuid = ANY(_ids) THEN RETURN jsonb_build_object('status','invalid_ops','reason','duplicate_id'); END IF;
      _ids := _ids || (_o->>'id')::uuid;
      SELECT * INTO _cur FROM public.expenses e WHERE e.id = (_o->>'id')::uuid AND e.trip_id = _t.trip_id;
      IF NOT FOUND THEN RETURN jsonb_build_object('status','item_not_found'); END IF;
      IF _set = '{}'::jsonb THEN RETURN jsonb_build_object('status','invalid_ops','reason','empty_update'); END IF;
      _items := _items || jsonb_build_object(_cur.id::text, jsonb_build_object('sig', public._expense_sig(_cur), 'before', to_jsonb(_cur)));
      _out := _out || jsonb_build_array(jsonb_build_object('op','update','id',_cur.id,'set',_set,'money',_money));
    END IF;
  END LOOP;

  PERFORM 1 FROM public.trips tr WHERE tr.id = _t.trip_id FOR UPDATE;
  SELECT count(*) INTO _pending FROM public.item_proposals p
    WHERE p.trip_id = _t.trip_id AND p.kind = 'expenses' AND p.status = 'pending' AND p.expires_at > now();
  IF _pending >= 20 THEN RETURN jsonb_build_object('status','quota_exceeded'); END IF;

  PERFORM set_config('app.in_item_proposal','on',true);
  INSERT INTO public.item_proposals(trip_id, token_id, created_by, kind, request_id, payload_hash, note, ops, op_count, base)
  VALUES (_t.trip_id, _t.id, _t.user_id, 'expenses', _request_id, _ph, NULLIF(btrim(_note),''), _out, jsonb_array_length(_out),
          jsonb_build_object('money', _ctx, 'has_money', _any_money, 'items', _items))
  RETURNING id, expires_at INTO _id, _exp;
  PERFORM set_config('app.in_item_proposal','',true);
  RETURN jsonb_build_object('status','ok','id',_id,'expires_at',_exp,'operation_count',jsonb_array_length(_out));
END $$;

CREATE OR REPLACE FUNCTION public._item_analyze(_p public.item_proposals)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE _o jsonb; _i int := -1; _res jsonb := '[]'; _vid uuid; _vc int; _vconf boolean := false; _row record; _cur jsonb;
  _conf boolean; _prot boolean; _dups jsonb; _miss boolean; _e public.expenses%ROWTYPE; _mconf boolean := false;
BEGIN
  IF _p.kind = 'itinerary' THEN
    SELECT count(*), (array_agg(v.id))[1] INTO _vc, _vid FROM public.itinerary_versions v WHERE v.trip_id = _p.trip_id AND v.is_active;
    _vconf := _vc <> 1 OR _vid::text IS DISTINCT FROM (_p.base->>'version_id');
  ELSE
    _mconf := COALESCE((_p.base->>'has_money')::boolean, false) AND public._item_money_ctx(_p.trip_id) IS DISTINCT FROM (_p.base->'money');
  END IF;
  FOR _o IN SELECT * FROM jsonb_array_elements(_p.ops) LOOP
    _i := _i + 1; _cur := NULL; _conf := false; _prot := false; _dups := '[]'; _miss := false;
    IF _p.kind = 'itinerary' THEN
      IF _o->>'op' = 'update' THEN
        SELECT x.row_sig, x.is_protected, to_jsonb(e) AS j INTO _row
          FROM public.day_entries e JOIN public.itinerary_days d ON d.id = e.day_id
          CROSS JOIN LATERAL public._day_replace_rows(e.day_id) x
          WHERE e.id = (_o->>'id')::uuid AND x.id = e.id AND d.trip_id = _p.trip_id AND d.version_id::text = _p.base->>'version_id';
        IF NOT FOUND THEN _conf := true;
        ELSE
          _cur := _row.j; _prot := _row.is_protected;
          _conf := _row.row_sig IS DISTINCT FROM (_p.base->'items'->(_o->>'id')->>'sig');
        END IF;
        _miss := CASE WHEN (_o->'set') ? 'latitude' THEN (_o->'set'->>'latitude') IS NULL
                      ELSE COALESCE(_cur->>'latitude', _p.base->'items'->(_o->>'id')->'before'->>'latitude') IS NULL END;
      ELSE
        _conf := NOT EXISTS (SELECT 1 FROM public.itinerary_days d WHERE d.id = (_o->>'day_id')::uuid AND d.trip_id = _p.trip_id
                                AND d.version_id::text = _p.base->>'version_id');
        SELECT COALESCE(jsonb_agg(e.id ORDER BY e.id), '[]') INTO _dups FROM public.day_entries e
          WHERE e.day_id = (_o->>'day_id')::uuid AND lower(btrim(e.title)) = lower(btrim(_o->'values'->>'title'))
            AND COALESCE(e.time_of_day,'') = COALESCE(_o->'values'->>'time_of_day','');
        _miss := (_o->'values'->>'latitude') IS NULL;
      END IF;
      _conf := _conf OR _vconf;
    ELSE
      IF _o->>'op' = 'update' THEN
        SELECT * INTO _e FROM public.expenses x WHERE x.id = (_o->>'id')::uuid AND x.trip_id = _p.trip_id;
        IF NOT FOUND THEN _conf := true;
        ELSE _cur := to_jsonb(_e); _conf := public._expense_sig(_e) IS DISTINCT FROM (_p.base->'items'->(_o->>'id')->>'sig'); END IF;
      ELSE
        SELECT COALESCE(jsonb_agg(x.id ORDER BY x.id), '[]') INTO _dups FROM public.expenses x
          WHERE x.trip_id = _p.trip_id AND x.expense_date::text = _o->'values'->>'expense_date'
            AND x.category::text = _o->'values'->>'category'
            AND (x.amount_ils = (_o->'values'->>'amount_ils')::numeric
                 OR (x.amount_foreign IS NOT NULL AND x.amount_foreign = (_o->'values'->>'amount_foreign')::numeric
                     AND upper(COALESCE(x.foreign_currency,'')) = COALESCE(_o->'values'->>'foreign_currency','')));
      END IF;
      _conf := _conf OR (_mconf AND jsonb_typeof(_o->'money') = 'object');
    END IF;
    _res := _res || jsonb_build_array(jsonb_build_object('index', _i, 'op', _o, 'current', _cur,
      'conflict', _conf, 'protected', _prot, 'duplicate_of', _dups, 'missing_location', _miss));
  END LOOP;
  RETURN _res;
END $$;

CREATE OR REPLACE FUNCTION public._item_view_hash(_p public.item_proposals, _a jsonb)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT md5(jsonb_build_array(_p.id, _p.ops, _p.base, _a)::text)
$$;

CREATE OR REPLACE FUNCTION public.get_item_proposal_view(_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _p public.item_proposals%ROWTYPE; _state text; _a jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _p FROM public.item_proposals p WHERE p.id = _id;
  IF NOT FOUND OR NOT public.can_access_trip(_p.trip_id) THEN RAISE EXCEPTION 'Proposal not found or not accessible'; END IF;
  _state := CASE WHEN _p.status <> 'pending' THEN _p.status WHEN _p.expires_at <= now() THEN 'expired'
    WHEN NOT public._item_token_live(_p.token_id, _p.trip_id, CASE _p.kind WHEN 'itinerary' THEN 'propose_itinerary' ELSE 'propose_expenses' END) THEN 'token_revoked'
    ELSE 'pending' END;
  _a := public._item_analyze(_p);
  RETURN jsonb_build_object('id', _p.id, 'trip_id', _p.trip_id, 'kind', _p.kind, 'state', _state, 'result', _p.result,
    'note', _p.note, 'op_count', _p.op_count, 'expires_at', _p.expires_at, 'created_at', _p.created_at,
    'money', _p.base->'money', 'current_money', CASE WHEN _p.kind = 'expenses' THEN public._item_money_ctx(_p.trip_id) END,
    'days', (SELECT COALESCE(jsonb_object_agg(d.id, jsonb_build_object('date', d.date, 'day_number', d.day_number)), '{}')
             FROM public.itinerary_days d WHERE d.trip_id = _p.trip_id AND d.id::text IN (
               SELECT x->>'day_id' FROM jsonb_array_elements(_p.ops) x)),
    'seen_hash', public._item_view_hash(_p, _a), 'ops', _a);
END $$;

CREATE OR REPLACE FUNCTION public.apply_item_proposal(_id uuid, _seen_hash text, _accept_duplicates int[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _p public.item_proposals%ROWTYPE; _a jsonb; _o jsonb; _s jsonb; _bad jsonb; _ord int;
  _added int := 0; _updated int := 0; _result jsonb; _v jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _p FROM public.item_proposals p WHERE p.id = _id FOR UPDATE;
  IF NOT FOUND OR NOT public.can_access_trip(_p.trip_id) THEN RAISE EXCEPTION 'Proposal not found or not accessible'; END IF;
  IF _p.status = 'applied' THEN RETURN COALESCE(_p.result,'{}') || jsonb_build_object('status','already_applied'); END IF;
  IF _p.status <> 'pending' THEN RETURN jsonb_build_object('status', _p.status); END IF;
  IF _p.expires_at <= now() THEN RETURN jsonb_build_object('status','expired'); END IF;
  IF NOT public._item_token_live(_p.token_id, _p.trip_id, CASE _p.kind WHEN 'itinerary' THEN 'propose_itinerary' ELSE 'propose_expenses' END) THEN
    RETURN jsonb_build_object('status','token_revoked');
  END IF;

  PERFORM 1 FROM public.trips tr WHERE tr.id = _p.trip_id FOR UPDATE;
  IF _p.kind = 'itinerary' THEN
    PERFORM 1 FROM public.itinerary_versions v WHERE v.trip_id = _p.trip_id ORDER BY v.id FOR UPDATE;
    PERFORM 1 FROM public.itinerary_days d WHERE d.id::text IN (SELECT x->>'day_id' FROM jsonb_array_elements(_p.ops) x) ORDER BY d.id FOR UPDATE;
    PERFORM 1 FROM public.day_entries e WHERE e.day_id::text IN (SELECT x->>'day_id' FROM jsonb_array_elements(_p.ops) x) ORDER BY e.id FOR UPDATE;
    PERFORM 1 FROM public.recommendations r WHERE r.id IN (
      SELECT e.linked_recommendation_id FROM public.day_entries e WHERE e.id::text IN (SELECT x->>'id' FROM jsonb_array_elements(_p.ops) x))
      ORDER BY r.id FOR UPDATE;
  ELSE
    PERFORM 1 FROM public.settings s WHERE s.trip_id = _p.trip_id FOR UPDATE;
    PERFORM 1 FROM public.expenses e WHERE e.trip_id = _p.trip_id AND e.id::text IN (SELECT x->>'id' FROM jsonb_array_elements(_p.ops) x) ORDER BY e.id FOR UPDATE;
  END IF;

  _a := public._item_analyze(_p);
  IF _seen_hash IS DISTINCT FROM public._item_view_hash(_p, _a) THEN RETURN jsonb_build_object('status','stale_view'); END IF;
  SELECT COALESCE(jsonb_agg(x->'index'), '[]') INTO _bad FROM jsonb_array_elements(_a) x WHERE (x->>'conflict')::boolean OR (x->>'protected')::boolean;
  IF jsonb_array_length(_bad) > 0 THEN RETURN jsonb_build_object('status','conflict','indexes',_bad); END IF;
  SELECT COALESCE(jsonb_agg(x->'index'), '[]') INTO _bad FROM jsonb_array_elements(_a) x
    WHERE jsonb_array_length(x->'duplicate_of') > 0 AND NOT ((x->>'index')::int = ANY(COALESCE(_accept_duplicates,'{}')));
  IF jsonb_array_length(_bad) > 0 THEN RETURN jsonb_build_object('status','duplicates','indexes',_bad); END IF;

  FOR _o IN SELECT * FROM jsonb_array_elements(_p.ops) LOOP
    IF _p.kind = 'itinerary' THEN
      IF _o->>'op' = 'add' THEN
        _v := _o->'values';
        SELECT COALESCE(max(display_order), -1) + 1 INTO _ord FROM public.day_entries WHERE day_id = (_o->>'day_id')::uuid;
        INSERT INTO public.day_entries(day_id, entry_type, title, description, time_of_day, location_name, latitude, longitude, google_maps_url, display_order)
        VALUES ((_o->>'day_id')::uuid, (_v->>'entry_type')::public.entry_type, _v->>'title', _v->>'description', _v->>'time_of_day',
          _v->>'location_name', (_v->>'latitude')::numeric, (_v->>'longitude')::numeric, _v->>'google_maps_url', _ord);
        _added := _added + 1;
      ELSE
        _s := _o->'set';
        UPDATE public.day_entries e SET
          entry_type = CASE WHEN _s ? 'entry_type' THEN (_s->>'entry_type')::public.entry_type ELSE e.entry_type END,
          title = CASE WHEN _s ? 'title' THEN _s->>'title' ELSE e.title END,
          description = CASE WHEN _s ? 'description' THEN _s->>'description' ELSE e.description END,
          time_of_day = CASE WHEN _s ? 'time_of_day' THEN _s->>'time_of_day' ELSE e.time_of_day END,
          location_name = CASE WHEN _s ? 'location_name' THEN _s->>'location_name' ELSE e.location_name END,
          latitude = CASE WHEN _s ? 'latitude' THEN (_s->>'latitude')::numeric ELSE e.latitude END,
          longitude = CASE WHEN _s ? 'longitude' THEN (_s->>'longitude')::numeric ELSE e.longitude END,
          google_maps_url = CASE WHEN _s ? 'google_maps_url' THEN _s->>'google_maps_url' ELSE e.google_maps_url END
        WHERE e.id = (_o->>'id')::uuid AND e.day_id = (_o->>'day_id')::uuid;
        IF NOT FOUND THEN RAISE EXCEPTION 'target vanished'; END IF;
        _updated := _updated + 1;
      END IF;
    ELSE
      IF _o->>'op' = 'add' THEN
        _v := _o->'values';
        INSERT INTO public.expenses(trip_id, amount_ils, amount_foreign, foreign_currency, category, description, location_name, expense_date)
        VALUES (_p.trip_id, (_v->>'amount_ils')::numeric, (_v->>'amount_foreign')::numeric, _v->>'foreign_currency',
          (_v->>'category')::public.expense_category, _v->>'description', _v->>'location_name', (_v->>'expense_date')::date);
        _added := _added + 1;
      ELSE
        _s := _o->'set';
        UPDATE public.expenses e SET
          expense_date = CASE WHEN _s ? 'expense_date' THEN (_s->>'expense_date')::date ELSE e.expense_date END,
          category = CASE WHEN _s ? 'category' THEN (_s->>'category')::public.expense_category ELSE e.category END,
          description = CASE WHEN _s ? 'description' THEN _s->>'description' ELSE e.description END,
          location_name = CASE WHEN _s ? 'location_name' THEN _s->>'location_name' ELSE e.location_name END,
          amount_ils = CASE WHEN _s ? 'amount_ils' THEN (_s->>'amount_ils')::numeric ELSE e.amount_ils END,
          amount_foreign = CASE WHEN _s ? 'amount_ils' THEN (_s->>'amount_foreign')::numeric ELSE e.amount_foreign END,
          foreign_currency = CASE WHEN _s ? 'amount_ils' THEN _s->>'foreign_currency' ELSE e.foreign_currency END
        WHERE e.id = (_o->>'id')::uuid AND e.trip_id = _p.trip_id;
        IF NOT FOUND THEN RAISE EXCEPTION 'target vanished'; END IF;
        _updated := _updated + 1;
      END IF;
    END IF;
  END LOOP;

  _result := jsonb_build_object('added', _added, 'updated', _updated);
  PERFORM set_config('app.in_item_proposal','on',true);
  UPDATE public.item_proposals SET status = 'applied', result = _result, decided_at = now() WHERE id = _p.id;
  PERFORM set_config('app.in_item_proposal','',true);
  RETURN _result || jsonb_build_object('status','done');
END $$;

CREATE OR REPLACE FUNCTION public.reject_item_proposal(_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _p public.item_proposals%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _p FROM public.item_proposals p WHERE p.id = _id FOR UPDATE;
  IF NOT FOUND OR NOT public.can_access_trip(_p.trip_id) THEN RAISE EXCEPTION 'Proposal not found or not accessible'; END IF;
  IF _p.status <> 'pending' THEN RETURN jsonb_build_object('status', _p.status); END IF;
  PERFORM set_config('app.in_item_proposal','on',true);
  UPDATE public.item_proposals SET status = 'rejected', decided_at = now() WHERE id = _p.id;
  PERFORM set_config('app.in_item_proposal','',true);
  RETURN jsonb_build_object('status','rejected');
END $$;

REVOKE ALL ON FUNCTION public._item_token_live(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._expense_sig(public.expenses) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._item_money_ctx(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._item_analyze(public.item_proposals) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._item_view_hash(public.item_proposals, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.api_create_itinerary_proposal(text, uuid, uuid, jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.api_create_expense_proposal(text, uuid, uuid, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_create_itinerary_proposal(text, uuid, uuid, jsonb, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.api_create_expense_proposal(text, uuid, uuid, jsonb, text) TO service_role;
REVOKE ALL ON FUNCTION public.get_item_proposal_view(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.apply_item_proposal(uuid, text, int[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reject_item_proposal(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_item_proposal_view(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_item_proposal(uuid, text, int[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_item_proposal(uuid) TO authenticated;
