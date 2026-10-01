# Read-only AI access to Travel Way trips (planning only)

Planning only. Nothing is built in this round. The plan is grounded in the current tables and access rules, which were read before writing it.

## 1. What exists today (verified)

| Internal source | External field | Notes |
|---|---|---|
| trips (title, start/end_date, destination_country, num_travelers, currency_code, travel_* prefs) | `trip` | `destination_country` is free text (country or city). Never expose entry_pin, share_token or shared_user_ids |
| itinerary_versions (is_active) | `itinerary_version {id,name}` | Stored on the server. The app picks `is_active`, otherwise the first version. The API uses only `is_active = true` and never falls back (see Decisions) |
| itinerary_days (date, day_number, city_label, notes, version_id) | `itinerary_days[]` | Active version only |
| day_entries (title, time_of_day, entry_type, location_name, lat/lng, google_maps_url, description, linked rec/hotel) | `itinerary_days[].items[]` | No photo_url |
| recommendations (name, type, city, status, address, lat/lng, rating, google_rating, notes, booking_status/time/deadline/url) | `saved_places[]` | |
| recommendations with a booking_status | `reservations[]` | Derived view. There is no reservations table |
| hotels | `hotels[]` | No confirmation_url, photo_url or review text |
| expenses + settings.base_currency | `expenses_summary` | Totals by category and by date. No line items in v1 |
| checklist_items | `checklist_summary` | Done/total, open items with due dates |
| documents | `documents[]` (metadata) | id, title, type, valid_date, linked rec only. Never file_url or barcode_value |

Not present in the data, so not in the API: flights, transport, timezone, updated_at, a traveler list. Days have no `updated_at` either.

**Access model today:** every table checks `can_access_trip(trip_id)`, which means the owner or anyone in `shared_user_ids`. A token holder therefore gets the same trips they can see in the app, including trips shared with them.

## 2. Decisions to confirm before building
1. **Shared trips:** should a token read trips shared with its owner, or only trips they own? Recommended: the same as the app (owner or shared).
2. **Active version:** nothing stops a trip from having zero or several `is_active` rows. Rule: exactly one active version is required. Zero or several returns `itinerary_version: null` and empty days, with a `"no_active_version"` notice. No guessing.
3. **Token scope:** each token is either tied to one trip or covers all of its owner's accessible trips. Recommended default for ChatGPT: tied to one trip.

## 3. How a token is checked (Lovable Cloud)
- **A.** The endpoint reads only `Authorization: Bearer twpat_<random>`. It rejects tokens passed as query, cookie or body.
- **B.** The token is 32 random bytes. The server computes SHA-256 of it and matches the stored hash with a timing-safe comparison. The raw token is never stored.
- **C.** A match resolves to `user_id` and an optional `trip_id`. The token must also not be revoked or expired.
- **D/E.** The token is not a normal sign-in, so `auth.uid()` is empty and ordinary access rules don't apply to it. Queries therefore run with the server's privileged connection, loaded inside the handler only. This connection is never exposed.
- **F.** Every read starts from one guard. It loads the trip by id and requires `owner_id = user_id OR user_id = ANY(shared_user_ids)`, plus the token's trip scope. All later queries filter on that verified `trip_id`. Day entries are joined through days of that trip and active version.
- **G.** The app's existing access rules are bypassed by this connection, so the guard replaces them. It mirrors `can_access_trip` exactly. Keeping all reads in one module with a single entry function keeps that guard in one place.
- **H.** User B's data can't leak to User A because the caller never supplies a user. The user comes only from the token hash. A trip outside the user's access returns 404, the same response as for a trip that doesn't exist.
- Safer alternative, considered for later: a database function that takes the user id and enforces access inside SQL. v1 keeps the guard in one server module.

## 4. Trip selection
- Trip-scoped token: `trip_id` may be omitted. If it is supplied and differs from the token's trip, the API returns 403.
- Token without a trip scope: `trip_id` is required (400 if missing). There is no "active trip" guess. The app's active trip lives only in browser storage and is never used.

## 5. Contract (schema_version "1.0")
- `GET /api/public/trip-context` returns `schema_version`, `generated_at` and `trip`, followed by sections.
- Filters: `trip_id`, `date=YYYY-MM-DD` (itinerary only), and `section=itinerary|saved_places|reservations|hotels|expenses|checklist|documents`. `city` filters saved_places and hotels with an exact case-insensitive match. Unknown parameters return 400.
- **Pagination (Option B):** a full response includes only bounded summaries plus the itinerary, which is naturally small. `saved_places` appears in full-trip mode as a count only. Lists are paged only with `section=…`: `limit` up to 200 and an opaque `cursor` encoding (created_at, id). The cursor is signed with a server secret and bound to user, trip, section and filters, so a cursor replayed under different filters or for another trip returns 400. Server reads walk pages of 1,000 internally, so nothing is cut off.
- Headers: `Cache-Control: no-store`. Errors: `{"error":"unauthorized"|"forbidden"|"not_found"|"bad_request"|"rate_limited"|"server_error"}` with no internal details.
- `GET /api/public/openapi.json` publishes an OpenAPI 3.1 document with the bearer scheme, a single GET operation and all of the above.

## 6. Token management (needs a normal sign-in)
- New table `api_tokens`: id, user_id, token_hash (unique), label, trip_id (nullable), created_at, last_used_at, expires_at, revoked_at.
- Access rules: the owner can select and update rows only for their own user_id. Inserts happen only through a signed-in server function that creates the token and returns it once. Token rows never include the hash on the client side.
- A small "AI access" screen opens from the user menu: create (label, optional trip, expiry), copy once, list, revoke. It shows the text: "This token gives read-only access to your Travel Way trip data. It cannot modify your trips."
- The only write on API reads is `last_used_at`, throttled to once per minute.
- Simple rate limit: about 60 requests per minute per token, counted on the token row. Over the limit returns 429.

## 7. Logging and privacy
- The handler never logs headers or tokens. Errors are logged as a code only.
- The project's error capture and app logs (`error-capture`, `server.ts`) were checked: they log errors, not request headers. The hosting layer may record request metadata. Tokens go only in the header, never in URLs, so they don't appear in access logs.

## 8. Separate later phases
- **B. Custom GPT:** import the OpenAPI document, set API-key auth (Bearer), paste the token, and test. Done in ChatGPT, outside the app.
- **C. ChatGPT/Codex through MCP:** the REST endpoint alone isn't an MCP server. A small MCP route (`/api/public/mcp`) would wrap the same read module as tools such as `get_trip_context` and `get_day`. It would run in this app with the same bearer token and be registered in the client's MCP settings. This is optional and planned after v1.

## 9. Testing plan
- Use two dedicated test users, each with a test trip. User A also gets a trip shared with them. Delete everything afterwards.
- Cases: no token or a bad token (401), a revoked token (401), an expired token (401). Token A on trip B returns 404. A trip-scoped token with another trip_id returns 403. A token without scope and without trip_id returns 400. POST, PUT and DELETE return 405. A cursor reused on another trip returns 400. A trip with more than 1,000 saved places pages completely. The response is checked for absence of file_url, entry_pin and share_token. Each test also confirms that no trip data changed.
- TypeScript and the build must keep passing. Existing screens stay unchanged.

## Notes
- The uploaded brief ends at "Suggested setup" in the testing section, so the testing plan above fills in the rest.
- New pieces: one table with a migration, one server-only read module, two public routes, token server functions, and one small screen. No new packages.
