## Scope
Style-only changes across 3 files. Zero logic edits (mutations, DnD, PlacesSearch, SegmentConnector URL building, routing, forms — untouched).

## 1. Hide global expense FAB on `/itinerary/$dayId`
File: `src/components/GlobalFab.tsx`
- Add at top of `GlobalFab()`:
  ```
  const pathname = useRouterState({ select: s => s.location.pathname });
  const onDayDetail = pathname.startsWith("/itinerary/") && pathname !== "/itinerary";
  if (onDayDetail) return null;
  ```
- Import `useRouterState` from `@tanstack/react-router`.
- (`__root.tsx` unchanged.)

## 2. "Add from favourites" FAB — pill with label
File: `src/routes/itinerary.$dayId.tsx` (~line 413)
- Replace the circular `+` button with a pill:
  - Content: `⭐ הוסף ממועדפים`
  - Classes: `fixed bottom-[80px] right-4 z-40 h-11 px-4 rounded-full bg-[color:var(--accent)] text-white shadow-md flex items-center gap-2 text-sm font-semibold`
  - Same `onClick={openPicker}`.

## 3. Journal timeline layout
File: `src/routes/itinerary.$dayId.tsx` — restyle `SortableEntry` (605-720) and its wrapper loop (382-410).

New row structure (RTL, per entry):
```text
┌───────── row (flex, dir=rtl) ─────────┐
│ [Rail 72px]         │ [Card flex-1]   │
│   HH:MM (13/600)    │  title  [photo] │
│   ● dot 10px        │  📍 location    │
│   │  dashed         │  לפרטים ›       │
└───────────────────────────────────────┘
```

Rail (right, RTL start): fixed `w-[72px] shrink-0 flex flex-col items-center pt-1`
- Time text (or `—` placeholder) `text-[13px] font-semibold text-foreground` (LTR span).
- Colored dot `w-2.5 h-2.5 rounded-full mt-1.5` using existing `TYPE_PIN_COLOR` map (fallback muted).
- Absolute-positioned vertical dashed line behind the dot column: `border-r-2 border-dashed border-[color:var(--border-strong)]` spanning full row height, drawn via a sibling absolute div in each entry row (top:0 bottom:-16px so it visually joins to next card). Alternatively use `background-image: repeating-linear-gradient` on the rail column.

Card (left, flex-1):
- `bg-card border border-border rounded-[12px] p-3 shadow-sm` (shadow-sm var).
- Row: title block flex-1 min-w-0, photo 64×64 `rounded-lg object-cover` on LTR-end (RTL end = left).
- Title `.entry-title text-[15px] font-semibold` (line-clamp-2, break-word).
- Location `.entry-subtitle text-[12px] text-muted-foreground` with `📍 ` prefix.
- Bottom-left: tappable `לפרטים ›` `text-[12px] text-[color:var(--accent)]` → `onClick={onOpenActions}` (opens existing ⋯ sheet).
- Remove: internal time pill, drag handle chip visual, ⋯ button. DnD listeners move to the whole card wrapper (`{...attributes} {...listeners}` on the card container). Actions still reachable via `לפרטים ›`.
- Keep highlight `motion.div` shadow ring behavior.

Loop container (382-410):
- `px-4 pt-3 pb-[160px]`
- Wrap entries in `flex flex-col gap-4`.
- Between cards render `SegmentConnector` when both coords present; simplified styling (see §5).

## 4. Text overflow utility classes
File: `src/styles.css` — append near other utilities:
```
.entry-title{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word;}
.entry-subtitle{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
```
Apply to card title/subtitle in `SortableEntry`. (Description keeps existing `line-clamp-2`.)

## 5. Segment connector — simplify
File: `src/routes/itinerary.$dayId.tsx` (~557-601)
- Drop the surrounding `mr-14`/vertical bar decorations.
- Container: `pl-[72px] pr-1 my-1 flex items-center gap-2` (padding aligns with card's left edge; RTL: the 72px offset stays on the rail side).
  Since parent is RTL, use `ps-[72px]` equivalent: `style={{ paddingInlineStart: 72 }}`.
- Distance text: `text-[12px] text-muted-foreground`.
- 2 pill buttons unchanged in URL/logic; strip vertical bar divs (`w-0.5 h-3 bg-border`).

## 6. Untouched
Handlers, mutations, DnD data flow, `DayMap`, `PlacesSearch`, `SegmentConnector` URL, routing, `EntryForm`, sticky quick-search bar, hero header, bottom sheets.

## Files touched
- `src/components/GlobalFab.tsx` — early return on day detail route.
- `src/routes/itinerary.$dayId.tsx` — FAB pill, `SortableEntry` redesign, list container spacing, `SegmentConnector` styling.
- `src/styles.css` — 2 utility classes.
