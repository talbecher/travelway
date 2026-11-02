# AI checklist proposals + document upload: feasibility and plan

Confirmed project: OpenAPI `servers` is `https://travelway.lovable.app`, with the actions getTripContext and proposeDayReplacement (`src/routes/api/public/openapi[.]json.ts`).

## Current state (checked in code)
- **Tokens:** `api_tokens.scopes`. Read-only tokens have `["read"]`, and tokens that can propose have `["read","propose_day"]` (`src/lib/api-tokens.functions.ts:42`). The `read` scope already returns the checklist and document metadata (`trip-context.server.ts:355-361`; no file links are returned).
- **Day proposals:** `day_replace_proposals` + `_proposal_claim` (DEFINER, locks the row) → `replace_day_entries`. This stays untouched.
- **Document storage (blocker found):** files go to the private `rec-photos` bucket under `documents/<uuid>`. The path does not include the trip. The SELECT policy is `bucket_id='rec-photos'`, so **any signed-in user can read any file** in that bucket, including recommendation photos. The app saves **10-year signed links** into `documents.file_url` and `recommendations.photo_url`. This means the files are not private per trip today. I won't change this old setup without your decision (see Decisions).

## Scopes (no silent expansion)
- New scopes, each trip-scoped and independent: `read_checklist`, `propose_checklist`, `upload_documents`. They are only granted when the token is created, through new checkboxes in `/ai-access`. Old tokens stay exactly as they are.
- `read` keeps returning the checklist exactly as today (for compatibility). `read_checklist` gives a narrow token that can read only the checklist. `propose_checklist` requires `read` or `read_checklist` in the same token, because a proposal needs the current state.

## Part A: checklist proposals
**Migration**
- `checklist_proposals` (id, trip_id, token_id, created_by, ops jsonb, op_count, base jsonb = `{item_id: row_sig}` for targeted items, request_id, status pending|applied|rejected, expires_at 7d, result, decided_at).
  - GRANT SELECT to authenticated only, with RLS `can_access_trip`.
  - No INSERT/UPDATE/DELETE grants. A guard trigger requires the transaction flag `app.in_checklist_proposal`, and the content cannot be changed after creation.
- `api_create_checklist_proposal(_hash, _trip_id, _ops, _note)` (DEFINER, `search_path` fixed, schema-qualified names, EXECUTE to service_role only):
  - checks the token through `api_resolve_token` plus the `propose_checklist` scope and live access to the trip;
  - validates each op: `add` {title, category, priority, due_date, notes}, `update` {id, a subset of fields}, `set_done` {id, is_done};
  - validates the values: priority allowed values, category against the known list (same aliases as the importer), valid ISO due_date, length limits, at most 50 ops, and each id at most once;
  - checks that every `id` belongs to the trip;
  - stores the base signatures and keeps a quota of 20 pending per trip.
- `apply_checklist_proposal(_id, _seen_base_hash, _accept_duplicates text[])`: **SECURITY DEFINER** after explicit checks.
  - Session check, `FOR UPDATE` on the proposal, `can_access_trip`, not expired, token still valid, pending, `_seen_base_hash` = stored.
  - Locks the targeted rows and compares the current row_sig with the base; if different, returns `conflict` with the item ids.
  - Duplicate check: an `add` whose title (normalized) matches an existing or another new item is blocked unless its index is in `_accept_duplicates`.
  - In one transaction it applies only the targeted ids, adds the new items, and sets status=applied with the result. A retry after applied returns `already_applied` (idempotency through the locked proposal row and its status). Untargeted tasks are never touched.
  - It is DEFINER on purpose: this avoids the INVOKER-without-grant problem, and the proposals table stays without client write grants.
- `reject_checklist_proposal`, `get_checklist_proposal_view` (DEFINER, same checks).

**Code**
- `src/lib/checklist-proposals.server.ts`: shape checks (zod), error mapping.
- `src/routes/api/public/checklist-proposals.ts`: POST, Bearer, returns `review_url`.
- `src/routes/checklist-proposals.$id.tsx`: before/after per item, conflict and duplicate badges, an "add anyway" checkbox, approve/reject.
- `trip-context`: accept `read_checklist` only for `section=checklist`.

