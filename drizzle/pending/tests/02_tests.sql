\set QUIET on
SET client_min_messages = warning;
CREATE OR REPLACE FUNCTION pg_temp.fx(_stale boolean DEFAULT false) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object('base','ILS','date','2026-11-11','provider','exchangerate-api.com','stale',_stale,
    'rates', jsonb_build_object('ILS',1,'JPY',45.12,'USD',0.27,'EUR',0.25)) $$;
CREATE OR REPLACE FUNCTION pg_temp.op(_amt numeric, _cc text, _extra jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_array(jsonb_build_object('op','add','date','2026-11-11','category','food','amount',_amt,'currency',_cc) || _extra) $$;
CREATE OR REPLACE FUNCTION pg_temp.call(_rid text, _ops jsonb, _fx jsonb DEFAULT NULL) RETURNS jsonb LANGUAGE sql AS $$
  SELECT CASE WHEN _fx IS NULL
    THEN public.api_create_expense_proposal(_hash=>'H1', _trip_id=>NULL, _request_id=>_rid::uuid, _ops=>_ops, _note=>NULL)
    ELSE public.api_create_expense_proposal(_hash=>'H1', _trip_id=>NULL, _request_id=>_rid::uuid, _ops=>_ops, _note=>NULL, _live_fx=>_fx) END $$;
CREATE OR REPLACE FUNCTION pg_temp.money(_id text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT ops->0->'money' FROM public.item_proposals WHERE id = _id::uuid $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO PUBLIC;

\echo '== signature: exactly one function, 6th arg has default; privileges'
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM pg_proc WHERE proname='api_create_expense_proposal') = 1, 'more than one signature';
  ASSERT (SELECT pg_get_function_identity_arguments(oid) FROM pg_proc WHERE proname='api_create_expense_proposal')
     = '_hash text, _trip_id uuid, _request_id uuid, _ops jsonb, _note text, _live_fx jsonb', 'signature';
  ASSERT (SELECT pronargdefaults FROM pg_proc WHERE proname='api_create_expense_proposal') = 1, 'default';
  ASSERT (SELECT prosecdef FROM pg_proc WHERE proname='api_create_expense_proposal'), 'security definer kept';
  ASSERT has_function_privilege('service_role','public.api_create_expense_proposal(text,uuid,uuid,jsonb,text,jsonb)','EXECUTE');
  ASSERT NOT has_function_privilege('anon','public.api_create_expense_proposal(text,uuid,uuid,jsonb,text,jsonb)','EXECUTE'), 'anon';
  ASSERT NOT has_function_privilege('authenticated','public.api_create_expense_proposal(text,uuid,uuid,jsonb,text,jsonb)','EXECUTE'), 'authenticated';
  -- Same ACL and owner as production had before the change: {postgres=X/postgres,service_role=X/postgres}
  ASSERT (SELECT proacl::text FROM pg_proc WHERE proname='api_create_expense_proposal') = '{postgres=X/postgres,service_role=X/postgres}',
    (SELECT proacl::text FROM pg_proc WHERE proname='api_create_expense_proposal');
  ASSERT (SELECT proowner::regrole::text FROM pg_proc WHERE proname='api_create_expense_proposal') = 'postgres', 'owner';
  RAISE NOTICE 'ok';
END $$;

SET ROLE service_role;
\echo '== T1 ¥1, no manual rate, no live table: still no_valid_rate (old 5-arg call works)'
DO $$ DECLARE r jsonb; BEGIN
  r := pg_temp.call('10000000-0000-4000-8000-000000000001', pg_temp.op(1,'JPY'));
  ASSERT r = '{"status":"no_valid_rate","reason":"JPY"}', r::text;
  ASSERT NOT EXISTS (SELECT 1 FROM item_proposals), 'no row';
END $$;
\echo '== T2 ¥1, no manual rate, live table: proposal with live rate stored in the op, base unchanged'
DO $$ DECLARE r jsonb; m jsonb; p item_proposals%ROWTYPE; BEGIN
  r := pg_temp.call('10000000-0000-4000-8000-000000000002', pg_temp.op(1,'jpy'), pg_temp.fx());
  ASSERT r->>'status' = 'ok', r::text;
  m := pg_temp.money(r->>'id');
  ASSERT m->>'rate_source' = 'live' AND (m->>'rate')::numeric = 45.12 AND (m->>'amount_ils')::numeric = 0.02
     AND (m->>'amount_foreign')::numeric = 1 AND m->>'foreign_currency' = 'JPY' AND m->>'input_currency' = 'JPY'
     AND m->>'rate_provider' = 'exchangerate-api.com' AND m->>'rate_date' = '2026-11-11' AND (m->>'rate_stale')::boolean = false, m::text;
  SELECT * INTO p FROM item_proposals WHERE id = (r->>'id')::uuid;
  ASSERT p.base->'money' = public._item_money_ctx(p.trip_id), 'base money must equal ctx (no live data in base)';
  ASSERT NOT (p.base->'money' ? 'rate_source') AND NOT (p.base::text LIKE '%45.12%'), 'live rate leaked into base';
  ASSERT (p.ops->0->'values'->>'amount_ils')::numeric = 0.02 AND (p.ops->0->'values'->>'amount_foreign')::numeric = 1, p.ops::text;
END $$;
\echo '== T2b ¥23,480 live: amount_ils = round(23480/45.12, 2)'
DO $$ DECLARE r jsonb; BEGIN
  r := pg_temp.call('10000000-0000-4000-8000-000000000021', pg_temp.op(23480,'JPY',  '{"description":"calc check"}'), pg_temp.fx());
  ASSERT (pg_temp.money(r->>'id')->>'amount_ils')::numeric = round(23480/45.12, 2), pg_temp.money(r->>'id')::text;
END $$;
\echo '== T3 ILS: rate 1, source same, even when a live table is passed'
DO $$ DECLARE r jsonb; m jsonb; BEGIN
  r := pg_temp.call('10000000-0000-4000-8000-000000000003', pg_temp.op(50,'ILS'), pg_temp.fx());
  m := pg_temp.money(r->>'id');
  ASSERT m->>'rate_source' = 'same' AND (m->>'rate')::numeric = 1 AND (m->>'amount_ils')::numeric = 50 AND m->'amount_foreign' = 'null', m::text;
END $$;
\echo '== T4 stale table: still allowed, flagged'
DO $$ DECLARE r jsonb; BEGIN
  r := pg_temp.call('10000000-0000-4000-8000-000000000004', pg_temp.op(2,'JPY'), pg_temp.fx(true));
  ASSERT (pg_temp.money(r->>'id')->>'rate_stale')::boolean, 'stale flag';
END $$;
\echo '== T5 unsupported currency: no_valid_rate, nothing written'
DO $$ DECLARE r jsonb; n int; BEGIN
  SELECT count(*) INTO n FROM item_proposals;
  r := pg_temp.call('10000000-0000-4000-8000-000000000005', pg_temp.op(1,'XXX'), pg_temp.fx());
  ASSERT r = '{"status":"no_valid_rate","reason":"XXX"}', r::text;
  ASSERT (SELECT count(*) FROM item_proposals) = n, 'row written';
END $$;
\echo '== T6 idempotency: same request_id + same ops, different rate table -> replay of the stored proposal'
DO $$ DECLARE a jsonb; b jsonb; n int; BEGIN
  a := pg_temp.call('10000000-0000-4000-8000-000000000006', pg_temp.op(7,'JPY'), pg_temp.fx());
  SELECT count(*) INTO n FROM item_proposals;
  b := pg_temp.call('10000000-0000-4000-8000-000000000006', pg_temp.op(7,'JPY'),
        jsonb_set(pg_temp.fx(), '{rates,JPY}', '99'));
  ASSERT (b->>'replayed')::boolean AND b->>'id' = a->>'id', b::text;
  ASSERT (SELECT count(*) FROM item_proposals) = n, 'duplicate row';
  ASSERT (pg_temp.money(a->>'id')->>'rate')::numeric = 45.12, 'stored rate changed on replay';
  -- replay works even without any table (provider down on retry)
  b := pg_temp.call('10000000-0000-4000-8000-000000000006', pg_temp.op(7,'JPY'));
  ASSERT (b->>'replayed')::boolean, b::text;
  b := pg_temp.call('10000000-0000-4000-8000-000000000006', pg_temp.op(8,'JPY'), pg_temp.fx());
  ASSERT b->>'status' = 'idempotency_conflict', b::text;
END $$;
\echo '== T7 injection: rate fields inside an operation are rejected'
DO $$ DECLARE r jsonb; k text; BEGIN
  FOREACH k IN ARRAY ARRAY['rate','rate_source','amount_ils','_live_fx','money'] LOOP
    r := pg_temp.call('10000000-0000-4000-8000-000000000007', pg_temp.op(1,'JPY', jsonb_build_object(k, 1000)), pg_temp.fx());
    ASSERT r->>'reason' = 'bad_key', k || ' ' || r::text;
  END LOOP;
END $$;
\echo '== T8 malformed live tables are ignored -> no_valid_rate'
DO $$ DECLARE r jsonb; bad jsonb; BEGIN
  FOREACH bad IN ARRAY ARRAY[
    '"x"'::jsonb, '[]', '{}',
    jsonb_set(pg_temp.fx(), '{base}', '"ils"'),
    jsonb_set(pg_temp.fx(), '{rates,JPY}', '"45"'),
    jsonb_set(pg_temp.fx(), '{rates,JPY}', '-45'),
    jsonb_set(pg_temp.fx(), '{rates,JPY}', '0'),
    jsonb_set(pg_temp.fx(), '{rates,JPY}', '1e30'),
    jsonb_set(pg_temp.fx(), '{rates}', '[]'),
    pg_temp.fx() - 'date', pg_temp.fx() - 'provider',
    jsonb_set(pg_temp.fx(), '{date}', '"yesterday"')] LOOP
    r := pg_temp.call('10000000-0000-4000-8000-000000000008', pg_temp.op(1,'JPY'), bad);
    ASSERT r = '{"status":"no_valid_rate","reason":"JPY"}', bad::text || ' -> ' || r::text;
  END LOOP;
END $$;

RESET ROLE;
\echo '== T9 manual rate wins over the live table for the trip target currency; other currencies use live'
UPDATE settings SET manual_exchange_rate = 40;
SET ROLE service_role;
DO $$ DECLARE r jsonb; m jsonb; BEGIN
  r := pg_temp.call('10000000-0000-4000-8000-000000000009', pg_temp.op(400,'JPY'), pg_temp.fx());
  m := pg_temp.money(r->>'id');
  ASSERT m->>'rate_source' = 'manual' AND (m->>'rate')::numeric = 40 AND (m->>'amount_ils')::numeric = 10, m::text;
  r := pg_temp.call('10000000-0000-4000-8000-000000000010', pg_temp.op(27,'USD'), pg_temp.fx());
  m := pg_temp.money(r->>'id');
  ASSERT m->>'rate_source' = 'live' AND (m->>'rate')::numeric = 0.27 AND (m->>'amount_ils')::numeric = 100, m::text;
  -- manual rate case needs no table at all (no external call)
  r := pg_temp.call('10000000-0000-4000-8000-000000000011', pg_temp.op(400,'JPY'));
  ASSERT pg_temp.money(r->>'id')->>'rate_source' = 'manual', r::text;
END $$;
RESET ROLE;
\echo '== T10 non-ILS base currency: cross rate via the table'
UPDATE settings SET manual_exchange_rate = NULL, base_currency = 'USD';
SET ROLE service_role;
DO $$ DECLARE r jsonb; m jsonb; BEGIN
  r := pg_temp.call('10000000-0000-4000-8000-000000000012', pg_temp.op(4512,'JPY'), pg_temp.fx());
  m := pg_temp.money(r->>'id');
  ASSERT (m->>'rate')::numeric = round(45.12/0.27, 8) AND (m->>'amount_ils')::numeric = round(4512/round(45.12/0.27,8), 2)
     AND m->>'base_currency' = 'USD', m::text;
  r := pg_temp.call('10000000-0000-4000-8000-000000000013', pg_temp.op(10,'ILS'), pg_temp.fx());
  m := pg_temp.money(r->>'id');
  ASSERT (m->>'rate')::numeric = round(1/0.27, 8) AND m->>'rate_source' = 'live', m::text;
END $$;
RESET ROLE;
UPDATE settings SET base_currency = 'ILS';
DELETE FROM item_proposals WHERE ops->0->'money'->>'base_currency' = 'USD';

\echo '== T11 apply: uses the stored live rate, no re-conversion; existing expense untouched; second apply = already_applied'
SET test.uid = 'bbbbbbbb-0000-4000-8000-000000000001';
SET ROLE authenticated;
DO $$ DECLARE pid uuid; v jsonb; r jsonb; e expenses%ROWTYPE; BEGIN
  SELECT id INTO pid FROM item_proposals WHERE request_id = '10000000-0000-4000-8000-000000000002';
  v := public.get_item_proposal_view(pid);
  ASSERT v->>'state' = 'pending' AND NOT (v->'ops'->0->>'conflict')::boolean, 'conflict at review: ' || v::text;
  r := public.apply_item_proposal(pid, v->>'seen_hash', '{}');
  ASSERT r->>'status' = 'done' AND (r->>'added')::int = 1, r::text;
  r := public.apply_item_proposal(pid, v->>'seen_hash', '{}');
  ASSERT r->>'status' = 'already_applied', r::text;
END $$;
RESET ROLE;
DO $$ DECLARE e expenses%ROWTYPE; BEGIN
  SELECT * INTO STRICT e FROM expenses WHERE description IS NULL AND amount_foreign = 1;
  ASSERT e.amount_ils = 0.02 AND e.foreign_currency = 'JPY' AND e.category = 'food' AND e.expense_date = '2026-11-11', to_jsonb(e)::text;
  SELECT * INTO STRICT e FROM expenses WHERE id = 'dddddddd-0000-4000-8000-000000000001';
  ASSERT e.amount_ils = 520.00 AND e.amount_foreign = 23480 AND e.foreign_currency = 'JPY' AND e.description = 'existing', 'existing expense changed';
  ASSERT (SELECT count(*) FROM expenses) = 2, 'unexpected expenses';
END $$;
\echo '== T12 a later manual-rate change marks a live proposal as conflict (existing safety rule, unchanged)'
UPDATE settings SET manual_exchange_rate = 44;
SET ROLE authenticated;
DO $$ DECLARE pid uuid; v jsonb; BEGIN
  SELECT id INTO pid FROM item_proposals WHERE request_id = '10000000-0000-4000-8000-000000000004';
  v := public.get_item_proposal_view(pid);
  ASSERT (v->'ops'->0->>'conflict')::boolean, v::text;
END $$;
RESET ROLE;
UPDATE settings SET manual_exchange_rate = NULL;
\echo '== T13 reject a live proposal: no expense'
SELECT count(*) AS n_before FROM expenses \gset
SET ROLE authenticated;
DO $$ DECLARE pid uuid; BEGIN
  SELECT id INTO pid FROM item_proposals WHERE request_id = '10000000-0000-4000-8000-000000000021';
  ASSERT public.reject_item_proposal(pid)->>'status' = 'rejected';
END $$;
RESET ROLE;
SELECT (count(*) = :n_before) AS same_count FROM expenses \gset
SELECT CASE WHEN :'same_count'::boolean THEN 'ok' ELSE (1/0)::text END AS reject_created_no_expense \gset
\echo 'ALL SQL TESTS PASSED'
