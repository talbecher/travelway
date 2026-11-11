-- Rollback for 0015_expense_proposal_live_rate.sql: restores the exact function from
-- drizzle/migrations/0013_item_proposals_itinerary_expenses.sql (manual rate only).
-- Run only AFTER the application code that passes _live_fx has been reverted (the old code never
-- passes it, and the new code falls back to the old 422 answer if the call fails).
-- Proposals already created with rate_source 'live' stay valid: apply_item_proposal is unchanged.

BEGIN;

DROP FUNCTION IF EXISTS public.api_create_expense_proposal(text, uuid, uuid, jsonb, text, jsonb);

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

REVOKE ALL ON FUNCTION public.api_create_expense_proposal(text, uuid, uuid, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_create_expense_proposal(text, uuid, uuid, jsonb, text) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
