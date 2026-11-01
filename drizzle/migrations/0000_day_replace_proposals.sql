ALTER TABLE public.api_tokens ADD COLUMN IF NOT EXISTS scopes text[] NOT NULL DEFAULT '{read}';

CREATE TABLE public.day_replace_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  day_id uuid NOT NULL REFERENCES public.itinerary_days(id) ON DELETE CASCADE,
  token_id uuid REFERENCES public.api_tokens(id) ON DELETE SET NULL,
  created_by uuid NOT NULL,
  note text,
  entries jsonb NOT NULL,
  entry_count integer NOT NULL,
  fingerprint text NOT NULL,
  request_id uuid NOT NULL DEFAULT gen_random_uuid(),
  superseded_request_ids uuid[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','rejected')),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '72 hours'),
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX day_replace_proposals_trip_idx ON public.day_replace_proposals(trip_id, status, expires_at);

GRANT SELECT ON public.day_replace_proposals TO authenticated;
GRANT ALL ON public.day_replace_proposals TO service_role;
ALTER TABLE public.day_replace_proposals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "day_replace_proposals: select via trip" ON public.day_replace_proposals
  FOR SELECT TO authenticated USING (public.can_access_trip(trip_id));

-- Defense in depth only (clients have no write grants): writes only inside the proposal RPCs.
CREATE OR REPLACE FUNCTION public.day_replace_proposals_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
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
       OR NEW.note IS DISTINCT FROM OLD.note OR NEW.expires_at <> OLD.expires_at
       OR NEW.created_at <> OLD.created_at THEN
      RAISE EXCEPTION 'Proposal content is immutable';
    END IF;
    IF OLD.status <> 'pending' THEN RAISE EXCEPTION 'Proposal is final'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER day_replace_proposals_guard BEFORE INSERT OR UPDATE ON public.day_replace_proposals
  FOR EACH ROW EXECUTE FUNCTION public.day_replace_proposals_guard();

-- Single source for "applied": a done run on the current or any superseded request id.
CREATE OR REPLACE FUNCTION public._proposal_done(_day_id uuid, _request_id uuid, _superseded uuid[])
RETURNS jsonb LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT r.result FROM public.day_replace_runs r
  WHERE r.day_id = _day_id AND r.status = 'done'
    AND (r.request_id = _request_id OR r.request_id = ANY(_superseded))
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public._proposal_token_ok(_token_id uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.api_tokens t WHERE t.id = _token_id
    AND t.revoked_at IS NULL AND t.expires_at > now() AND 'propose_day' = ANY(t.scopes))
$$;

-- Created by the token-authenticated API (service_role only).
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

-- Read-only view for a signed-in trip member.
CREATE OR REPLACE FUNCTION public.get_day_proposal_view(_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
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
    'fingerprint', _p.fingerprint, 'expires_at', _p.expires_at, 'created_at', _p.created_at,
    'current', public.prepare_day_replace(_p.day_id),
    'current_rows', (SELECT COALESCE(jsonb_agg(jsonb_build_object('title', x.title, 'time_of_day', x.time_of_day,
        'is_protected', x.is_protected) ORDER BY x.display_order, x.created_at, x.id), '[]'::jsonb)
      FROM public._day_replace_rows(_p.day_id) x));
END $$;

-- Locks first, then re-checks everything on the locked row.
CREATE OR REPLACE FUNCTION public._proposal_claim(_id uuid, _seen_fingerprint text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _p public.day_replace_proposals%ROWTYPE; _done jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _p FROM public.day_replace_proposals p WHERE p.id = _id FOR UPDATE;
  IF NOT FOUND OR NOT public.can_access_trip(_p.trip_id)
     OR NOT EXISTS (SELECT 1 FROM public.itinerary_days d WHERE d.id = _p.day_id AND d.trip_id = _p.trip_id) THEN
    RAISE EXCEPTION 'Proposal not found or not accessible';
  END IF;
  _done := public._proposal_done(_p.day_id, _p.request_id, _p.superseded_request_ids);
  IF _done IS NOT NULL THEN RETURN _done || jsonb_build_object('status', 'already_applied'); END IF;
  IF _p.status <> 'pending' THEN RETURN jsonb_build_object('status', _p.status); END IF;
  IF _p.expires_at <= now() THEN RETURN jsonb_build_object('status', 'expired'); END IF;
  IF NOT public._proposal_token_ok(_p.token_id) THEN RETURN jsonb_build_object('status', 'token_revoked'); END IF;
  IF _seen_fingerprint IS DISTINCT FROM _p.fingerprint THEN RETURN jsonb_build_object('status', 'stale_view'); END IF;
  RETURN jsonb_build_object('status', 'ok', 'day_id', _p.day_id, 'fingerprint', _p.fingerprint,
    'request_id', _p.request_id, 'entries', _p.entries);
END $$;

-- Runs as the signed-in user; applies only the stored content through the existing replace RPC.
CREATE OR REPLACE FUNCTION public.apply_day_proposal(_id uuid, _seen_fingerprint text)
RETURNS jsonb LANGUAGE plpgsql SET search_path = public AS $$
DECLARE _c jsonb;
BEGIN
  _c := public._proposal_claim(_id, _seen_fingerprint);
  IF _c->>'status' <> 'ok' THEN RETURN _c; END IF;
  RETURN public.replace_day_entries((_c->>'day_id')::uuid, _c->>'fingerprint', (_c->>'request_id')::uuid,
    _c->'entries', 'לפני החלפה מהצ׳אט');
END $$;

CREATE OR REPLACE FUNCTION public.reject_day_proposal(_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _p public.day_replace_proposals%ROWTYPE; _done jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _p FROM public.day_replace_proposals p WHERE p.id = _id FOR UPDATE;
  IF NOT FOUND OR NOT public.can_access_trip(_p.trip_id)
     OR NOT EXISTS (SELECT 1 FROM public.itinerary_days d WHERE d.id = _p.day_id AND d.trip_id = _p.trip_id) THEN
    RAISE EXCEPTION 'Proposal not found or not accessible';
  END IF;
  _done := public._proposal_done(_p.day_id, _p.request_id, _p.superseded_request_ids);
  IF _done IS NOT NULL THEN RETURN jsonb_build_object('status', 'already_applied'); END IF;
  IF _p.status <> 'pending' THEN RETURN jsonb_build_object('status', _p.status); END IF;
  PERFORM set_config('app.in_day_proposal', 'on', true);
  UPDATE public.day_replace_proposals SET status = 'rejected', decided_at = now() WHERE id = _p.id;
  PERFORM set_config('app.in_day_proposal', '', true);
  RETURN jsonb_build_object('status', 'rejected');
END $$;

-- Explicit user re-approval after the day changed: binds to the fingerprint the user saw, rotates request_id.
CREATE OR REPLACE FUNCTION public.reconfirm_day_proposal(_id uuid, _seen_fingerprint text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _p public.day_replace_proposals%ROWTYPE; _done jsonb; _cur text; _new uuid := gen_random_uuid();
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _p FROM public.day_replace_proposals p WHERE p.id = _id FOR UPDATE;
  IF NOT FOUND OR NOT public.can_access_trip(_p.trip_id)
     OR NOT EXISTS (SELECT 1 FROM public.itinerary_days d WHERE d.id = _p.day_id AND d.trip_id = _p.trip_id) THEN
    RAISE EXCEPTION 'Proposal not found or not accessible';
  END IF;
  _done := public._proposal_done(_p.day_id, _p.request_id, _p.superseded_request_ids);
  IF _done IS NOT NULL THEN RETURN _done || jsonb_build_object('status', 'already_applied'); END IF;
  IF _p.status <> 'pending' THEN RETURN jsonb_build_object('status', _p.status); END IF;
  IF _p.expires_at <= now() THEN RETURN jsonb_build_object('status', 'expired'); END IF;
  IF NOT public._proposal_token_ok(_p.token_id) THEN RETURN jsonb_build_object('status', 'token_revoked'); END IF;
  _cur := public._day_replace_fingerprint(_p.day_id);
  IF _seen_fingerprint IS DISTINCT FROM _cur THEN
    RETURN jsonb_build_object('status', 'day_changed', 'current_fingerprint', _cur);
  END IF;
  PERFORM set_config('app.in_day_proposal', 'on', true);
  UPDATE public.day_replace_proposals
    SET fingerprint = _cur, superseded_request_ids = superseded_request_ids || request_id, request_id = _new
    WHERE id = _p.id;
  PERFORM set_config('app.in_day_proposal', '', true);
  RETURN jsonb_build_object('status', 'ok', 'fingerprint', _cur);
END $$;

REVOKE ALL ON FUNCTION public.day_replace_proposals_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._proposal_done(uuid, uuid, uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._proposal_token_ok(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.api_create_day_proposal(text, uuid, date, jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_day_proposal_view(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public._proposal_claim(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.apply_day_proposal(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reject_day_proposal(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reconfirm_day_proposal(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.api_create_day_proposal(text, uuid, date, jsonb, text) TO service_role;
GRANT EXECUTE ON FUNCTION public._proposal_done(uuid, uuid, uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_day_proposal_view(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public._proposal_claim(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_day_proposal(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_day_proposal(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reconfirm_day_proposal(uuid, text) TO authenticated;