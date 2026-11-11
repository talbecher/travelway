-- Mirrors production ACLs (service_role holds EXECUTE on these helpers).
GRANT EXECUTE ON FUNCTION public._item_money_ctx(uuid), public._expense_sig(public.expenses), public._item_analyze(public.item_proposals), public._item_view_hash(public.item_proposals, jsonb), public._item_token_live(uuid,uuid,text) TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
INSERT INTO public.trips(id, owner_id, currency_code) VALUES ('aaaaaaaa-0000-4000-8000-000000000001','bbbbbbbb-0000-4000-8000-000000000001','JPY');
INSERT INTO public.settings(trip_id, base_currency, foreign_currency, manual_exchange_rate) VALUES ('aaaaaaaa-0000-4000-8000-000000000001','ILS','JPY',NULL);
INSERT INTO public.api_tokens(id, user_id, token_hash, trip_id, scopes) VALUES
 ('cccccccc-0000-4000-8000-000000000001','bbbbbbbb-0000-4000-8000-000000000001','H1','aaaaaaaa-0000-4000-8000-000000000001','{propose_expenses}');
-- An existing expense, standing in for the ¥23,480 one: must never change.
INSERT INTO public.expenses(id, trip_id, amount_ils, amount_foreign, foreign_currency, category, description, expense_date)
VALUES ('dddddddd-0000-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-000000000001', 520.00, 23480, 'JPY', 'food', 'existing', '2026-11-05');
