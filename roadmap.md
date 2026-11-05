# Project monitoring — 10 findings fix round

- [ ] 1. Rec photos: stop hiding saved Google photos; stop nulling photo_url on edit (+ day_entries sync)
- [ ] 2. MarkBookedSheet bubbles to card's Maps link — move sheet outside cardInner
- [ ] 3. Expired session → blank app: handle TOKEN_REFRESH_FAILED + AuthGate query error → sign out
- [ ] 4. ImportAISheet switchMode resets manual unchecks — preserve selection across mode switch
- [ ] 5. Discover photos vanish on repeat search — re-request after loader reset for visible cards
- [ ] 6. Weather chip city name overflows — inline-block for truncate span
- [ ] 7. Active home flashes "no day today" — include version loading in pending gate
- [ ] 8. PlanNextCard RTL scroll — STALE (already scrollBy/getBoundingClientRect); resolve stale
- [ ] 9. todayISO UTC leftovers → todayLocal: index 652/1197, GlobalFab, HayinuKanSheet, recommendations 1196/1677
- [ ] 10. Fix-route-order scrambles day: keep no-coords and timed entries at original positions
- [ ] Tests + tsgo + build; resolve findings
