CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

ALTER TABLE public.documents ADD COLUMN file_path text, ADD COLUMN file_mime text, ADD COLUMN file_size integer;

CREATE OR REPLACE FUNCTION public.documents_file_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_setting('app.in_document_finalize', true) = 'on' THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.file_path IS NOT NULL OR NEW.file_mime IS NOT NULL OR NEW.file_size IS NOT NULL THEN
      RAISE EXCEPTION 'file_path is managed by document approval';
    END IF;
  ELSIF NEW.file_path IS DISTINCT FROM OLD.file_path OR NEW.file_mime IS DISTINCT FROM OLD.file_mime
        OR NEW.file_size IS DISTINCT FROM OLD.file_size OR (NEW.trip_id <> OLD.trip_id AND OLD.file_path IS NOT NULL) THEN
    RAISE EXCEPTION 'file_path is managed by document approval';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER documents_file_guard BEFORE INSERT OR UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.documents_file_guard();

CREATE TABLE public.document_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  token_id uuid REFERENCES public.api_tokens(id) ON DELETE SET NULL,
  created_by uuid NOT NULL,
  request_id uuid NOT NULL,
  payload_hash text NOT NULL,
  target_document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  fields jsonb NOT NULL,
  wants_file boolean NOT NULL DEFAULT false,
  base text,
  upload_id uuid,
  note text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','applied','rejected')),
  result jsonb,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '72 hours',
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX document_proposals_token_request_uq ON public.document_proposals(token_id, request_id);
CREATE INDEX document_proposals_trip_idx ON public.document_proposals(trip_id, status);
GRANT SELECT ON public.document_proposals TO authenticated;
GRANT ALL ON public.document_proposals TO service_role;
ALTER TABLE public.document_proposals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trip members read document proposals" ON public.document_proposals
  FOR SELECT TO authenticated USING (public.can_access_trip(trip_id));

CREATE TABLE public.document_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  proposal_id uuid NOT NULL REFERENCES public.document_proposals(id) ON DELETE CASCADE,
  uploaded_by uuid NOT NULL,
  staged_path text NOT NULL UNIQUE,
  final_path text UNIQUE,
  declared_size integer NOT NULL CHECK (declared_size BETWEEN 1 AND 10485760),
  declared_mime text NOT NULL,
  size integer, mime text, sha256 text, file_name text,
  status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved','staged','copying','copied','consumed','superseded','failed')),
  cleaned_at timestamptz,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX document_uploads_trip_idx ON public.document_uploads(trip_id, status);
