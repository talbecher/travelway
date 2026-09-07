# Phase 1 — Visual foundation only

Implement a constrained visual foundation pass without changing application behavior.

## Scope

### Design tokens
- Update the existing warm light/dark palette in `src/styles.css` while preserving current variable names and CSS-variable representation.
- Add semantic foreground values for success, warning, and destructive surfaces.
- Add semantic entry-type colors for food, attraction, transport, hotel, note, and flight.
- Standardize the global card recipe to 12px radius, token-based border/surface, and theme-appropriate subtle shadow.
- Preserve RTL, light/dark switching, Leaflet styles, and existing legacy aliases.

### Shared components
- Refine the existing shared `Button` variants without changing their names or API: 44px minimum targets, 2px visible focus ring, clear primary/secondary/ghost/destructive hierarchy, and existing disabled behavior.
- Refine shared `Card` styling to use the standardized surface, border, radius, shadow, and denser built-in spacing.
- Refine shared `Input` styling to 44px minimum height, surface background, readable placeholder, and visible focus border/ring.
- Polish the existing `BottomSheet` only within its current structure: surface, handle, 16px RTL title, padding, and single scroll container. No close control or footer will be invented because neither exists in its current public structure.
- Compact `EmptyState` spacing and hierarchy while preserving its illustrations, props, text, and action slot.

### Shared shell and navigation
- Keep all six `BottomNav` tabs, icons, labels, order, routes, and active matching unchanged; update only surface treatment, active/inactive weight, 56px layout, 44px targets, safe-area handling, and an optional non-structural active indicator.
- Update only header classes and the existing main bottom clearance in `src/routes/__root.tsx`: compact height, semantic background/border, 44px icon controls, 20px icons, compact spacing, and truncation-safe layout.
- Preserve every header action and visibility condition, `AuthGate`, trip switching, `Outlet`, FAB, search behavior, and navigation behavior.

### Hardcoded colors
- In `src/routes/index.tsx`, replace entry-type hardcoded colors and success/warning-equivalent colors only where the current value can be swapped directly for a semantic CSS variable without changing structure or behavior.
- In `src/routes/recommendations.tsx`, replace type gradients and foreground/destructive literals only where direct CSS-variable substitution preserves existing gradients and transparency.
- Leave brand-overlay whites, image-overlay alpha values, decorative hero gradient colors, and shadow alpha values unchanged when a semantic substitution would change visual meaning or require structural refactoring; list every intentional exception in the report.

## Explicit exclusions

- No queries, mutations, backend calls, database, business logic, calculations, dates, offline behavior, caching, forms, validation, submission handlers, DnD, maps, Leaflet, or image fallbacks.
- No route/path changes, new screens, tab changes, new menus, new dependencies, `CategoryPill` migration, or replacement of `BottomSheet`.
- No public component API changes and no files outside the user's allowlist.

## Verification

- Inspect the final diff and confirm it contains only allowed files and visual changes.
- Run the available project build command (`bun run build`). Since no dedicated TypeScript script exists, run the repository's compatible TypeScript checker (`bunx tsgo`) if available without installing anything; report it separately from the build.
- Check the live app at 390px in light and dark modes, plus desktop, for overflow, RTL, header/nav/FAB overlap, long labels, touch targets, contrast, and focus visibility.
- Capture mobile screenshots in both themes if the preview can be exercised.
- Report exact files changed, token changes, replaced and intentionally retained literals, exact commands/results, interactions actually exercised, limitations, and any suspicious pre-existing issue without fixing it.