# Read-only AI access to Travel Way trips (final, ready to build)

This plan is purely additive. It changes no existing screens, routing, itinerary logic or trip permissions.

## 1. Verified facts
- **Data:** trips, itinerary_versions (`is_active` stored on the server), itinerary_days, day_entries, recommendations (booking fields), hotels, expenses (`amount_ils` + optional foreign amount), settings (base_currency), checklist_items, documents.
- **Not in the data:** flights, transport, a reservations table, timezone, updated_at, a traveler list. None of these will be invented.
- **Access today:** a user can open a trip they own or one listed in `shared_user_ids`.
- **Privileged server connection:** the server-only admin client and its project secret already exist in this runtime. No new credentials are needed.

## 2. Authorization model
- **Token format:** `Authorization: Bearer twpat_<43 chars>` (32 random bytes). The server stores only its SHA-256 hash and compares hashes. Tokens sent in a query, cookie or body are refused.
- **Single guard:** a new database function, callable by the server role only, takes the token hash and an optional requested trip id. It returns the resolved trip id, or a reason (`invalid`, `revoked`, `expired`, `missing_trip`, `scope_mismatch`, `no_access`). On every request it checks:
  - the token exists, is not revoked and is not expired
  - the token's trip scope matches the requested trip
  - the token owner currently owns the trip or is in `shared_user_ids`, checked live every time
- **Effects of the live check:** removing sharing cuts off access immediately. A trip-scoped token is never a lasting grant.
- **Usage tracking:** the same function bumps `last_used_at` only if it is more than 5 minutes old.
- **After the guard:** every read uses the admin client, filtered by the verified trip id. Day entries are read only through days of that trip's verified active version. The caller never supplies a user id.
- **HTTP responses:** 401 for invalid, revoked or expired tokens. 400 when trip_id is missing on a token without trip scope. 403 for a scope mismatch. 404 when there is no access, so the response doesn't reveal whether the trip exists.
- **Active version:** exactly one `is_active` version is required. Zero or several active versions returns `itinerary_version: null`, no days and `notice: "no_active_version"`.

## 3. Token table and management
- **New table `api_tokens`:** id, user_id, token_hash (unique), label, trip_id (nullable), created_at, expires_at, revoked_at, last_used_at.
- **Database protection:** row security is on, there are no policies, and `authenticated` and `anon` get no grants. Only the server role can reach the table, so the hash is never exposed to any client.
- **Three signed-in server functions:**
  - **Create:** label, trip (default; must currently be accessible, checked with the user's own session), expiry (30, 90 or 365 days). Returns the raw token once. It is never logged.
  - **List:** returns safe metadata only.
  - **Revoke:** works only on the caller's own rows.
- **Screen:** a small "AI access" screen opens from the existing user menu. It has the create form, a one-time copy, the list, revoke buttons, and the read-only explanation text.

## 4. Response contract (`schema_version` "1.0")
`GET /api/public/trip-context`
- **Parameters:** `trip_id`, `section`, `date`, `city`, `limit` (1–200, default 100), `cursor`. Unknown parameters return 400.
- **Every response includes:** `schema_version`, `generated_at` and `trip` (id, name, dates, destination text, number of travelers).

| Data | Full-trip mode | Paged section |
|---|---|---|
| trip, itinerary_version, days (date, number, city, item count) | complete | — |
| itinerary items | included only if the total is 300 or fewer; otherwise counts only plus `truncated:false, use_section:"itinerary"` | `section=itinerary` (+`date`) |
| hotels | complete if 50 or fewer, otherwise count | `section=hotels` |
| saved_places | count by type and status | `section=saved_places` (+`city`) |
| reservations (recs with a booking status other than none) | count | `section=reservations` |
| expenses | summary only | `section=expenses` (summary, no line items) |
| checklist | done/total + count of open items | `section=checklist` |
| documents | count | `section=documents` (metadata: id, title, type, valid_date, linked place; never files, barcodes or URLs) |

- **Pagination:** each section is ordered by fixed keys. Itinerary items use a server-only database function that orders by (date, display_order, created_at, id) and filters by trip and version. Each request fetches `limit+1` rows to know whether more exist, and never loads everything.
- **Metadata:** `pagination: {limit, next_cursor|null}`.
- **Cursors:** a cursor is the last row's keys, signed with a new generated server secret. It is bound to user, trip, section and filters, and a mismatch returns 400.
- **Expenses:** the total in base currency uses `amount_ils` only when base_currency is ILS. Foreign amounts are totalled separately per currency. Rows without a usable value are counted as `unconverted_count`, never as zero. No exchange rates are invented.
- **Headers and errors:** `Cache-Control: no-store`. Errors look like `{"error":"…"}`, with no internal details.
- **Endpoints:** the read API allows GET only. Other methods return 405. `GET /api/public/openapi.json` serves an OpenAPI 3.1 document.

## 5. Rate limiting and logging
- **Rate limiting:** there is no suitable built-in limiter, and a database write per read was ruled out. v1 has no reliable global rate limit, and the final report will say so. Only the throttled `last_used_at` write happens.
- **Logging:**
  - The handler never logs headers.
  - Errors are reduced to a code before logging.
  - The token is removed from any error message under the app's control.
  - Hosting-level header logging can't be verified from here, and the report will state that.

## 6. Verification
- **Test users:** two dedicated test users, A and B, with test trips: one owned by A, one owned by B and shared with A. All test data is deleted afterwards.
- **Test cases:**
  - missing, invalid, revoked and expired tokens
  - token A asking for B's private trip
  - a scope mismatch, and a missing trip_id
  - a shared trip readable, then denied right after unsharing
  - itinerary and saved-places paging with more than 300 items, plus a tampered cursor
  - POST returning 405
  - no trip-table changes after the reads (row checksums)
  - no hash readable through the browser client
- **Build checks:** TypeScript and the production build must pass.
- **Final report:** separates runtime-tested results from code-read claims.

## 7. Out of scope (later)
Custom GPT setup (import the OpenAPI document, set Bearer auth, paste the token) and an MCP wrapper. Neither is part of this phase.

## Technical files
- Migration: `api_tokens` table, the guard function and the items page function, both executable by the server role only.
- New secret: `API_CURSOR_SECRET` (generated).
- `src/lib/trip-context.server.ts` for the guard call, reads and DTO mapping.
- `src/lib/api-tokens.functions.ts` for create, list and revoke.
- `src/routes/api/public/trip-context.ts` and `src/routes/api/public/openapi[.]json.ts`.
- `src/routes/ai-access.tsx` plus one menu link.
- One rule added to `AGENTS.md`.
