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

# Day screen + map fix round — done

- [x] Compact stop cards (72px thumb, icon-only fallback, 2-line meta, edit + more menu, drag handle only in sort mode)
- [x] Header: relevant hero image selection (no food/document), low panorama in list, compact in map; smaller tabs; fix date/city clipping
- [x] Map: real available-height sizing, no nav/FAB/attribution overlap, segment framing of the 2 endpoints only, stable zoom
- [x] Arrival details: remove air-distance walking estimates, "אפשרויות הגעה" row, cleaned sheet, correct from/to direction
- [x] Routing feasibility research + concrete proposal (separate deliverable)
- [x] Build and TypeScript checks; visual browser checks were explicitly waived

# Active-trip home redesign

- [x] Active-only panoramic opening with today imagery and contextual weather
- [x] Unified “today” card with timed, untimed, empty, missing, loading, and error states
- [x] Compact active-trip actions, nearby places, budget, checklist, and deadlines
- [x] Preserve pre-trip/post-trip behavior and existing handlers
- [x] Build and TypeScript checks

# Active-trip home polish

- [x] Improve active-trip image contrast and show weather only for a reliable day city
- [x] Replace today rows with an RTL itinerary sequence using original full-list numbering
- [x] Compact the empty-day state and active quick actions
- [x] Run TypeScript and build checks

# Destination photo attribution sheet

- [x] Replace the on-image Google credit line with a compact info button
- [x] Show structured Google Maps and photographer attribution in the existing bottom sheet
- [x] Run TypeScript and build checks

# Active home and day location polish

- [x] Add a visible city/area editor below the day header in list and map modes
- [x] Separate the displayed day area, weather city, and destination-photo search location
- [x] Refine active-trip weather and photo-info placement
- [x] Tighten the active today sequence and update remaining-stop copy
- [ ] Run TypeScript and build checks