CREATE INDEX document_uploads_cleanup_idx ON public.document_uploads(expires_at) WHERE cleaned_at IS NULL;
GRANT ALL ON public.document_uploads TO service_role;
ALTER TABLE public.document_uploads ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.document_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  proposal_id uuid REFERENCES public.document_proposals(id) ON DELETE SET NULL,
  path text NOT NULL UNIQUE,
  mime text NOT NULL, size integer NOT NULL,
  status text NOT NULL CHECK (status IN ('current','superseded')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX document_files_doc_idx ON public.document_files(document_id);
GRANT SELECT ON public.document_files TO authenticated;
GRANT ALL ON public.document_files TO service_role;
ALTER TABLE public.document_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trip members read document files" ON public.document_files
  FOR SELECT TO authenticated USING (public.can_access_trip(trip_id));

CREATE OR REPLACE FUNCTION public._doc_token_live(_token_id uuid, _trip_id uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.api_tokens t JOIN public.trips tr ON tr.id = t.trip_id
    WHERE t.id = _token_id AND t.trip_id = _trip_id
      AND t.revoked_at IS NULL AND t.expires_at > now() AND 'upload_documents' = ANY(t.scopes)
      AND (tr.owner_id = t.user_id OR t.user_id = ANY(tr.shared_user_ids)))
$$;

CREATE OR REPLACE FUNCTION public._doc_fp(_doc_id uuid)
RETURNS text LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT md5(jsonb_build_array(d.id, d.trip_id, d.title, d.type, d.file_url, d.file_path, d.file_mime, d.file_size,
    d.external_url, d.notes, d.valid_date, d.linked_recommendation_id, d.barcode_value, d.barcode_type, d.amount_ils, d.is_paid)::text)
  FROM public.documents d WHERE d.id = _doc_id
$$;

CREATE OR REPLACE FUNCTION public._doc_fields_error(_f jsonb, _is_add boolean)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE _k text;
BEGIN
  IF _f IS NULL OR jsonb_typeof(_f) IS DISTINCT FROM 'object' THEN RETURN 'not_object'; END IF;
  FOR _k IN SELECT jsonb_object_keys(_f) LOOP
    IF _k NOT IN ('title','type','valid_date','notes','external_url','linked_recommendation_id') THEN RETURN 'bad_key'; END IF;
  END LOOP;
  IF _f ? 'title' AND (jsonb_typeof(_f->'title') IS DISTINCT FROM 'string' OR NULLIF(btrim(_f->>'title'),'') IS NULL OR char_length(_f->>'title') > 200) THEN RETURN 'bad_title'; END IF;
  IF _is_add AND NOT (_f ? 'title') THEN RETURN 'title_required'; END IF;
  IF _f ? 'type' AND (jsonb_typeof(_f->'type') IS DISTINCT FROM 'string'
     OR NOT COALESCE(_f->>'type' IN ('flight','hotel','attraction','insurance','visa','transport','other'), false)) THEN RETURN 'bad_type'; END IF;
  IF _f ? 'notes' AND (jsonb_typeof(_f->'notes') NOT IN ('string','null') OR char_length(COALESCE(_f->>'notes','')) > 2000) THEN RETURN 'bad_notes'; END IF;
  IF _f ? 'valid_date' AND jsonb_typeof(_f->'valid_date') IS DISTINCT FROM 'null' THEN
    IF jsonb_typeof(_f->'valid_date') IS DISTINCT FROM 'string' OR (_f->>'valid_date') !~ '^\d{4}-\d{2}-\d{2}$' THEN RETURN 'bad_date'; END IF;
    BEGIN PERFORM (_f->>'valid_date')::date; EXCEPTION WHEN others THEN RETURN 'bad_date'; END;
  END IF;
  IF _f ? 'external_url' AND jsonb_typeof(_f->'external_url') IS DISTINCT FROM 'null' THEN
    IF jsonb_typeof(_f->'external_url') IS DISTINCT FROM 'string' OR char_length(_f->>'external_url') > 2000
       OR (_f->>'external_url') !~* '^https?://[^\s/?#]+[^\s]*$' THEN RETURN 'bad_url'; END IF;
  END IF;
  IF _f ? 'linked_recommendation_id' AND jsonb_typeof(_f->'linked_recommendation_id') IS DISTINCT FROM 'null' THEN
    IF jsonb_typeof(_f->'linked_recommendation_id') IS DISTINCT FROM 'string'
       OR (_f->>'linked_recommendation_id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RETURN 'bad_recommendation'; END IF;
  END IF;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.api_create_document_proposal(_hash text, _trip_id uuid, _request_id uuid,
  _target uuid, _fields jsonb, _wants_file boolean, _note text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _r record; _t public.api_tokens%ROWTYPE; _err text; _ph text; _ex public.document_proposals%ROWTYPE;
  _pending int; _id uuid; _exp timestamptz;
BEGIN
  IF _request_id IS NULL THEN RETURN jsonb_build_object('status', 'invalid', 'reason', 'request_id_required'); END IF;
  SELECT * INTO _r FROM public.api_resolve_token(_hash, _trip_id);
  IF _r.status IS DISTINCT FROM 'ok' THEN RETURN jsonb_build_object('status', COALESCE(_r.status, 'invalid_token')); END IF;
  SELECT * INTO _t FROM public.api_tokens t WHERE t.token_hash = _hash;
  IF _t.trip_id IS NULL OR NOT ('upload_documents' = ANY(_t.scopes)) OR _t.trip_id <> _r.resolved_trip_id THEN
    RETURN jsonb_build_object('status', 'missing_scope');
  END IF;
  IF _wants_file IS NULL OR octet_length(COALESCE(_note,'')) > 2000 OR octet_length(COALESCE(_fields::text,'')) > 8192 THEN
    RETURN jsonb_build_object('status', 'invalid', 'reason', 'bad_input');
  END IF;
  _err := public._doc_fields_error(_fields, _target IS NULL);
  IF _err IS NOT NULL THEN RETURN jsonb_build_object('status', 'invalid', 'reason', _err); END IF;
  IF _target IS NOT NULL AND _fields = '{}'::jsonb AND NOT _wants_file THEN RETURN jsonb_build_object('status', 'invalid', 'reason', 'empty_update'); END IF;
  _ph := md5(jsonb_build_array(_target, _fields, _wants_file, NULLIF(btrim(_note), ''))::text);

  PERFORM pg_advisory_xact_lock(hashtextextended(_t.id::text || _request_id::text, 1));
  SELECT * INTO _ex FROM public.document_proposals p WHERE p.token_id = _t.id AND p.request_id = _request_id;
  IF FOUND THEN
    IF _ex.payload_hash = _ph THEN RETURN jsonb_build_object('status', 'ok', 'id', _ex.id, 'expires_at', _ex.expires_at, 'replayed', true); END IF;
    RETURN jsonb_build_object('status', 'idempotency_conflict');
  END IF;

  IF _target IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.documents d WHERE d.id = _target AND d.trip_id = _t.trip_id) THEN
    RETURN jsonb_build_object('status', 'document_not_found');
  END IF;
  IF jsonb_typeof(_fields->'linked_recommendation_id') = 'string' AND NOT EXISTS (SELECT 1 FROM public.recommendations r
       WHERE r.id = (_fields->>'linked_recommendation_id')::uuid AND r.trip_id = _t.trip_id) THEN
    RETURN jsonb_build_object('status', 'recommendation_not_found');
  END IF;

  PERFORM 1 FROM public.trips tr WHERE tr.id = _t.trip_id FOR UPDATE;
  SELECT count(*) INTO _pending FROM public.document_proposals p
    WHERE p.trip_id = _t.trip_id AND p.status = 'pending' AND p.expires_at > now();
  IF _pending >= 20 THEN RETURN jsonb_build_object('status', 'quota_exceeded'); END IF;

  INSERT INTO public.document_proposals(trip_id, token_id, created_by, request_id, payload_hash, target_document_id, fields, wants_file, base, note)
  VALUES (_t.trip_id, _t.id, _t.user_id, _request_id, _ph, _target, _fields, _wants_file,
          CASE WHEN _target IS NOT NULL THEN public._doc_fp(_target) END, NULLIF(btrim(_note), ''))
  RETURNING id, expires_at INTO _id, _exp;
  RETURN jsonb_build_object('status', 'ok', 'id', _id, 'expires_at', _exp);
END $$;

CREATE OR REPLACE FUNCTION public._doc_view_hash(_p public.document_proposals)
RETURNS text LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT md5(jsonb_build_array(_p.id, _p.fields, _p.base, _p.target_document_id,
    CASE WHEN _p.target_document_id IS NOT NULL THEN public._doc_fp(_p.target_document_id) END,
    _p.upload_id, (SELECT u.sha256 FROM public.document_uploads u WHERE u.id = _p.upload_id))::text)
$$;

CREATE OR REPLACE FUNCTION public.get_document_proposal_view(_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _p public.document_proposals%ROWTYPE; _state text; _cur jsonb; _u public.document_uploads%ROWTYPE; _rec jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _p FROM public.document_proposals p WHERE p.id = _id;
  IF NOT FOUND OR NOT public.can_access_trip(_p.trip_id) THEN RAISE EXCEPTION 'Proposal not found or not accessible'; END IF;
  _state := CASE WHEN _p.status <> 'pending' THEN _p.status
                 WHEN _p.expires_at <= now() THEN 'expired'
                 WHEN NOT public._doc_token_live(_p.token_id, _p.trip_id) THEN 'token_revoked'
                 ELSE 'pending' END;
  IF _p.target_document_id IS NOT NULL THEN
    SELECT jsonb_build_object('id', d.id, 'title', d.title, 'type', d.type, 'valid_date', d.valid_date, 'notes', d.notes,
      'external_url', d.external_url, 'linked_recommendation_id', d.linked_recommendation_id,
      'has_file', d.file_path IS NOT NULL OR d.file_url IS NOT NULL, 'file_mime', d.file_mime) INTO _cur
    FROM public.documents d WHERE d.id = _p.target_document_id;
  END IF;
  SELECT * INTO _u FROM public.document_uploads u WHERE u.id = _p.upload_id;
  IF jsonb_typeof(_p.fields->'linked_recommendation_id') = 'string' THEN
    SELECT jsonb_build_object('id', r.id, 'name', r.name) INTO _rec FROM public.recommendations r
      WHERE r.id = (_p.fields->>'linked_recommendation_id')::uuid AND r.trip_id = _p.trip_id;
  END IF;
  RETURN jsonb_build_object('id', _p.id, 'trip_id', _p.trip_id, 'state', _state, 'result', _p.result, 'note', _p.note,
    'fields', _p.fields, 'wants_file', _p.wants_file, 'target_document_id', _p.target_document_id,
    'target_missing', _p.target_document_id IS NULL AND _p.base IS NOT NULL,
    'current', _cur, 'conflict', _p.base IS NOT NULL AND (_p.target_document_id IS NULL OR public._doc_fp(_p.target_document_id) IS DISTINCT FROM _p.base),
    'recommendation', _rec, 'recommendation_missing', jsonb_typeof(_p.fields->'linked_recommendation_id') = 'string' AND _rec IS NULL,
    'upload', CASE WHEN _u.id IS NOT NULL THEN jsonb_build_object('id', _u.id, 'status', _u.status, 'mime', _u.mime, 'size', _u.size, 'file_name', _u.file_name) END,
    'expires_at', _p.expires_at, 'created_at', _p.created_at, 'seen_hash', public._doc_view_hash(_p));
END $$;

CREATE OR REPLACE FUNCTION public.reserve_document_upload(_proposal_id uuid, _size integer, _mime text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _p public.document_proposals%ROWTYPE; _active int; _bytes bigint; _id uuid := gen_random_uuid(); _path text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _p FROM public.document_proposals p WHERE p.id = _proposal_id FOR UPDATE;
  IF NOT FOUND OR NOT public.can_access_trip(_p.trip_id) THEN RAISE EXCEPTION 'Proposal not found or not accessible'; END IF;
  IF _p.status <> 'pending' THEN RETURN jsonb_build_object('status', _p.status); END IF;
  IF _p.expires_at <= now() + interval '15 minutes' THEN RETURN jsonb_build_object('status', 'expired'); END IF;
  IF NOT public._doc_token_live(_p.token_id, _p.trip_id) THEN RETURN jsonb_build_object('status', 'token_revoked'); END IF;
  IF _size IS NULL OR _size < 1 OR _size > 10485760 THEN RETURN jsonb_build_object('status', 'too_large'); END IF;
  IF NOT COALESCE(_mime IN ('application/pdf','image/jpeg','image/png','image/webp'), false) THEN RETURN jsonb_build_object('status', 'bad_type'); END IF;
  PERFORM 1 FROM public.trips tr WHERE tr.id = _p.trip_id FOR UPDATE;
  SELECT count(*), COALESCE(sum(declared_size), 0) INTO _active, _bytes FROM public.document_uploads u
    WHERE u.trip_id = _p.trip_id AND u.status IN ('reserved','staged','copying','copied') AND u.expires_at > now();
  IF _active >= 10 OR _bytes + _size > 52428800 THEN RETURN jsonb_build_object('status', 'quota_exceeded'); END IF;
  _path := 'staging/' || _p.trip_id || '/' || _p.id || '/' || _id;
  INSERT INTO public.document_uploads(id, trip_id, proposal_id, uploaded_by, staged_path, declared_size, declared_mime, expires_at)
  VALUES (_id, _p.trip_id, _p.id, auth.uid(), _path, _size, _mime, LEAST(now() + interval '24 hours', _p.expires_at));
  RETURN jsonb_build_object('status', 'ok', 'upload_id', _id);
END $$;

CREATE OR REPLACE FUNCTION public.server_mark_upload_staged(_upload_id uuid, _user uuid, _size integer, _mime text, _sha text, _name text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _u public.document_uploads%ROWTYPE; _p public.document_proposals%ROWTYPE;
BEGIN
  SELECT * INTO _u FROM public.document_uploads u WHERE u.id = _upload_id FOR UPDATE;
  IF NOT FOUND OR _u.uploaded_by <> _user OR _u.status <> 'reserved' OR _u.expires_at <= now() THEN RETURN jsonb_build_object('status', 'invalid_upload'); END IF;
  IF _size IS NULL OR _size > _u.declared_size OR _mime IS DISTINCT FROM _u.declared_mime OR _sha !~ '^[0-9a-f]{64}$' THEN
    UPDATE public.document_uploads SET status = 'failed' WHERE id = _u.id;
    RETURN jsonb_build_object('status', 'mismatch');
  END IF;
  SELECT * INTO _p FROM public.document_proposals p WHERE p.id = _u.proposal_id FOR UPDATE;
  IF _p.status <> 'pending' THEN UPDATE public.document_uploads SET status = 'failed' WHERE id = _u.id; RETURN jsonb_build_object('status', _p.status); END IF;
  UPDATE public.document_uploads SET status = 'superseded' WHERE id = _p.upload_id AND status = 'staged';
  UPDATE public.document_uploads SET status = 'staged', size = _size, mime = _mime, sha256 = _sha, file_name = left(_name, 120) WHERE id = _u.id;
  UPDATE public.document_proposals SET upload_id = _u.id WHERE id = _p.id;
  RETURN jsonb_build_object('status', 'ok');
END $$;

CREATE OR REPLACE FUNCTION public.server_upload_for_user(_upload_id uuid, _user uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('staged_path', u.staged_path, 'declared_size', u.declared_size, 'declared_mime', u.declared_mime)
  FROM public.document_uploads u WHERE u.id = _upload_id AND u.uploaded_by = _user AND u.status = 'reserved' AND u.expires_at > now()
$$;

CREATE OR REPLACE FUNCTION public.document_proposal_staged_path(_proposal_id uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _p public.document_proposals%ROWTYPE; _path text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _p FROM public.document_proposals p WHERE p.id = _proposal_id;
  IF NOT FOUND OR NOT public.can_access_trip(_p.trip_id) THEN RAISE EXCEPTION 'Proposal not found or not accessible'; END IF;
  SELECT u.staged_path INTO _path FROM public.document_uploads u
    WHERE u.id = _p.upload_id AND u.status IN ('staged','copying','copied') AND u.cleaned_at IS NULL;
  RETURN _path;
END $$;

CREATE OR REPLACE FUNCTION public._doc_apply_check(_p public.document_proposals, _seen_hash text)
RETURNS text LANGUAGE plpgsql STABLE SET search_path = public AS $$
BEGIN
  IF _p.status <> 'pending' THEN RETURN _p.status; END IF;
  IF _p.expires_at <= now() THEN RETURN 'expired'; END IF;
  IF NOT public._doc_token_live(_p.token_id, _p.trip_id) THEN RETURN 'token_revoked'; END IF;
  IF _seen_hash IS DISTINCT FROM public._doc_view_hash(_p) THEN RETURN 'stale_view'; END IF;
  IF _p.base IS NOT NULL AND (_p.target_document_id IS NULL OR public._doc_fp(_p.target_document_id) IS DISTINCT FROM _p.base) THEN RETURN 'conflict'; END IF;
  IF jsonb_typeof(_p.fields->'linked_recommendation_id') = 'string' AND NOT EXISTS (SELECT 1 FROM public.recommendations r
       WHERE r.id = (_p.fields->>'linked_recommendation_id')::uuid AND r.trip_id = _p.trip_id) THEN RETURN 'recommendation_not_found'; END IF;
  IF _p.wants_file AND _p.upload_id IS NULL THEN RETURN 'file_required'; END IF;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.claim_document_apply(_id uuid, _seen_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _p public.document_proposals%ROWTYPE; _u public.document_uploads%ROWTYPE; _err text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _p FROM public.document_proposals p WHERE p.id = _id FOR UPDATE;
  IF NOT FOUND OR NOT public.can_access_trip(_p.trip_id) THEN RAISE EXCEPTION 'Proposal not found or not accessible'; END IF;
  IF _p.status = 'applied' THEN RETURN COALESCE(_p.result, '{}'::jsonb) || jsonb_build_object('status', 'already_applied'); END IF;
  _err := public._doc_apply_check(_p, _seen_hash);
  IF _err IS NOT NULL THEN RETURN jsonb_build_object('status', _err); END IF;
  IF _p.upload_id IS NULL THEN RETURN jsonb_build_object('status', 'ok', 'has_file', false); END IF;
  SELECT * INTO _u FROM public.document_uploads u WHERE u.id = _p.upload_id FOR UPDATE;
  IF _u.status NOT IN ('staged','copying','copied') OR _u.cleaned_at IS NOT NULL OR _u.expires_at <= now() + interval '5 minutes' THEN
    RETURN jsonb_build_object('status', 'file_expired');
  END IF;
  IF _u.status = 'staged' THEN
    UPDATE public.document_uploads SET status = 'copying', final_path = 'docs/' || _u.trip_id || '/' || _u.id WHERE id = _u.id
      RETURNING * INTO _u;
  END IF;
  RETURN jsonb_build_object('status', 'ok', 'has_file', true, 'upload_id', _u.id, 'copied', _u.status = 'copied');
END $$;

CREATE OR REPLACE FUNCTION public.server_upload_paths(_upload_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('staged_path', u.staged_path, 'final_path', u.final_path, 'mime', u.mime, 'status', u.status)
  FROM public.document_uploads u WHERE u.id = _upload_id
$$;

CREATE OR REPLACE FUNCTION public.server_mark_upload_copied(_upload_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.document_uploads SET status = 'copied' WHERE id = _upload_id AND status IN ('copying','copied');
  RETURN jsonb_build_object('status', CASE WHEN FOUND THEN 'ok' ELSE 'invalid_upload' END);
END $$;

CREATE OR REPLACE FUNCTION public.finalize_document_proposal(_id uuid, _seen_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _p public.document_proposals%ROWTYPE; _u public.document_uploads%ROWTYPE; _err text; _f jsonb;
  _doc public.documents%ROWTYPE; _prev jsonb; _doc_id uuid; _ord int; _result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _p FROM public.document_proposals p WHERE p.id = _id FOR UPDATE;
  IF NOT FOUND OR NOT public.can_access_trip(_p.trip_id) THEN RAISE EXCEPTION 'Proposal not found or not accessible'; END IF;
  IF _p.status = 'applied' THEN RETURN COALESCE(_p.result, '{}'::jsonb) || jsonb_build_object('status', 'already_applied'); END IF;
  IF _p.target_document_id IS NOT NULL THEN
    SELECT * INTO _doc FROM public.documents d WHERE d.id = _p.target_document_id FOR UPDATE;
  END IF;
  _err := public._doc_apply_check(_p, _seen_hash);
  IF _err IS NOT NULL THEN RETURN jsonb_build_object('status', _err); END IF;
  IF _p.upload_id IS NOT NULL THEN
    SELECT * INTO _u FROM public.document_uploads u WHERE u.id = _p.upload_id FOR UPDATE;
    IF _u.status <> 'copied' OR _u.final_path IS NULL THEN RETURN jsonb_build_object('status', 'file_not_ready'); END IF;
  END IF;
  _f := _p.fields;

  PERFORM set_config('app.in_document_finalize', 'on', true);
  IF _p.target_document_id IS NULL THEN
    SELECT COALESCE(max(display_order), -1) + 1 INTO _ord FROM public.documents WHERE trip_id = _p.trip_id;
    INSERT INTO public.documents(trip_id, title, type, valid_date, notes, external_url, linked_recommendation_id, display_order,
      file_path, file_mime, file_size)
    VALUES (_p.trip_id, btrim(_f->>'title'), COALESCE(_f->>'type', 'other'), NULLIF(_f->>'valid_date','')::date,
      NULLIF(btrim(COALESCE(_f->>'notes','')), ''), NULLIF(btrim(COALESCE(_f->>'external_url','')), ''),
      NULLIF(_f->>'linked_recommendation_id','')::uuid, _ord, _u.final_path, _u.mime, _u.size)
    RETURNING id INTO _doc_id;
  ELSE
    _doc_id := _doc.id;
    _prev := jsonb_build_object('title', _doc.title, 'type', _doc.type, 'valid_date', _doc.valid_date, 'notes', _doc.notes,
      'external_url', _doc.external_url, 'linked_recommendation_id', _doc.linked_recommendation_id,
      'file_path', _doc.file_path, 'file_url_present', _doc.file_url IS NOT NULL, 'fingerprint', _p.base);
    UPDATE public.documents d SET
      title = CASE WHEN _f ? 'title' THEN btrim(_f->>'title') ELSE d.title END,
      type = CASE WHEN _f ? 'type' THEN _f->>'type' ELSE d.type END,
      valid_date = CASE WHEN _f ? 'valid_date' THEN NULLIF(_f->>'valid_date','')::date ELSE d.valid_date END,
      notes = CASE WHEN _f ? 'notes' THEN NULLIF(btrim(COALESCE(_f->>'notes','')), '') ELSE d.notes END,
      external_url = CASE WHEN _f ? 'external_url' THEN NULLIF(btrim(COALESCE(_f->>'external_url','')), '') ELSE d.external_url END,
      linked_recommendation_id = CASE WHEN _f ? 'linked_recommendation_id' THEN NULLIF(_f->>'linked_recommendation_id','')::uuid ELSE d.linked_recommendation_id END,
      file_path = CASE WHEN _u.id IS NOT NULL THEN _u.final_path ELSE d.file_path END,
      file_mime = CASE WHEN _u.id IS NOT NULL THEN _u.mime ELSE d.file_mime END,
      file_size = CASE WHEN _u.id IS NOT NULL THEN _u.size ELSE d.file_size END
    WHERE d.id = _doc.id;
  END IF;
  PERFORM set_config('app.in_document_finalize', '', true);

  IF _u.id IS NOT NULL THEN
    UPDATE public.document_files SET status = 'superseded' WHERE document_id = _doc_id AND status = 'current';
    INSERT INTO public.document_files(trip_id, document_id, proposal_id, path, mime, size, status)
    VALUES (_p.trip_id, _doc_id, _p.id, _u.final_path, _u.mime, _u.size, 'current');
    UPDATE public.document_uploads SET status = 'consumed' WHERE id = _u.id;
  END IF;

  _result := jsonb_build_object('document_id', _doc_id, 'mode', CASE WHEN _p.target_document_id IS NULL THEN 'added' ELSE 'replaced' END,
    'file_attached', _u.id IS NOT NULL, 'previous', _prev);
  UPDATE public.document_proposals SET status = 'applied', result = _result, decided_at = now() WHERE id = _p.id;
  RETURN _result || jsonb_build_object('status', 'done');
END $$;

CREATE OR REPLACE FUNCTION public.reject_document_proposal(_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _p public.document_proposals%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _p FROM public.document_proposals p WHERE p.id = _id FOR UPDATE;
  IF NOT FOUND OR NOT public.can_access_trip(_p.trip_id) THEN RAISE EXCEPTION 'Proposal not found or not accessible'; END IF;
  IF _p.status = 'applied' THEN RETURN jsonb_build_object('status', 'already_applied'); END IF;
  IF _p.status <> 'pending' THEN RETURN jsonb_build_object('status', _p.status); END IF;
  UPDATE public.document_proposals SET status = 'rejected', decided_at = now() WHERE id = _p.id;
  RETURN jsonb_build_object('status', 'rejected');
END $$;

CREATE OR REPLACE FUNCTION public.server_document_cleanup_candidates(_limit integer)
RETURNS TABLE(upload_id uuid, paths text[]) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT u.id, array_remove(ARRAY[
      u.staged_path,
      CASE WHEN u.final_path IS NOT NULL AND u.status <> 'consumed'
        AND NOT EXISTS (SELECT 1 FROM public.document_files f WHERE f.path = u.final_path)
        AND NOT EXISTS (SELECT 1 FROM public.documents d WHERE d.file_path = u.final_path) THEN u.final_path END], NULL)
  FROM public.document_uploads u
  JOIN public.document_proposals p ON p.id = u.proposal_id
  WHERE u.cleaned_at IS NULL
    AND (u.status IN ('consumed','superseded','failed')
         OR u.expires_at <= now()
         OR (p.status <> 'pending' AND u.status IN ('reserved','staged')))
    AND NOT EXISTS (SELECT 1 FROM public.document_files f WHERE f.path = u.staged_path)
    AND NOT EXISTS (SELECT 1 FROM public.documents d WHERE d.file_path = u.staged_path)
  ORDER BY u.created_at
  LIMIT LEAST(GREATEST(COALESCE(_limit, 50), 1), 200)
$$;

CREATE OR REPLACE FUNCTION public.server_document_cleanup_done(_ids uuid[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _n int;
BEGIN
  UPDATE public.document_uploads SET cleaned_at = now(),
    status = CASE WHEN status IN ('reserved','staged','copying','copied') THEN 'failed' ELSE status END
  WHERE id = ANY(_ids) AND cleaned_at IS NULL;
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END $$;

DO $g$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public._doc_token_live(uuid, uuid)', 'public._doc_fp(uuid)', 'public._doc_fields_error(jsonb, boolean)',
    'public._doc_view_hash(public.document_proposals)', 'public._doc_apply_check(public.document_proposals, text)',
    'public.api_create_document_proposal(text, uuid, uuid, uuid, jsonb, boolean, text)',
    'public.server_mark_upload_staged(uuid, uuid, integer, text, text, text)', 'public.server_upload_paths(uuid)',
    'public.server_upload_for_user(uuid, uuid)',
    'public.server_mark_upload_copied(uuid)', 'public.server_document_cleanup_candidates(integer)',
    'public.server_document_cleanup_done(uuid[])'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
  END LOOP;
  FOREACH f IN ARRAY ARRAY[
    'public.api_create_document_proposal(text, uuid, uuid, uuid, jsonb, boolean, text)',
    'public.server_mark_upload_staged(uuid, uuid, integer, text, text, text)', 'public.server_upload_paths(uuid)',
    'public.server_upload_for_user(uuid, uuid)',
    'public.server_mark_upload_copied(uuid)', 'public.server_document_cleanup_candidates(integer)',
    'public.server_document_cleanup_done(uuid[])'] LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;
  FOREACH f IN ARRAY ARRAY[
    'public.get_document_proposal_view(uuid)', 'public.reserve_document_upload(uuid, integer, text)',
    'public.document_proposal_staged_path(uuid)', 'public.claim_document_apply(uuid, text)',
    'public.finalize_document_proposal(uuid, text)', 'public.reject_document_proposal(uuid)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
END $g$;