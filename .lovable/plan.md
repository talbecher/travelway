## Phase 1 — Design system overhaul (styles + theme default + login illustration)

Touch only these files:
- `src/styles.css` — full token replacement + typography + card/button/nav recipes
- `src/hooks/use-theme.ts` — default `light`
- `src/routes/__root.tsx` — inline theme-init script default `light`
- `src/components/SignInScreen.tsx` — replace torii + haiku (the torii lives here, not in `AuthGate.tsx` which has no illustration)
- `src/lib/destination-theme.ts` — new file (per spec §6)

No other files touched. No changes to queries, mutations, routing, forms, maps, charts.

### Note on scope
Your brief says "touch only styles.css / use-theme.ts / __root.tsx", but §6 requires a new file (`destination-theme.ts`) and §7 requires editing the login screen. The torii SVG + haiku live in `SignInScreen.tsx`, not `__root.tsx` or `AuthGate.tsx`. I'll edit `SignInScreen.tsx` (style-only: swap SVG + text) and add `destination-theme.ts`. Nothing else. Say the word if you'd rather skip §6/§7 and keep the file list literal.

### 1. `src/styles.css`
- Replace the `:root` block with the light-mode palette from the spec (background `#FAF7F2`, surface `#FFFFFF`, accent `#E8614D`, etc.) and add `--shadow-sm`, `--shadow-md`, `--radius`, `--radius-sm`, `--radius-lg`.
- Replace `.light` block with `.dark` using the dark palette from the spec (background `#1A1614`, etc.). Flip the theme switch so **light is the default** and `.dark` opts in.
- Keep `@theme inline` token→CSS-var bridge (needed for Tailwind utility generation). Add `--color-border-strong`, remove now-unused aliases (`--accent-1`, `--accent-4`, `--terracotta*`, `--paper`, `--ink*`) — legacy class names in components use `var(--terracotta)` etc., so keep those aliases pointing at `--accent` to avoid touching component files.
- Keep chart tokens exactly per spec (`#E8614D`, `#6C63FF`, `#10B981`, `#F59E0B`, `#A8E6CF`, `#A8A09A`).
- Update `@layer base` typography: `h1` 28px/700/-0.5px, `h2` 20px/600, `h3` 17px/600; keep body 15px/1.6 antialiased.
- Add global card recipe via attribute/class selector: `.card, [data-card] { background: var(--card); border-radius: var(--radius); border: 1px solid var(--border); box-shadow: var(--shadow-sm); overflow: hidden; }`.
- Add bottom-nav recipe (light/dark variants with translucent bg + `backdrop-filter: blur(20px)`) targeting the existing `<nav>` in `BottomNav.tsx` via a scoped selector (`nav[aria-label], .app-bottom-nav`) — no component edits, use attribute selectors already present.
- Add button recipes as `@utility btn-primary / btn-secondary / btn-ghost` so future work can adopt them without breaking current classNames.
- Flip `.dark` selector variant: `@custom-variant dark (&:is(.dark, .dark *))`. Update `html { color-scheme: light }` and `html.dark { color-scheme: dark }`.

### 2. `src/hooks/use-theme.ts`
- `readInitial()` returns `"light"` when nothing stored.
- `apply()` toggles `.dark` class on `<html>` (was `.light`).
- `toggle()` unchanged in behavior.

### 3. `src/routes/__root.tsx`
- Update the inline pre-hydration `THEME_INIT` script:
  `var t=localStorage.getItem('theme'); if(t==='dark') document.documentElement.classList.add('dark');`
- No other edits.

### 4. `src/components/SignInScreen.tsx`
- Remove `ToriiSvg` component + its usage.
- Add a minimal `TravelSvg` (suitcase + airplane, `currentColor`, 80px, `text-[color:var(--accent)]`).
- Replace haiku `<p>` with two lines: `תכנן. חווה. זכור.` (h2-ish) + `הכל במקום אחד` (muted subtitle).
- Keep Google button + PIN flow untouched.

### 5. `src/lib/destination-theme.ts` (new)
Exact export from spec §6: `getDestinationTheme(destination)` returning `{ emoji, heroGradient, accentColor, patternEmoji }` for JP/FR/IT/TH/ES/GR/IL + default. Pure function, no imports. Not yet wired anywhere — Phase 2/3 will consume it.

### Verification
- `bun run build` passes.
- Preview: light mode renders by default, dark opts in via toggle, bottom nav is translucent, cards are flat with subtle shadow, login shows generic travel SVG + Hebrew tagline.
- No component file besides `SignInScreen.tsx` is modified; no query/route/mutation touched.
