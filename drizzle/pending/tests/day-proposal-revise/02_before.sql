-- Expected with the 0009 function: null-field stop fails, stop without nulls succeeds.
SET ROLE authenticated; SELECT set_config('test.uid', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', false);
SELECT 'before/null-fields', public.t_revise('b0000000-0000-4000-8000-000000000001', '[{"index":0,"latitude":35.0116,"longitude":135.7681}]');
SELECT 'before/no-nulls', public.t_revise('b0000000-0000-4000-8000-000000000002', '[{"index":0,"latitude":34.9,"longitude":135.6}]');
RESET ROLE;