## Part B: document upload
**Decisions before building (storage is shared today):**
1. Create a new private bucket, `trip-docs`, with trip-scoped paths `<trip_id>/...`. Storage SELECT/INSERT would be allowed only through `can_access_trip` on the first folder, plus a `staging/<proposal_id>` area written only by the server. Old files stay in `rec-photos` unchanged, with their existing links still working.
2. Add the column `documents.file_path` (nullable). When it is set, the app creates a short signed link (5 min) through an authenticated server function and does not store the link.

**Flow (ChatGPT file sending)**
1. POST `/api/public/document-proposals` with `openaiFileIdRefs` (accepted as objects or strings) and metadata: title, type, valid_date, description, linked_recommendation_id, replace_document_id?.
2. The server checks the token and the `upload_documents` scope **before any download**.
3. **Immediate download** (the links are valid for about 5 minutes):
   - Allow `https` only, with an exact host allow-list taken from the observed GPT runtime host (to be confirmed in a real test; I won't guess with wildcards).
   - Handle redirects manually (at most 2), checking the host again on each one.
   - No cookies or Authorization header are sent.
   - Limits: 10MB, a 15s timeout, and 3 files per proposal.
   - Workers cannot resolve DNS or pin an IP. The SSRF defense therefore relies on the exact host allow-list, https-only and redirect checks. The Cloudflare runtime does not reach a private network. I will state this limitation plainly.
4. Validate the actual file bytes: PDF `%PDF-` plus a light structure check (`%%EOF`/xref), PNG/JPEG/WebP magic plus a dimension header read. The filename and the stated file type are ignored for deciding the type. **There is no malware scanning**, and I won't say there is.
5. Upload to `trip-docs/staging/<proposal_id>/<n>` with the service role. Then the `api_create_document_proposal` RPC stores the metadata, the sha256 of each file, expiry after 24h, and a quota (10 pending per trip, 50MB staged).
   - If the upload or RPC fails, the staged objects are deleted right away.
   - Retry protection: the same sha256 + metadata within 10 minutes returns the existing proposal.
6. Approval at `/document-proposals/$id`, with a preview through a short signed link. `apply_document_proposal` (DEFINER, same lock and live checks):
   - copies staging into `<trip_id>/<doc_id>/<sha>`;
   - inserts the document or updates `file_path` on the replaced document. The previous file stays, and nothing is deleted automatically;
   - re-checks that the recommendation link belongs to the same trip (the existing trigger).
   - Storage copy is not part of the transaction, so the order is copy → DB transaction → on DB failure delete the copy. Staging is kept until applied.
7. Cleanup: a scheduled route (`/api/public/cron/staging-cleanup`, with a secret header) deletes expired staging every hour.
8. **Fallback:** if a real GPT test shows the file refs don't arrive or the host is not stable, the action returns an `upload_url` to an authenticated upload page in the app, and I will report that.

## Not changed
`replace_day_entries`, day proposal permissions, itinerary or money writes, the existing `rec-photos` policies and links, and the behavior of existing tokens and actions. OpenAPI only gets additions: `proposeChecklistChanges`, `proposeDocumentUpload`, with explicit `properties` everywhere.

## Testing
- **Runtime checks on a temporary test trip, deleted afterwards:**
  - scopes, including an old token rejected for the new actions;
  - removing a shared user / revoking a token between proposal and approval;
  - conflicts, idempotency, duplicates plus manual override;
  - direct REST attempts to forge proposals (blocked);
  - rollback;
  - file signature rejects (wrong file renamed .pdf, oversize);
  - reading another trip's file as another user (blocked);
  - expired staging cleanup;
  - regression of getTripContext/proposeDayReplacement.
- Then tsgo and the build.
- **GPT end-to-end** (a real Action sending a file) only with your manual test. Until then the file part is code-only for that path.

## Open decisions / blockers
1. Approve the new `trip-docs` bucket and leave the `rec-photos` leak as-is for now? (Fixing it means moving existing files and links, which is a separate task.)
2. The exact GPT file host is unknown until one real call is logged. Until then the file download stays off and the fallback upload link is used.
3. Scheduled cleanup needs a cron trigger (pg_cron + pg_net calling the route). If that's not available, cleanup runs whenever a new proposal is created.
