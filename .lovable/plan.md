
## Home screen redesign (`src/routes/index.tsx`) + header cleanup (`src/routes/__root.tsx`)

Mobile-first, RTL, dark theme, framer-motion staggered fade-in (0.1s per section). Page padding `px-4 pt-4 pb-24`, `gap-4` between sections. Any section with no data is hidden — no empty cards.

### Section 1 — Hero (always shown)
- Full-width 160px card, `rounded-2xl`, gradient background `linear-gradient(135deg,#1a1a2e,#16213e 50%,#0f3460)`.
- Row 1: trip title (28px bold, white) + flag emoji derived from destination string (small country→flag map: יפן🇯🇵, צרפת🇫🇷, איטליה🇮🇹, ספרד🇪🇸, יוון🇬🇷, ארה״ב🇺🇸, תאילנד🇹🇭, בריטניה🇬🇧, גרמניה🇩🇪).
- Row 2: dates `start → end` (formatted), muted white.
- Row 3: status pill — `"עוד X ימים"` (amber) / `"יום X מתוך Y"` (green, pulsing dot) / `"הסתיים"` (muted).
- Bottom-right: 56px circular ring (reused `BudgetRing`, extracted into a small `ProgressRing` shared component in-file) showing `daysPassed/daysTotal`.

### Section 2 — Today snapshot (only if today ∈ trip range)
- Find `itinerary_day` where `date === todayISO()`.
- Header: `היום — יום N · city_label`.
- List up to 4 entries (emoji + title + optional time), `+X נוספים` if more.
- Empty: `היום ריק — רוצה לתכנן?` + button.
- CTA button → `/itinerary/$dayId`.

### Section 3 — Next planned day (only if today < trip.start_date)
- Find first future day with ≥1 entry.
- Header: `היום הבא המתוכנן — יום N` + formatted date.
- Up to 3 entry previews.
- Tap → `/itinerary/$dayId`.

### Section 4 — Budget snapshot (always if trip exists)
- Standard `bg-card` surface, no gradient.
- Left: 80px donut ring. Right column: `נשאר` label + amount (large), two small stats below (`הוצאנו`, `ליום`).

### Section 5 — Quick stats row
- Horizontal chips (wrap allowed): `📍 X מקומות שמורים` → `/recommendations`, `✅ X ביקרנו` → `/recommendations?status=visited`, `📅 X ימים מתוכננים` → `/itinerary`.
- Style: `bg-[color:var(--surface-2)] rounded-full px-3 py-1.5 text-xs`.
- Data: counts from existing `useRecs()` + `useDays()` (planned = days with entries — batch via `useQueries` over `dayEntriesQuery`).

### Section 6 — Quick actions (2×2 grid)
- Buttons (80px tall, `rounded-xl bg-card border`, icon top / label bottom):
  - 📅 מסלול הטיול → `/itinerary`
  - ⭐ המלצות → `/recommendations`
  - 💰 תקציב → `/budget`
  - ➕ הוצאה מהירה → opens `GlobalFab` sheet directly
- To share the sheet: lift the sheet open-state into a lightweight context (`GlobalFabContext`) exposed by `GlobalFab` (mounted in `__root.tsx`) with an `openQuickExpense()` method, consumed by the home tile. No behavior change to the floating button.

### Section 7 — Hotel alerts (only if any deadline ≤ 7 days)
- Keep existing alert card list. Section title above: `⚠️ דדליינים קרובים`.

### Header cleanup (`src/routes/__root.tsx`)
- Left: `SwitchTripButton` (existing).
- Right: `TripSettingsLink` (gear) + `ConverterPill`.
- Remove from header: `HeaderTitle`, `ThemeToggle`, `ShareTripButton`.
- Keep `SignOutButton` where it is (not covered by request → leave untouched to stay in scope).
- Move `ThemeToggle` and `ShareTripButton` into the trip edit page (`src/routes/onboarding.tsx` in edit mode) — that page is what the gear currently opens and serves as the current "settings" surface. *(Flag: if you'd rather these live somewhere else, tell me before build.)*

### Files touched
- `src/routes/index.tsx` — full rewrite.
- `src/routes/__root.tsx` — header slimming + mounting a `GlobalFabProvider` around `AppShell` so the home quick-action can open the sheet.
- `src/components/GlobalFab.tsx` — expose an `openQuickExpense()` via context (small addition, no visual change).
- `src/routes/onboarding.tsx` — add Theme + Share controls when `edit=true`.

### Technical notes
- Reuse `todayISO`, `daysBetween`, `ils` from `src/lib/format.ts`.
- Days-planned count uses `useQueries` on all `days` with `dayEntriesQuery(day.id)`; light because entries are already cached when the user has visited the itinerary, and cheap otherwise.
- Ring component extracted once, used at 56px (hero) and 80px (budget) via a `size` prop.
- All colors via existing tokens (`--surface`, `--card`, `--border`, `--accent`, `--accent-2`, `--muted-foreground`); the hero gradient is the only hardcoded palette (explicitly requested).
