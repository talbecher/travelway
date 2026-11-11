#!/usr/bin/env bash
# Local SQL tests for 0015_expense_proposal_live_rate.sql. Never point this at production.
# Needs a throw-away local PostgreSQL 16. Usage: PGHOST=<socket dir> PGPORT=<port> drizzle/pending/tests/run.sh
set -euo pipefail
cd "$(dirname "$0")/../../.."
B="psql -U ${PGUSER:-postgres} -v ON_ERROR_STOP=1 -q"
$B -c "DROP DATABASE IF EXISTS tw_fx_test" -c "DROP ROLE IF EXISTS anon" -c "DROP ROLE IF EXISTS authenticated" -c "DROP ROLE IF EXISTS service_role"
$B -c "CREATE DATABASE tw_fx_test"
P="$B -d tw_fx_test"
$P -f drizzle/pending/tests/00_stub.sql
$P -f drizzle/migrations/0013_item_proposals_itinerary_expenses.sql
$P -f drizzle/pending/tests/01_seed.sql
echo "before fix (expect no_valid_rate):"
$P -At -c "SET ROLE service_role; SELECT public.api_create_expense_proposal(_hash=>'H1', _trip_id=>NULL, _request_id=>'eeeeeeee-0000-4000-8000-000000000001', _ops=>'[{\"op\":\"add\",\"date\":\"2026-11-11\",\"category\":\"food\",\"amount\":1,\"currency\":\"JPY\"}]', _note=>NULL);"
$P -f drizzle/pending/0015_expense_proposal_live_rate.sql 2>/dev/null
$P -f drizzle/pending/0015_expense_proposal_live_rate.sql 2>/dev/null   # re-runnable
$P -f drizzle/pending/tests/02_tests.sql
$P -f drizzle/pending/0015_expense_proposal_live_rate.rollback.sql
echo "after rollback, function md5 (production before the fix: fe8b94c02633b42f1de6eec54535a5f4):"
$P -At -c "SELECT md5(pg_get_functiondef('public.api_create_expense_proposal(text,uuid,uuid,jsonb,text)'::regprocedure))"
$B -c "DROP DATABASE tw_fx_test"
