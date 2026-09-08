# Phase 1B — done

- [x] Image onError/onLoad handlers (7 imgs: recs card, day-entry card/header/details, lodging picker, Live Now, Nearby)
- [x] todayLocal() in format.ts; swapped in useTripIsActive + index.tsx (stats, todayDay, nextDay)
- [x] Remaining todayISO() sites inspected — intentionally unchanged
- [x] Build passed; broken-image runtime-verified; TZ contexts spot-checked

# Pre-trip home visual upgrade

- [x] Destination-focused opening image with local fallback
- [x] Day selector with stable manual selection and horizontal-only reveal
- [x] Saved-places preview from the active trip's existing records
- [x] Secondary preparation, budget, and tools presentation
- [x] Build, type check, browser verification, and screenshots

# Day screen + map fix round (in progress)

- [ ] Compact stop cards (72px thumb, icon-only fallback, 2-line meta, edit + more menu, drag handle only in sort mode)
- [ ] Header: relevant hero image selection (no food/document), low panorama in list, compact in map; smaller tabs; fix date/city clipping
- [ ] Map: real available-height sizing, no nav/FAB/attribution overlap, segment framing of the 2 endpoints only, stable zoom
- [ ] Arrival details: remove air-distance walking estimates, "אפשרויות הגעה" row, cleaned sheet, correct from/to direction
- [ ] Routing feasibility research + concrete proposal (separate deliverable)
- [ ] build + tsgo + browser screenshots (light/dark, 360/390/desktop)
