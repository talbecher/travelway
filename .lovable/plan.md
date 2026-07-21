# Phrasebook (שיחון) — new tab

Add a static phrasebook screen with per-language phrases, TTS via Web Speech API, category filter, and search. Language auto-detected from the active trip's `destination_country`.

## New files

### `src/lib/phrases.ts`
- Export `Phrase` type: `{ id, category, hebrew, transliteration, native }`.
- Export `CATEGORIES` = `["נימוסים","מסעדה","תחבורה","קניות","מלון","חירום"]`.
- Export `LANGUAGES` map keyed by code: `{ code, hebrewName, flag, bcp47 }` for `ja`, `fr`, `it`, `es`, `th`, `el`, `en`.
- Export `PHRASES: Record<LangCode, Phrase[]>`:
  - Japanese: full spec content (8+ per category as provided).
  - French / Italian / Spanish / Thai / Greek: ≥5 per category, native script appropriate to each.
  - English: fallback set (≥5 per category).
- Export `detectLanguage(destinationCountry: string | null | undefined): LangCode` — mirrors `getDestinationTheme` matching (Hebrew + English keywords per country), default `en`.

### `src/routes/phrasebook.tsx`
- `createFileRoute("/phrasebook")` with `head()` setting title/description "שיחון".
- Component:
  - Read active trip via `useActiveTripId()` + existing `useTrip()` hook (see `src/hooks/use-trip.ts`) to get `destination_country`.
  - `const lang = detectLanguage(trip?.destination_country)`.
  - Header: title "שיחון", subtitle = `LANGUAGES[lang].hebrewName`, flag emoji.
  - Horizontal scroll category pills styled like existing city-chip strip in itinerary (surface bg + border-bottom, active pill uses `--accent`).
  - Search input "חפש ביטוי..." — filters all categories across `hebrew`, `transliteration`, `native` (case-insensitive). When search is non-empty, ignore category filter.
  - Phrase list: cards per spec (Hebrew right 16px/600, 🔊 top-left 36×36, transliteration 13px italic muted, native 15px `var(--accent)`, badge row with `[עברית] [תעתיק] [מקור]`).
  - `speak(phrase)`: use `SpeechSynthesisUtterance`, set `.lang = LANGUAGES[lang].bcp47`, `speechSynthesis.cancel()` before speak. Track `speakingId` state via `onstart` / `onend` / `onerror` to drive a pulse animation on the active 🔊 icon (Tailwind `animate-pulse`).
  - Guard TTS with `typeof window !== "undefined" && "speechSynthesis" in window`; hide button otherwise.
  - Container has `pb-[96px]` so BottomNav doesn't cover last card.
- No data fetching, no DB, no auth changes.

## Edited files

### `src/components/BottomNav.tsx`
- Add 5th tab `{ to: "/phrasebook", icon: MessagesSquare, label: "שיחון" }` at the start (so RTL visual order matches spec: שיחון | המלצות | תקציב | מסלול | בית).
- Grid: `grid-cols-5`.
- Icon size `20`, label text `text-[10px]`.

### `src/routes/index.tsx`
- In the existing quick-actions 2×2 grid, expand to a 2-column × 3-row grid (`grid-cols-2` with 6 items) adding:
  - `🗣 שיחון` → `/phrasebook`
  - `📄 מסמכים` placeholder tile (disabled / no navigation, muted styling).
- Preserve existing tiles (מסלול, המלצות, תקציב, הוצאה מהירה) and their handlers.

## Non-goals
- No DB migration, no auth changes, no changes to other routes or global FAB behavior.
- Badge row is display-only for now (no toggle logic).
