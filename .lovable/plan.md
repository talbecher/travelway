
## Goal

Transform the itinerary day list into expandable cards with a visual timeline inside each card. Users see day-at-a-glance summaries, expand for a full vertical timeline with hotel morning/night slots and drag-to-reorder — without leaving the list screen.

## Scope

- Only `src/routes/itinerary.index.tsx` is modified. (The user said `itinerary.tsx`; that's the layout — the actual list lives at `itinerary.index.tsx`. No other files touched.)
- No changes to `/itinerary/$dayId`, DB schema, or other screens.
- Day-detail route remains the "full edit" destination.

## Behaviour

### Collapsed state (default for days with entries)
- Existing chrome: day number, date, city label, colored right border by city.
- Replace the existing icon-chip strip with a **summary line** built exactly per user's `summarize()` spec:
  - `🏨 <hotel_checkin.title>` if any
  - `⛩ N אטרקציות` if any attractions
  - `🍜 N ארוחות` if any food
  - `🚆 תחבורה` if any transport
  - joined with ` · `, falls back to `לחץ להוספה`
- Keep the small emoji chip strip below the summary (order-preserving).
- Tap card header → expand.

### Empty days
- Show existing `לא תוכנן עדיין — לחץ להוספה` in muted text.
- No expand behaviour — tap navigates directly to `/itinerary/$dayId` (current behaviour).

### Expanded state
Vertical timeline inside the card:

```text
● 🏨 יציאה בבוקר — <hotel from previous night>
│ → 1.2 ק״מ · 🚶 🚌 🚗
⋮⋮ ● 09:30  ⛩  Fushimi Inari
│              Kyoto
│ → 3.4 ק״מ · 🚶 🚌 🚗
⋮⋮ ● 13:00  🍜  Ramen shop
│              Gion district
● 🏨 לילה — <this day's hotel_checkin>

              [✏️ עריכה מלאה]
```

Rules:
- **Timeline rail:** 2px vertical line in `var(--border)`, absolute-positioned behind the nodes.
- **Node:** colored dot (by `TYPE_COLOR`), optional `start_time`, emoji, title, `location_name` subtitle.
- **Hotel slots (auto-derived, not stored):**
  - Top: if this day has a `hotel_checkin`, render `🏨 יציאה בבוקר — <hotel name>`. Otherwise fall back to the **previous day's** `hotel_checkin` if present.
  - Bottom: if this day has a `hotel_checkin`, render `🏨 לילה — <hotel name>`.
  - Same hotel top+bottom is fine — it visually bookends the day.
  - `hotel_checkin` entries are **hidden** from the middle of the timeline so they don't render twice.
- **Segment connector between two adjacent middle nodes with coords:** distance via `haversine` from `@/lib/geo` + three deep-link buttons that open Google Maps with `travelmode=walking|transit|driving` between the two `latlng` pairs. Skipped when either side is missing coords.
- **Drag & reorder:** middle (non-hotel) entries only. Uses `@dnd-kit/core` + `@dnd-kit/sortable` (already in the project) inline in this file. On drag end, updates `display_order` on the affected rows via `supabase.from("day_entries").update(...)`, then invalidates `["day-entries-summary"]` and `["day-entries", dayId]`.
- **`✏️ עריכה מלאה` button** at the bottom → navigates to `/itinerary/$dayId`.
- Tap header again → collapses.

### Animation
- `framer-motion` `AnimatePresence` + `motion.div` animating `height: 0 → "auto"`, `opacity 0 → 1`, `overflow: hidden`, duration `0.2s ease`.

### Default expansion
- Days with entries → collapsed.
- Empty days → non-expandable placeholder.
- Today's date (if within trip window) → auto-expanded on mount.

## Data

- The existing `day-entries-summary` query is extended to also select the columns needed by the timeline:
  `id, day_id, entry_type, icon_emoji, title, location_name, latitude, longitude, start_time, display_order`
  (still scoped by `itinerary_days.trip_id = TRIP_ID` via the inner join).
- No new query keys, no new tables. Existing consumers of the summary map still work because they read a subset of these columns.

## Technical notes (for the implementer)

- File edited: `src/routes/itinerary.index.tsx` only.
- New local helpers defined in that file: `summarize()`, `SegmentConnector`, `TimelineNode`, `SortableTimelineNode`, `DayTimeline`, `mapsDeepLink(from, to, mode)`.
- New imports in that file:
  - `framer-motion`: `AnimatePresence`, `motion`
  - `@dnd-kit/core`: `DndContext`, `closestCenter`, `PointerSensor`, `useSensor`, `useSensors`, `DragEndEvent`
  - `@dnd-kit/sortable`: `SortableContext`, `verticalListSortingStrategy`, `useSortable`, `arrayMove`
  - `@dnd-kit/utilities`: `CSS`
  - `@/lib/geo`: `haversine`, `fmtDistance`
  - `lucide-react`: `GripVertical`, `Footprints`, `Bus`, `Car` (or emoji only — no import needed)
- Card container becomes a controlled `expanded` state keyed by `dayId`. Multiple days can be expanded at once.
- Reorder mutation writes only the middle (non-hotel) rows' new `display_order`; hotel rows keep their original order.

## Out of scope

- Editing entry fields inline.
- Adding new entries from the list.
- Any changes to hotels, expenses, or day-detail logic.
