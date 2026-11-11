-- Expense proposals: fall back to the live market rate when there is no manual rate.
--
-- What changes: ONLY public.api_create_expense_proposal. It gains one optional parameter,
-- _live_fx jsonb DEFAULT NULL, and one extra branch after the manual-rate branch.
-- Priority stays: same currency (1) -> manual rate (trip target currency only) -> live rate -> no_valid_rate.
--
-- Trust boundary: _live_fx is never taken from the API caller. The request body is validated with a
-- strict schema and the keys of each operation are whitelisted below (bad_key), so a caller cannot send
-- a rate. Only the server code (src/lib/fx.server.ts) fetches the table from exchangerate-api.com and
-- passes it here. EXECUTE stays granted to service_role only.
--
-- Unchanged on purpose: payload hash (_ops + note only, so a retry with the same request_id replays the
-- stored proposal even if the market moved), base->'money' (still exactly _item_money_ctx, so the
-- review/apply conflict check is not triggered by live rates), apply_item_proposal (it inserts the stored
-- amount_ils / amount_foreign / foreign_currency without converting again). No table changes.
--
-- Signature: the old 5-argument function is dropped in the same transaction, so exactly one
-- api_create_expense_proposal exists afterwards (no overload ambiguity). The 6th parameter has a
-- default, so existing callers that pass 5 named arguments keep working.
-- Safe to run more than once. Rollback: drizzle/pending/0015_expense_proposal_live_rate.rollback.sql

BEGIN;

DROP FUNCTION IF EXISTS public.api_create_expense_proposal(text, uuid, uuid, jsonb, text);

CREATE OR REPLACE FUNCTION public.api_create_expense_proposal(_hash text, _trip_id uuid, _request_id uuid, _ops jsonb, _note text,
  _live_fx jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _r record; _t public.api_tokens%ROWTYPE; _ex public.item_proposals%ROWTYPE; _ph text; _o jsonb; _k text;
  _ctx jsonb; _cur public.expenses%ROWTYPE; _set jsonb; _money jsonb; _amt numeric; _cc text; _out jsonb := '[]';
  _items jsonb := '{}'; _ids uuid[] := '{}'; _pending int; _id uuid; _exp timestamptz; _any_money boolean := false;
  -- Live market rate (supplied only by the server, see header comment).
  _fx_ok boolean; _fx_base text; _fx_rates jsonb; _fx_date text; _fx_provider text; _fx_stale boolean;
  _bv numeric; _tv numeric; _lr numeric;
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
  -- Validate the optional live-rate table once. Anything malformed is ignored, which ends in no_valid_rate.
  _fx_ok := COALESCE(_live_fx IS NOT NULL AND jsonb_typeof(_live_fx) = 'object'
    AND octet_length(_live_fx::text) <= 65536
    AND jsonb_typeof(_live_fx->'base') = 'string' AND (_live_fx->>'base') ~ '^[A-Z]{3}$'
    AND jsonb_typeof(_live_fx->'rates') = 'object'
    AND jsonb_typeof(_live_fx->'date') = 'string' AND (_live_fx->>'date') ~ '^\d{4}-\d{2}-\d{2}$'
    AND jsonb_typeof(_live_fx->'provider') = 'string' AND char_length(_live_fx->>'provider') BETWEEN 1 AND 100, false);
  IF _fx_ok THEN
    _fx_base := _live_fx->>'base'; _fx_rates := _live_fx->'rates'; _fx_date := _live_fx->>'date';
    _fx_provider := _live_fx->>'provider';
    _fx_stale := CASE WHEN jsonb_typeof(_live_fx->'stale') = 'boolean' THEN (_live_fx->>'stale')::boolean ELSE false END;
  END IF;

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
        -- Priority 3: live market rate. 1 {base} = _lr {_cc}; a currency equal to the table's base counts as 1.
        _lr := NULL;
        IF _fx_ok THEN
          _bv := CASE WHEN _ctx->>'base_currency' = _fx_base THEN 1
                      WHEN jsonb_typeof(_fx_rates->(_ctx->>'base_currency')) = 'number' THEN (_fx_rates->>(_ctx->>'base_currency'))::numeric END;
          _tv := CASE WHEN _cc = _fx_base THEN 1
                      WHEN jsonb_typeof(_fx_rates->_cc) = 'number' THEN (_fx_rates->>_cc)::numeric END;
          IF _bv > 0 AND _tv > 0 THEN _lr := round(_tv / _bv, 8); END IF;
          IF _lr IS NOT NULL AND (_lr <= 0 OR _lr > 10000000) THEN _lr := NULL; END IF;
        END IF;
        IF _lr IS NULL THEN
          RETURN jsonb_build_object('status','no_valid_rate','reason', _cc);
        END IF;
        _money := jsonb_build_object('input_amount', _amt, 'input_currency', _cc, 'base_currency', _ctx->>'base_currency',
          'rate', _lr, 'rate_source', 'live', 'rate_provider', _fx_provider, 'rate_date', _fx_date, 'rate_stale', _fx_stale,
          'amount_ils', round(_amt / _lr, 2), 'amount_foreign', _amt, 'foreign_currency', _cc);
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

REVOKE ALL ON FUNCTION public.api_create_expense_proposal(text, uuid, uuid, jsonb, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_create_expense_proposal(text, uuid, uuid, jsonb, text, jsonb) TO service_role;

-- Safety: SECURITY DEFINER runs as the owner. Production's owner is postgres; if this script runs as
-- any other role the owner would silently change, so abort and roll everything back instead.
DO $guard$ BEGIN
  IF (SELECT p.proowner::regrole::text FROM pg_proc p WHERE p.oid = 'public.api_create_expense_proposal(text, uuid, uuid, jsonb, text, jsonb)'::regprocedure) <> 'postgres' THEN
    RAISE EXCEPTION 'api_create_expense_proposal would not be owned by postgres; nothing changed';
  END IF;
END $guard$;

COMMIT;

NOTIFY pgrst, 'reload schema';
