# Project monitoring — 10 findings fix round — done

## Japan location reliability — authorized scoped repair
- [ ] Verify trip and prepare private recoverable before/after manifest; apply only unique verified local-source coordinates conditionally.
- [ ] Audit Nearby and selected-place add-to-day; fix confirmed coordinate defects and test.
- [ ] Verify protected fields/counts, real day map if accessible, report unresolved places and capped external-call plan (no paid calls).

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
