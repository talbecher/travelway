-- READ-ONLY. Run immediately before 0015 (and after a rollback). Every column must be true.
-- Confirms the database still has exactly the function version 0015 was built and tested against.
WITH f AS (
  SELECT p.oid, p.proowner::regrole::text AS owner, p.proacl::text AS acl, p.prosecdef
  FROM pg_proc p WHERE p.proname = 'api_create_expense_proposal' AND p.pronamespace = 'public'::regnamespace
), c AS (
  SELECT
    current_user = 'postgres' AS runs_as_postgres,
    (SELECT count(*) FROM f) = 1 AS single_signature,
    to_regprocedure('public.api_create_expense_proposal(text,uuid,uuid,jsonb,text)') IS NOT NULL AS is_5_arg_version,
    COALESCE(md5(pg_get_functiondef(to_regprocedure('public.api_create_expense_proposal(text,uuid,uuid,jsonb,text)'))) = 'fe8b94c02633b42f1de6eec54535a5f4', false) AS body_matches_built_version,
    COALESCE((SELECT owner = 'postgres' AND prosecdef FROM f), false) AS owner_postgres_security_definer,
    COALESCE((SELECT acl = '{postgres=X/postgres,service_role=X/postgres}' FROM f), false) AS execute_only_owner_and_service_role,
    COALESCE(md5(pg_get_functiondef(to_regprocedure('public._item_money_ctx(uuid)'))) = 'eb12d9a157c4035c297c281951394f0e', false) AS money_ctx_unchanged,
    COALESCE(md5(pg_get_functiondef(to_regprocedure('public.apply_item_proposal(uuid,text,integer[])'))) = 'f90874ad64d88997db297193af5a1766', false) AS apply_unchanged
)
SELECT c.*, (runs_as_postgres AND single_signature AND is_5_arg_version AND body_matches_built_version
  AND owner_postgres_security_definer AND execute_only_owner_and_service_role AND money_ctx_unchanged AND apply_unchanged) AS all_ok
FROM c;
