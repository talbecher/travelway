-- READ-ONLY. Run right after 0015 (and any time later). Every column must be true.
WITH f AS (
  SELECT p.oid, p.proowner::regrole::text AS owner, p.proacl::text AS acl, p.prosecdef, p.pronargdefaults,
         pg_get_function_identity_arguments(p.oid) AS args, p.proconfig
  FROM pg_proc p WHERE p.oid = to_regprocedure('public.api_create_expense_proposal(text,uuid,uuid,jsonb,text,jsonb)')
), c AS (
  SELECT
    (SELECT count(*) FROM pg_proc p WHERE p.proname = 'api_create_expense_proposal' AND p.pronamespace = 'public'::regnamespace) = 1 AS single_signature,
    to_regprocedure('public.api_create_expense_proposal(text,uuid,uuid,jsonb,text)') IS NULL AS old_5_arg_absent,
    COALESCE((SELECT args = '_hash text, _trip_id uuid, _request_id uuid, _ops jsonb, _note text, _live_fx jsonb' AND pronargdefaults = 1 FROM f), false) AS is_6_arg_with_default,
    COALESCE((SELECT owner = 'postgres' AND prosecdef AND proconfig = '{search_path=public}' FROM f), false) AS owner_postgres_security_definer,
    COALESCE((SELECT acl = '{postgres=X/postgres,service_role=X/postgres}' FROM f), false) AS execute_only_owner_and_service_role,
    NOT COALESCE(has_function_privilege('anon', (SELECT oid FROM f), 'EXECUTE'), true)
      AND NOT COALESCE(has_function_privilege('authenticated', (SELECT oid FROM f), 'EXECUTE'), true) AS anon_authenticated_denied,
    COALESCE(position('''rate_source'', ''live''' IN pg_get_functiondef((SELECT oid FROM f))) > 0, false) AS live_branch_present
)
SELECT c.*, (single_signature AND old_5_arg_absent AND is_6_arg_with_default AND owner_postgres_security_definer
  AND execute_only_owner_and_service_role AND anon_authenticated_denied AND live_branch_present) AS all_ok
FROM c;
