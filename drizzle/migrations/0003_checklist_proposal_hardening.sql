ALTER TABLE public.checklist_proposals ADD COLUMN request_id uuid, ADD COLUMN payload_hash text;
CREATE UNIQUE INDEX checklist_proposals_token_request_uq ON public.checklist_proposals(token_id, request_id) WHERE request_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.checklist_proposals_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_setting('app.in_checklist_proposal', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'checklist_proposals can only be written by proposal functions';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id <> OLD.id OR NEW.trip_id <> OLD.trip_id OR NEW.token_id IS DISTINCT FROM OLD.token_id
       OR NEW.created_by <> OLD.created_by OR NEW.ops <> OLD.ops OR NEW.base <> OLD.base
       OR NEW.note IS DISTINCT FROM OLD.note OR NEW.expires_at <> OLD.expires_at OR NEW.created_at <> OLD.created_at
       OR NEW.request_id IS DISTINCT FROM OLD.request_id OR NEW.payload_hash IS DISTINCT FROM OLD.payload_hash THEN
      RAISE EXCEPTION 'Proposal content is immutable';
    END IF;
    IF OLD.status <> 'pending' THEN RAISE EXCEPTION 'Proposal is final'; END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public._checklist_sig(_i public.checklist_items)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT md5(jsonb_build_array(_i.id, _i.title, _i.category, _i.priority, _i.due_date, _i.notes, _i.is_done, _i.done_at)::text)
$$;

CREATE OR REPLACE FUNCTION public._checklist_token_live(_token_id uuid, _trip_id uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.api_tokens t JOIN public.trips tr ON tr.id = t.trip_id
    WHERE t.id = _token_id AND t.trip_id = _trip_id
      AND t.revoked_at IS NULL AND t.expires_at > now() AND 'propose_checklist' = ANY(t.scopes)
      AND (tr.owner_id = t.user_id OR t.user_id = ANY(tr.shared_user_ids)))
$$;
REVOKE ALL ON FUNCTION public._checklist_token_ok(uuid) FROM PUBLIC, anon, authenticated, service_role;
COMMENT ON FUNCTION public._checklist_token_ok(uuid) IS 'DEPRECATED: replaced by _checklist_token_live(token, trip)';

CREATE OR REPLACE FUNCTION public._checklist_op_error(_o jsonb)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE _k text; _cats text[] := ARRAY['documents','money','bookings','transport','health','tech','packing','departure','other'];
BEGIN
  IF _o IS NULL OR jsonb_typeof(_o) IS DISTINCT FROM 'object' THEN RETURN 'not_object'; END IF;
  IF jsonb_typeof(_o->'op') IS DISTINCT FROM 'string' OR NOT COALESCE(_o->>'op' IN ('add','update'), false) THEN RETURN 'bad_op'; END IF;
  FOR _k IN SELECT jsonb_object_keys(_o) LOOP
    IF _k NOT IN ('op','id','title','category','priority','due_date','notes','is_done') THEN RETURN 'bad_key'; END IF;
  END LOOP;
  IF _o ? 'title' AND jsonb_typeof(_o->'title') IS DISTINCT FROM 'string' THEN RETURN 'bad_title'; END IF;
  IF _o ? 'category' AND jsonb_typeof(_o->'category') IS DISTINCT FROM 'string' THEN RETURN 'bad_category'; END IF;
  IF _o ? 'priority' AND jsonb_typeof(_o->'priority') IS DISTINCT FROM 'string' THEN RETURN 'bad_priority'; END IF;
  IF _o ? 'due_date' AND jsonb_typeof(_o->'due_date') NOT IN ('string','null') THEN RETURN 'bad_date'; END IF;
  IF _o ? 'notes' AND jsonb_typeof(_o->'notes') NOT IN ('string','null') THEN RETURN 'bad_notes'; END IF;
  IF _o ? 'is_done' AND jsonb_typeof(_o->'is_done') IS DISTINCT FROM 'boolean' THEN RETURN 'bad_is_done'; END IF;
  IF _o->>'op' = 'add' THEN
    IF _o ? 'id' OR _o ? 'is_done' THEN RETURN 'bad_key'; END IF;
    IF NULLIF(btrim(COALESCE(_o->>'title','')), '') IS NULL THEN RETURN 'title_required'; END IF;
  ELSE
    IF jsonb_typeof(_o->'id') IS DISTINCT FROM 'string' OR (_o->>'id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RETURN 'id_required'; END IF;
    IF NOT (_o ?| ARRAY['title','category','priority','due_date','notes','is_done']) THEN RETURN 'empty_update'; END IF;
    IF _o ? 'title' AND NULLIF(btrim(_o->>'title'), '') IS NULL THEN RETURN 'title_required'; END IF;
  END IF;
  IF char_length(COALESCE(_o->>'title','')) > 200 OR char_length(COALESCE(_o->>'notes','')) > 2000 THEN RETURN 'too_long'; END IF;
  IF _o ? 'category' AND NOT COALESCE(_o->>'category' = ANY(_cats), false) THEN RETURN 'bad_category'; END IF;
  IF _o ? 'priority' AND NOT COALESCE(_o->>'priority' IN ('high','normal','low'), false) THEN RETURN 'bad_priority'; END IF;
  IF jsonb_typeof(_o->'due_date') = 'string' THEN
    IF (_o->>'due_date') !~ '^\d{4}-\d{2}-\d{2}$' THEN RETURN 'bad_date'; END IF;
    BEGIN PERFORM (_o->>'due_date')::date; EXCEPTION WHEN others THEN RETURN 'bad_date'; END;
  END IF;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.api_create_checklist_proposal(_hash text, _trip_id uuid, _ops jsonb, _note text, _request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _r record; _t public.api_tokens%ROWTYPE; _o jsonb; _err text; _ids uuid[] := '{}'; _base jsonb;
  _found int; _pending int; _id uuid; _exp timestamptz; _ph text; _ex public.checklist_proposals%ROWTYPE;
BEGIN
  IF _request_id IS NULL THEN RETURN jsonb_build_object('status', 'invalid_ops', 'reason', 'request_id_required'); END IF;
  SELECT * INTO _r FROM public.api_resolve_token(_hash, _trip_id);
  IF _r.status IS DISTINCT FROM 'ok' THEN RETURN jsonb_build_object('status', COALESCE(_r.status, 'invalid')); END IF;
  SELECT * INTO _t FROM public.api_tokens t WHERE t.token_hash = _hash;
  IF _t.trip_id IS NULL OR NOT ('propose_checklist' = ANY(_t.scopes)) OR _t.trip_id <> _r.resolved_trip_id THEN
    RETURN jsonb_build_object('status', 'missing_scope');
  END IF;
  IF _ops IS NULL OR jsonb_typeof(_ops) IS DISTINCT FROM 'array' OR jsonb_array_length(_ops) = 0 OR jsonb_array_length(_ops) > 50
     OR octet_length(_ops::text) > 65536 OR octet_length(COALESCE(_note,'')) > 2000 THEN
    RETURN jsonb_build_object('status', 'invalid_ops');
  END IF;
  _ph := md5(jsonb_build_array(_ops, NULLIF(btrim(_note), ''))::text);

  PERFORM pg_advisory_xact_lock(hashtextextended(_t.id::text || _request_id::text, 0));
  SELECT * INTO _ex FROM public.checklist_proposals p WHERE p.token_id = _t.id AND p.request_id = _request_id;
  IF FOUND THEN
    IF _ex.payload_hash = _ph THEN RETURN jsonb_build_object('status', 'ok', 'id', _ex.id, 'expires_at', _ex.expires_at, 'replayed', true); END IF;
    RETURN jsonb_build_object('status', 'idempotency_conflict');
  END IF;

  FOR _o IN SELECT * FROM jsonb_array_elements(_ops) LOOP
    _err := public._checklist_op_error(_o);
    IF _err IS NOT NULL THEN RETURN jsonb_build_object('status', 'invalid_ops', 'reason', _err); END IF;
    IF _o->>'op' = 'update' THEN
      IF (_o->>'id')::uuid = ANY(_ids) THEN RETURN jsonb_build_object('status', 'invalid_ops', 'reason', 'duplicate_id'); END IF;
      _ids := _ids || (_o->>'id')::uuid;
    END IF;
  END LOOP;
  SELECT count(*), COALESCE(jsonb_object_agg(c.id, public._checklist_sig(c)), '{}'::jsonb) INTO _found, _base
    FROM public.checklist_items c WHERE c.trip_id = _t.trip_id AND c.id = ANY(_ids);
  IF _found <> cardinality(_ids) THEN RETURN jsonb_build_object('status', 'item_not_found'); END IF;

  PERFORM 1 FROM public.trips tr WHERE tr.id = _t.trip_id FOR UPDATE;
  SELECT count(*) INTO _pending FROM public.checklist_proposals p
    WHERE p.trip_id = _t.trip_id AND p.status = 'pending' AND p.expires_at > now();
  IF _pending >= 20 THEN RETURN jsonb_build_object('status', 'quota_exceeded'); END IF;

  PERFORM set_config('app.in_checklist_proposal', 'on', true);
  INSERT INTO public.checklist_proposals(trip_id, token_id, created_by, note, ops, op_count, base, request_id, payload_hash)
  VALUES (_t.trip_id, _t.id, _t.user_id, NULLIF(btrim(_note), ''), _ops, jsonb_array_length(_ops), _base, _request_id, _ph)
  RETURNING id, expires_at INTO _id, _exp;
  PERFORM set_config('app.in_checklist_proposal', '', true);
  RETURN jsonb_build_object('status', 'ok', 'id', _id, 'expires_at', _exp);
END $$;
REVOKE ALL ON FUNCTION public.api_create_checklist_proposal(text, uuid, jsonb, text) FROM PUBLIC, anon, authenticated, service_role;
COMMENT ON FUNCTION public.api_create_checklist_proposal(text, uuid, jsonb, text) IS 'DEPRECATED: replaced by the 5-argument version with _request_id';
REVOKE ALL ON FUNCTION public.api_create_checklist_proposal(text, uuid, jsonb, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_create_checklist_proposal(text, uuid, jsonb, text, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public._checklist_analyze(_p public.checklist_proposals)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = public AS $$
  WITH ops AS (
    SELECT (o.ord - 1)::int AS idx, o.v AS op,
      CASE WHEN o.v->>'op' = 'update' THEN (o.v->>'id')::uuid END AS tid,
      CASE WHEN o.v->>'op' = 'add' OR o.v ? 'title' THEN public._checklist_norm(o.v->>'title') END AS ft
    FROM jsonb_array_elements(_p.ops) WITH ORDINALITY o(v, ord)
  ), cur AS (
    SELECT c.* FROM public.checklist_items c WHERE c.trip_id = _p.trip_id
  ), kept AS (
    SELECT c.id, public._checklist_norm(c.title) AS nt FROM cur c
    WHERE NOT EXISTS (SELECT 1 FROM ops WHERE ops.tid = c.id AND ops.ft IS NOT NULL)
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'index', ops.idx, 'op', ops.op,
    'current', CASE WHEN ops.tid IS NOT NULL THEN (
        SELECT jsonb_build_object('id', c.id, 'title', c.title, 'category', c.category, 'priority', c.priority,
          'due_date', c.due_date, 'notes', c.notes, 'is_done', c.is_done, 'sig', public._checklist_sig(c)) FROM cur c WHERE c.id = ops.tid) END,
    'conflict', ops.tid IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM cur c WHERE c.id = ops.tid AND public._checklist_sig(c) = _p.base->>(ops.tid::text)),
    'duplicate', CASE WHEN ops.ft IS NULL THEN NULL
      WHEN EXISTS (SELECT 1 FROM kept k WHERE k.nt = ops.ft AND k.id IS DISTINCT FROM ops.tid) THEN 'existing'
      WHEN EXISTS (SELECT 1 FROM ops o2 WHERE o2.idx < ops.idx AND o2.ft = ops.ft) THEN 'in_proposal' END,
    'duplicate_of', CASE WHEN ops.ft IS NULL THEN '[]'::jsonb ELSE (
        SELECT COALESCE(jsonb_agg(k.id ORDER BY k.id), '[]'::jsonb) FROM kept k WHERE k.nt = ops.ft AND k.id IS DISTINCT FROM ops.tid) END
  ) ORDER BY ops.idx), '[]'::jsonb) FROM ops
$$;
REVOKE ALL ON FUNCTION public._checklist_analyze(public.checklist_proposals) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._checklist_view_hash(_p public.checklist_proposals, _a jsonb)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT md5(jsonb_build_array(_p.id, _p.ops, _p.base, _a)::text)
$$;
REVOKE ALL ON FUNCTION public._checklist_view_hash(public.checklist_proposals, jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_checklist_proposal_view(_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _p public.checklist_proposals%ROWTYPE; _state text; _a jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _p FROM public.checklist_proposals p WHERE p.id = _id;
  IF NOT FOUND OR NOT public.can_access_trip(_p.trip_id) THEN RAISE EXCEPTION 'Proposal not found or not accessible'; END IF;
  _state := CASE WHEN _p.status <> 'pending' THEN _p.status
                 WHEN _p.expires_at <= now() THEN 'expired'
                 WHEN NOT public._checklist_token_live(_p.token_id, _p.trip_id) THEN 'token_revoked'
                 ELSE 'pending' END;
  _a := public._checklist_analyze(_p);
  RETURN jsonb_build_object('id', _p.id, 'trip_id', _p.trip_id, 'state', _state, 'result', _p.result,
    'note', _p.note, 'op_count', _p.op_count, 'expires_at', _p.expires_at, 'created_at', _p.created_at,
    'seen_hash', public._checklist_view_hash(_p, _a), 'ops', _a);
END $$;

CREATE OR REPLACE FUNCTION public.apply_checklist_proposal(_id uuid, _seen_hash text, _accept_duplicates int[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _p public.checklist_proposals%ROWTYPE; _a jsonb; _o jsonb; _conf jsonb; _dups jsonb;
  _ord int; _added int := 0; _updated int := 0; _result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _p FROM public.checklist_proposals p WHERE p.id = _id FOR UPDATE;
  IF NOT FOUND OR NOT public.can_access_trip(_p.trip_id) THEN RAISE EXCEPTION 'Proposal not found or not accessible'; END IF;
  IF _p.status = 'applied' THEN RETURN COALESCE(_p.result, '{}'::jsonb) || jsonb_build_object('status', 'already_applied'); END IF;
  IF _p.status <> 'pending' THEN RETURN jsonb_build_object('status', _p.status); END IF;
  IF _p.expires_at <= now() THEN RETURN jsonb_build_object('status', 'expired'); END IF;
  IF NOT public._checklist_token_live(_p.token_id, _p.trip_id) THEN RETURN jsonb_build_object('status', 'token_revoked'); END IF;

  PERFORM 1 FROM public.trips tr WHERE tr.id = _p.trip_id FOR UPDATE;
  PERFORM 1 FROM public.checklist_items c WHERE c.trip_id = _p.trip_id ORDER BY c.id FOR UPDATE;

  _a := public._checklist_analyze(_p);
  IF _seen_hash IS DISTINCT FROM public._checklist_view_hash(_p, _a) THEN RETURN jsonb_build_object('status', 'stale_view'); END IF;
  SELECT COALESCE(jsonb_agg(x->'index'), '[]') INTO _conf FROM jsonb_array_elements(_a) x WHERE (x->>'conflict')::boolean;
  IF jsonb_array_length(_conf) > 0 THEN RETURN jsonb_build_object('status', 'conflict', 'indexes', _conf); END IF;
  SELECT COALESCE(jsonb_agg(x->'index'), '[]') INTO _dups FROM jsonb_array_elements(_a) x
    WHERE x->>'duplicate' IS NOT NULL AND NOT ((x->>'index')::int = ANY(COALESCE(_accept_duplicates, '{}')));
  IF jsonb_array_length(_dups) > 0 THEN RETURN jsonb_build_object('status', 'duplicates', 'indexes', _dups); END IF;

  SELECT COALESCE(max(display_order), -1) INTO _ord FROM public.checklist_items WHERE trip_id = _p.trip_id;
  FOR _o IN SELECT * FROM jsonb_array_elements(_p.ops) LOOP
    IF _o->>'op' = 'add' THEN
      _ord := _ord + 1;
      INSERT INTO public.checklist_items(trip_id, title, category, priority, due_date, notes, display_order)
      VALUES (_p.trip_id, btrim(_o->>'title'), COALESCE(_o->>'category', 'other'), COALESCE(_o->>'priority', 'normal'),
        NULLIF(_o->>'due_date','')::date, NULLIF(btrim(COALESCE(_o->>'notes','')), ''), _ord);
      _added := _added + 1;
    ELSIF _o->>'op' = 'update' THEN
      UPDATE public.checklist_items c SET
        title = CASE WHEN _o ? 'title' THEN btrim(_o->>'title') ELSE c.title END,
        category = CASE WHEN _o ? 'category' THEN _o->>'category' ELSE c.category END,
        priority = CASE WHEN _o ? 'priority' THEN _o->>'priority' ELSE c.priority END,
        due_date = CASE WHEN _o ? 'due_date' THEN NULLIF(_o->>'due_date','')::date ELSE c.due_date END,
        notes = CASE WHEN _o ? 'notes' THEN NULLIF(btrim(COALESCE(_o->>'notes','')), '') ELSE c.notes END,
        is_done = CASE WHEN _o ? 'is_done' THEN (_o->>'is_done')::boolean ELSE c.is_done END,
        done_at = CASE WHEN _o ? 'is_done' THEN CASE WHEN (_o->>'is_done')::boolean THEN COALESCE(c.done_at, now()) END ELSE c.done_at END
      WHERE c.id = (_o->>'id')::uuid AND c.trip_id = _p.trip_id;
      _updated := _updated + 1;
    ELSE
      RAISE EXCEPTION 'unknown op';
    END IF;
  END LOOP;

  _result := jsonb_build_object('added', _added, 'updated', _updated);
  PERFORM set_config('app.in_checklist_proposal', 'on', true);
  UPDATE public.checklist_proposals SET status = 'applied', result = _result, decided_at = now() WHERE id = _p.id;
  PERFORM set_config('app.in_checklist_proposal', '', true);
  RETURN _result || jsonb_build_object('status', 'done');
END $$;

REVOKE ALL ON FUNCTION public._checklist_token_live(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._checklist_op_error(jsonb) FROM PUBLIC, anon, authenticated;