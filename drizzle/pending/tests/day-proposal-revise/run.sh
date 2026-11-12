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
MD5="SELECT md5(pg_get_functiondef('public.revise_day_proposal_locations(uuid,text,jsonb)'::regprocedure)) || ':' || (SELECT count(*) FROM public.day_replace_proposals) || ':' || (SELECT md5(string_agg(entries::text || location_sources::text, ',' ORDER BY id)) FROM public.day_replace_proposals)"
FN_0009=$($P -At -c "$MD5" | cut -d: -f1)
fail=0
expect() { # label, pattern
  local line; line=$(grep "^$1|" <<<"$OUT" || true); echo "$line"
  [[ "$line" == *"$2"* ]] || { echo "  UNEXPECTED (wanted: $2)"; fail=1; }; }
OUT=$($P -At -F"|" -f $T/02_before.sql)
expect before/null-fields "ERROR: Proposal content is immutable"
expect before/no-nulls '"status": "ok"'
DATA_BEFORE=$($P -At -c "$MD5" | cut -d: -f2-)
$P --single-transaction -f drizzle/migrations/0016_revise_locations_keep_null_fields.sql
FIRST=$($P -At -c "$MD5")
$P --single-transaction -f drizzle/migrations/0016_revise_locations_keep_null_fields.sql   # second run must change nothing
SECOND=$($P -At -c "$MD5")
echo "0016 run twice: $FIRST / $SECOND"
[ "$FIRST" = "$SECOND" ] || { echo "  UNEXPECTED: second run changed something"; fail=1; }
[ "${FIRST#*:}" = "$DATA_BEFORE" ] || { echo "  UNEXPECTED: migration changed proposal data"; fail=1; }
[ "${FIRST%%:*}" != "$FN_0009" ] || { echo "  UNEXPECTED: function unchanged by 0016"; fail=1; }
OUT=$($P -At -F"|" -f $T/03_after.sql)
expect after/null-fields '"status": "ok"'
expect after/no-nulls '"status": "ok"'
expect after/null-fields-kept "|t"
expect after/no-nulls-kept "|t"
expect after/attributes "|t"
# Rollback restores the exact 0009 function, twice in a row, and 0016 can be re-applied afterwards.
$P --single-transaction -f drizzle/pending/0016_revise_locations_keep_null_fields.rollback.sql
$P --single-transaction -f drizzle/pending/0016_revise_locations_keep_null_fields.rollback.sql
RB=$($P -At -c "$MD5" | cut -d: -f1); echo "after rollback: $RB (0009: $FN_0009)"
[ "$RB" = "$FN_0009" ] || { echo "  UNEXPECTED: rollback is not the 0009 function"; fail=1; }
$P --single-transaction -f drizzle/migrations/0016_revise_locations_keep_null_fields.sql
[ "$($P -At -c "$MD5" | cut -d: -f1)" = "${FIRST%%:*}" ] || { echo "  UNEXPECTED: re-apply after rollback differs"; fail=1; }
$B -c "DROP DATABASE tw_revise_test"
[ $fail = 0 ] && echo "ALL OK" || { echo "FAILED"; exit 1; }
