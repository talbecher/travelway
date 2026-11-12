-- Expected with the 0016 function: both succeed and every original key (null values included) is kept.
SET ROLE authenticated; SELECT set_config('test.uid', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', false);
SELECT 'after/null-fields', public.t_revise('a0000000-0000-4000-8000-000000000001',
  '[{"index":1,"latitude":35.0116,"longitude":135.7681,"google_maps_url":"https://www.google.com/maps/search/?api=1&query=35.0116,135.7681"}]');
SELECT 'after/no-nulls', public.t_revise('a0000000-0000-4000-8000-000000000002', '[{"index":0,"latitude":34.9,"longitude":135.6}]');
RESET ROLE;
SELECT 'after/null-fields-kept', (p.entries->1) = '{"entry_type":"food","title":"Ramen","time_of_day":null,"location_name":null,"description":null,"icon_emoji":null,"latitude":35.0116,"longitude":135.7681,"google_maps_url":"https://www.google.com/maps/search/?api=1&query=35.0116,135.7681"}'::jsonb
  AND (p.entries->0) = '{"entry_type":"note","title":"Hotel","time_of_day":null,"location_name":null,"description":null,"icon_emoji":null,"latitude":35.0,"longitude":135.0}'::jsonb
  AND p.location_sources = '{ai,existing}'
  FROM public.day_replace_proposals p WHERE p.id = 'a0000000-0000-4000-8000-000000000001';
SELECT 'after/no-nulls-kept', (p.entries->0) = '{"entry_type":"attraction","title":"Temple","time_of_day":"10:00","location_name":"Kyoto","description":"d","icon_emoji":"⛩","latitude":34.9,"longitude":135.6}'::jsonb
  AND p.location_sources = '{ai}'
  FROM public.day_replace_proposals p WHERE p.id = 'a0000000-0000-4000-8000-000000000002';
-- Function attributes unchanged: SECURITY DEFINER, search_path=public, EXECUTE only for authenticated/service_role (+ owner).
SELECT 'after/attributes', p.prosecdef AND p.proconfig = '{search_path=public}'
  AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
  AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
  AND has_function_privilege('service_role', p.oid, 'EXECUTE')
  AND (SELECT count(*) FROM pg_proc q WHERE q.proname = 'revise_day_proposal_locations') = 1
  FROM pg_proc p WHERE p.oid = 'public.revise_day_proposal_locations(uuid,text,jsonb)'::regprocedure;
