# Preview audit — 2026-11-05

## Creation paths
- RecForm: actual Google selection now retains `provider_place_id`; manual explicit pins have at most one authenticated name+pin match. Existing identity is never replaced by this enrichment. User photos remain separate from transient Google media.
- GlobalFab / Discover: already persist actual selected IDs; unchanged.
- My Maps / KML: current export parser produces names and coordinate-only search URLs, not verified business identity. Atomic import remains unchanged and makes zero Places calls; every imported pin can be reviewed using the bounded report afterward. No identity inferred from placemark IDs, names, coordinates or descriptions. Verified explicit business IDs are not supplied by this parser; support for a future identity-bearing export remains unimplemented rather than fabricating them.
- AI recommendation import: accepts optional explicit coordinate/Maps URL fields; bounded matching (five sequential lookups maximum), no selection from `results[0]`, no Google photo/rating writes. Without an explicit point, recommendation remains unlocated/pin-only. Arbitrary AI-supplied Place IDs are not trusted.
- AI day imports retain their separate existing lookup behavior; itinerary replacement and navigation were deliberately not changed.

## Read-only Japan inventory
Authenticated UI-loaded recommendation rows: **1,158**. Existing business IDs: **5**. Missing business identity: **1,153**. Null/empty photo fields: **388** (additional legacy Google-hosted URLs may require refresh; they were not counted as absent in this inventory).

Kuma Kafe: no business ID, no photo; stored point **34.6555406, 135.4315394**. No search result or confident match claimed.

## Report and apply
Report is explicit, five records per page, sequential requests, UUID cursor, existing IDs reused without search, stops after API failure. Reports survive closing/reopening the sheet during the current page session; not persisted across reload, in accordance with transient Google content handling. Counts and proposed candidate distances are visible. Only confident matches receive signed 30-minute receipts; apply is per-record and rechecks user/trip, receipt integrity and every row field at read and update time. Update payload is only provider + place ID. No bulk apply.

## Verification and limits
- 19 unit tests / 57 assertions: Kuma spelling, wrong-first-result, nearby branches, absent results, pin-only, invalid point, identity-only patch, missing API configuration, review tamper rejection, shared day coordinate rules.
- Authenticated Japan review sheet at 390×852: opens, no overflow, no page errors; zero Maps requests, no mutations.
- Automatic typecheck/build OK.
- Actual Google matching/photo/rating and attribution responses remain unverified: live Maps API tests are unsupported in the agent sandbox. **Actual Places requests: 0**. Candidate classifications will be generated when the user explicitly runs the report on an authorized deployed origin; no synthetic live-result report was substituted.
- Identity apply intentionally not executed against existing user data; transactional compare-and-set source and signed receipt tests checked, live apply remains unverified pending report review.
- Existing standalone `GOOGLE_PLACES_KEY` is reused server-side; no accessible Google Maps connector is linked. New connector settings: https://lovable.dev/connectors/google_maps/connect?workspace=nKK3s915W9AhEBkmDXvK
- No migrations, no live data writes, no publication.