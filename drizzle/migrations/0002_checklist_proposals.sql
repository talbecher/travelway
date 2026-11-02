CREATE TABLE public.checklist_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  token_id uuid REFERENCES public.api_tokens(id) ON DELETE SET NULL,
  created_by uuid NOT NULL,
  note text,
  ops jsonb NOT NULL,
  op_count int NOT NULL,
  base jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','applied','rejected')),
  result jsonb,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '72 hours',
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX checklist_proposals_trip_idx ON public.checklist_proposals(trip_id, status);
GRANT SELECT ON public.checklist_proposals TO authenticated;
GRANT ALL ON public.checklist_proposals TO service_role;
ALTER TABLE public.checklist_proposals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trip members read checklist proposals" ON public.checklist_proposals
  FOR SELECT TO authenticated USING (public.can_access_trip(trip_id));

CREATE OR REPLACE FUNCTION public.checklist_proposals_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_setting('app.in_checklist_proposal', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'checklist_proposals can only be written by proposal functions';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id <> OLD.id OR NEW.trip_id <> OLD.trip_id OR NEW.token_id IS DISTINCT FROM OLD.token_id
       OR NEW.created_by <> OLD.created_by OR NEW.ops <> OLD.ops OR NEW.base <> OLD.base
       OR NEW.note IS DISTINCT FROM OLD.note OR NEW.expires_at <> OLD.expires_at OR NEW.created_at <> OLD.created_at THEN
      RAISE EXCEPTION 'Proposal content is immutable';
    END IF;
    IF OLD.status <> 'pending' THEN RAISE EXCEPTION 'Proposal is final'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER checklist_proposals_guard BEFORE INSERT OR UPDATE ON public.checklist_proposals
  FOR EACH ROW EXECUTE FUNCTION public.checklist_proposals_guard();

CREATE OR REPLACE FUNCTION public._checklist_sig(_i public.checklist_items)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT md5(concat_ws('|', _i.title, _i.category, _i.priority, _i.due_date, _i.notes, _i.is_done))
$$;

CREATE OR REPLACE FUNCTION public._checklist_norm(_t text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT lower(regexp_replace(btrim(COALESCE(_t,'')), '\s+', ' ', 'g'))
$$;

CREATE OR REPLACE FUNCTION public._checklist_token_ok(_token_id uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.api_tokens t WHERE t.id = _token_id
    AND t.revoked_at IS NULL AND t.expires_at > now() AND 'propose_checklist' = ANY(t.scopes))
$$;

-- Validates one op; returns NULL when valid, else a reason.
CREATE OR REPLACE FUNCTION public._checklist_op_error(_o jsonb)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE _k text; _cats text[] := ARRAY['documents','money','bookings','transport','health','tech','packing','departure','other'];
BEGIN
  IF jsonb_typeof(_o) <> 'object' THEN RETURN 'not_object'; END IF;
  IF _o->>'op' NOT IN ('add','update') THEN RETURN 'bad_op'; END IF;
  FOR _k IN SELECT jsonb_object_keys(_o) LOOP
    IF _k NOT IN ('op','id','title','category','priority','due_date','notes','is_done') THEN RETURN 'bad_key'; END IF;
  END LOOP;
  IF _o->>'op' = 'add' THEN
    IF _o ? 'id' OR _o ? 'is_done' THEN RETURN 'bad_key'; END IF;
    IF NULLIF(btrim(COALESCE(_o->>'title','')), '') IS NULL THEN RETURN 'title_required'; END IF;
  ELSE
    IF COALESCE(_o->>'id','') !~ '^[0-9a-f-]{36}$' THEN RETURN 'id_required'; END IF;
    IF NOT (_o ?| ARRAY['title','category','priority','due_date','notes','is_done']) THEN RETURN 'empty_update'; END IF;
    IF _o ? 'title' AND NULLIF(btrim(COALESCE(_o->>'title','')), '') IS NULL THEN RETURN 'title_required'; END IF;
    IF _o ? 'is_done' AND jsonb_typeof(_o->'is_done') <> 'boolean' THEN RETURN 'bad_is_done'; END IF;
  END IF;
  IF char_length(COALESCE(_o->>'title','')) > 200 OR char_length(COALESCE(_o->>'notes','')) > 2000 THEN RETURN 'too_long'; END IF;
  IF _o ? 'category' AND NOT (_o->>'category' = ANY(_cats)) THEN RETURN 'bad_category'; END IF;
  IF _o ? 'priority' AND NOT (_o->>'priority' IN ('high','normal','low')) THEN RETURN 'bad_priority'; END IF;
  IF _o ? 'due_date' AND jsonb_typeof(_o->'due_date') <> 'null' THEN
    IF (_o->>'due_date') !~ '^\d{4}-\d{2}-\d{2}$' THEN RETURN 'bad_date'; END IF;
    BEGIN PERFORM (_o->>'due_date')::date; EXCEPTION WHEN others THEN RETURN 'bad_date'; END;
  END IF;
  IF _o ? 'notes' AND jsonb_typeof(_o->'notes') NOT IN ('string','null') THEN RETURN 'bad_notes'; END IF;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.api_create_checklist_proposal(_hash text, _trip_id uuid, _ops jsonb, _note text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _r record; _t public.api_tokens%ROWTYPE; _o jsonb; _err text; _ids uuid[] := '{}'; _base jsonb;
  _found int; _pending int; _id uuid; _exp timestamptz;
BEGIN
  SELECT * INTO _r FROM public.api_resolve_token(_hash, _trip_id);
  IF _r.status IS DISTINCT FROM 'ok' THEN RETURN jsonb_build_object('status', COALESCE(_r.status, 'invalid')); END IF;
  SELECT * INTO _t FROM public.api_tokens t WHERE t.token_hash = _hash;
  IF _t.trip_id IS NULL OR NOT ('propose_checklist' = ANY(_t.scopes)) OR _t.trip_id <> _r.resolved_trip_id THEN
    RETURN jsonb_build_object('status', 'missing_scope');
  END IF;
  IF _ops IS NULL OR jsonb_typeof(_ops) <> 'array' OR jsonb_array_length(_ops) = 0 OR jsonb_array_length(_ops) > 50
     OR octet_length(_ops::text) > 65536 OR octet_length(COALESCE(_note,'')) > 2000 THEN
    RETURN jsonb_build_object('status', 'invalid_ops');
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
  INSERT INTO public.checklist_proposals(trip_id, token_id, created_by, note, ops, op_count, base)
  VALUES (_t.trip_id, _t.id, _t.user_id, NULLIF(btrim(_note), ''), _ops, jsonb_array_length(_ops), _base)
  RETURNING id, expires_at INTO _id, _exp;
  PERFORM set_config('app.in_checklist_proposal', '', true);
  RETURN jsonb_build_object('status', 'ok', 'id', _id, 'expires_at', _exp);
END $$;

-- Per-op analysis against current state (used by view and apply).
CREATE OR REPLACE FUNCTION public._checklist_analyze(_p public.checklist_proposals)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = public AS $$
  WITH ops AS (
    SELECT (o.ord - 1)::int AS idx, o.v AS op FROM jsonb_array_elements(_p.ops) WITH ORDINALITY o(v, ord)
  ), cur AS (
    SELECT c.* FROM public.checklist_items c WHERE c.trip_id = _p.trip_id
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'index', ops.idx, 'op', ops.op,
    'current', CASE WHEN ops.op->>'op' = 'update' THEN (
        SELECT jsonb_build_object('id', c.id, 'title', c.title, 'category', c.category, 'priority', c.priority,
          'due_date', c.due_date, 'notes', c.notes, 'is_done', c.is_done) FROM cur c WHERE c.id = (ops.op->>'id')::uuid) END,
    'conflict', ops.op->>'op' = 'update' AND NOT EXISTS (
        SELECT 1 FROM cur c WHERE c.id = (ops.op->>'id')::uuid AND public._checklist_sig(c) = _p.base->>(ops.op->>'id')),
    'duplicate', CASE WHEN ops.op->>'op' <> 'add' THEN NULL
      WHEN EXISTS (SELECT 1 FROM cur c WHERE public._checklist_norm(c.title) = public._checklist_norm(ops.op->>'title')) THEN 'existing'
      WHEN EXISTS (SELECT 1 FROM ops o2 WHERE o2.idx < ops.idx AND o2.op->>'op' = 'add'
        AND public._checklist_norm(o2.op->>'title') = public._checklist_norm(ops.op->>'title')) THEN 'in_proposal' END
  ) ORDER BY ops.idx), '[]'::jsonb) FROM ops
$$;

CREATE OR REPLACE FUNCTION public.get_checklist_proposal_view(_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _p public.checklist_proposals%ROWTYPE; _state text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _p FROM public.checklist_proposals p WHERE p.id = _id;
  IF NOT FOUND OR NOT public.can_access_trip(_p.trip_id) THEN RAISE EXCEPTION 'Proposal not found or not accessible'; END IF;
  _state := CASE WHEN _p.status <> 'pending' THEN _p.status
                 WHEN _p.expires_at <= now() THEN 'expired'
                 WHEN NOT public._checklist_token_ok(_p.token_id) THEN 'token_revoked'
                 ELSE 'pending' END;
  RETURN jsonb_build_object('id', _p.id, 'trip_id', _p.trip_id, 'state', _state, 'result', _p.result,
    'note', _p.note, 'op_count', _p.op_count, 'expires_at', _p.expires_at, 'created_at', _p.created_at,
    'seen_hash', md5(_p.ops::text || _p.base::text), 'ops', public._checklist_analyze(_p));
END $$;

CREATE OR REPLACE FUNCTION public.apply_checklist_proposal(_id uuid, _seen_hash text, _accept_duplicates int[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _p public.checklist_proposals%ROWTYPE; _a jsonb; _x jsonb; _o jsonb; _conf jsonb; _dups jsonb;
  _ord int; _added int := 0; _updated int := 0; _result jsonb; _ids uuid[];
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _p FROM public.checklist_proposals p WHERE p.id = _id FOR UPDATE;
  IF NOT FOUND OR NOT public.can_access_trip(_p.trip_id) THEN RAISE EXCEPTION 'Proposal not found or not accessible'; END IF;
  IF _p.status = 'applied' THEN RETURN COALESCE(_p.result, '{}'::jsonb) || jsonb_build_object('status', 'already_applied'); END IF;
  IF _p.status <> 'pending' THEN RETURN jsonb_build_object('status', _p.status); END IF;
  IF _p.expires_at <= now() THEN RETURN jsonb_build_object('status', 'expired'); END IF;
  IF NOT public._checklist_token_ok(_p.token_id) THEN RETURN jsonb_build_object('status', 'token_revoked'); END IF;
  IF _seen_hash IS DISTINCT FROM md5(_p.ops::text || _p.base::text) THEN RETURN jsonb_build_object('status', 'stale_view'); END IF;

  SELECT array_agg((o->>'id')::uuid) INTO _ids FROM jsonb_array_elements(_p.ops) o WHERE o->>'op' = 'update';
  PERFORM 1 FROM public.checklist_items c WHERE c.trip_id = _p.trip_id ORDER BY c.id FOR UPDATE;

  _a := public._checklist_analyze(_p);
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
    ELSE
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
    END IF;
  END LOOP;

  _result := jsonb_build_object('added', _added, 'updated', _updated);
  PERFORM set_config('app.in_checklist_proposal', 'on', true);
  UPDATE public.checklist_proposals SET status = 'applied', result = _result, decided_at = now() WHERE id = _p.id;
  PERFORM set_config('app.in_checklist_proposal', '', true);
  RETURN _result || jsonb_build_object('status', 'done');
END $$;

CREATE OR REPLACE FUNCTION public.reject_checklist_proposal(_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _p public.checklist_proposals%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _p FROM public.checklist_proposals p WHERE p.id = _id FOR UPDATE;
  IF NOT FOUND OR NOT public.can_access_trip(_p.trip_id) THEN RAISE EXCEPTION 'Proposal not found or not accessible'; END IF;
  IF _p.status = 'applied' THEN RETURN jsonb_build_object('status', 'already_applied'); END IF;
  IF _p.status <> 'pending' THEN RETURN jsonb_build_object('status', _p.status); END IF;
  PERFORM set_config('app.in_checklist_proposal', 'on', true);
  UPDATE public.checklist_proposals SET status = 'rejected', decided_at = now() WHERE id = _p.id;
  PERFORM set_config('app.in_checklist_proposal', '', true);
  RETURN jsonb_build_object('status', 'rejected');
END $$;

REVOKE ALL ON FUNCTION public.api_create_checklist_proposal(text, uuid, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_create_checklist_proposal(text, uuid, jsonb, text) TO service_role;
REVOKE ALL ON FUNCTION public.get_checklist_proposal_view(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.apply_checklist_proposal(uuid, text, int[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reject_checklist_proposal(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_checklist_proposal_view(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_checklist_proposal(uuid, text, int[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_checklist_proposal(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public._checklist_analyze(public.checklist_proposals) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._checklist_op_error(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._checklist_token_ok(uuid) FROM PUBLIC, anon, authenticated;