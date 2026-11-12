#!/usr/bin/env bash
# Local SQL test for 0016_revise_locations_keep_null_fields.sql. Never point this at production.
# Needs a throw-away local PostgreSQL 16. Usage: PGHOST=<socket dir> PGPORT=<port> drizzle/pending/tests/day-proposal-revise/run.sh
set -euo pipefail
cd "$(dirname "$0")/../../../.."
T=drizzle/pending/tests/day-proposal-revise
B="psql -U ${PGUSER:-postgres} -v ON_ERROR_STOP=1 -q"
$B -c "DROP DATABASE IF EXISTS tw_revise_test" -c "DROP ROLE IF EXISTS anon" -c "DROP ROLE IF EXISTS authenticated" -c "DROP ROLE IF EXISTS service_role"
$B -c "CREATE DATABASE tw_revise_test"
P="$B -d tw_revise_test"
$P -f $T/00_stub.sql
# Production guard = 0012 definition; production revise = 0009 definition.
awk '/^CREATE OR REPLACE FUNCTION public.day_replace_proposals_guard/,/^END \$function\$;/' drizzle/migrations/0012_day_proposal_saved_place_source.sql | $P
awk '/^CREATE OR REPLACE FUNCTION public.revise_day_proposal_locations/,0' drizzle/migrations/0009_revise_day_proposal_locations.sql | $P
$P -f $T/01_seed.sql >/dev/null
fail=0
expect() { # label, pattern
  local line; line=$(grep "^$1|" <<<"$OUT" || true); echo "$line"
  [[ "$line" == *"$2"* ]] || { echo "  UNEXPECTED (wanted: $2)"; fail=1; }; }
OUT=$($P -At -F"|" -f $T/02_before.sql)
expect before/null-fields "ERROR: Proposal content is immutable"
expect before/no-nulls '"status": "ok"'
$P --single-transaction -f drizzle/migrations/0016_revise_locations_keep_null_fields.sql
OUT=$($P -At -F"|" -f $T/03_after.sql)
expect after/null-fields '"status": "ok"'
expect after/no-nulls '"status": "ok"'
expect after/null-fields-kept "|t"
expect after/no-nulls-kept "|t"
expect after/attributes "|t"
$B -c "DROP DATABASE tw_revise_test"
[ $fail = 0 ] && echo "ALL OK" || { echo "FAILED"; exit 1; }
