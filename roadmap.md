# Project monitoring — 10 findings fix round — done

## Japan location reliability — authorized scoped repair
- [x] Verified Japan trip; backed up and applied 66 coordinate-only local-source repairs in two targeted transactions. Protected fields and all rec/hotel/day rows unchanged.
- [x] Shared resolver for Nearby GPS/distance, recommendation add/save and linked hotel display; selected Google place retains coords and identity. 22 tests passed, 264 assertions; automatic build OK.
- [x] Real signed-in day 3 list/map and 390px arrival sheet checked; three restored attraction pins visible plus hotel cluster. GPS unavailable state checked. Physical-device GPS and Google live lookups not tested.
- [ ] Remaining 69 stops / 63 destination strings: 42 named candidates need approved paid lookups (cap 42, batches of 10), 21 broad/alternate endpoints need an exact destination. Full grouped list in private repair report and user Files.

- [x] 1. Rec photos: saved photos (incl. Google) shown again; edit no longer nulls photo_url or wipes linked day stops
- [x] 2. MarkBookedSheet moved outside the clickable card — no more Maps tab on sheet taps
- [x] 3. AuthGate preserves the session, selected trip and cache on failed trip reads; actual session changes remain owned by useAuth.
- [x] 4. ImportAISheet mode switch preserves manual unchecks; only new duplicates default off
- [x] 5. DiscoverCard re-queues photo after loader reset while still near viewport
- [x] 6. Weather chip city span now inline-block so truncate/max-w apply
- [x] 7. Home pending gates include version loading — no more false "no day today" flash
- [x] 8. STALE — PlanNextCard already uses direction-agnostic scrollBy (resolved stale)
- [x] 9. todayISO→todayLocal at all remaining call sites (deadlines, weather, quick expense, HayinuKan, booking chip, hotel card)
- [x] 10. Route optimizer extracted to src/lib/day-route-order.ts; no-coords/timed entries keep original slots; 4 new tests
- [x] 54 bun tests pass, typecheck clean, build OK. No publish.

## Offline / weak-connection AuthGate regression
- [x] Confirm and remove sign-out on trip-query errors; transition to ready without clearing saved data.
- [x] Five focused regression tests pass (23 assertions); authenticated Japan preview survives an aborted trip-list read with session/selection preserved, zero logout requests, and home + itinerary visible. Build OK; no publication. Fully offline published startup not checked (preview service worker is disabled).

## Japan location follow-up (Nov 8)
- [x] Apply 9 approved same-trip coordinate fills (coords only; backup/rollback in private 20261108 folder).
- [x] AI import: stops no longer auto-assigned to first Google result; recommendation matching kept; checkbox text updated.
- [x] Classify 70 remaining missing stops (exact / area / transport) — report only.
- [ ] Paid lookup for exact-named group — waits on user approval of cap.

- [x] Chat day proposals keep locations (explicit pair/Maps URL or exact title+location_name match), with source shown on review

## UX fixes: proposal missing locations + document file in edit (Nov 8)
- [x] revise_day_proposal_locations RPC + guard location-only exception (migrations 0009/0010); review screen: clickable missing banner, saved-place picker sheet, explicit leave-without-location
- [x] Document edit shows attached file (name/type/size, פתח/החלף/הסר with confirm); private detach via detach_document_file RPC (migration 0011); no physical delete
- [x] E2E on temp trip (created + deleted): pick→save→approve→coords verified in day entries; doc detach verified; 390px no overflow; 29 bun tests, tsgo clean. No publish.
