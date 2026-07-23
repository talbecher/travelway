The "Export to AI" feature doesn't exist yet — neither `src/lib/export-to-ai.ts` nor any export UI in `src/routes/itinerary.index.tsx`. This plan **creates** the feature per spec (the phrasing "update" is treated as "create/replace").

## 1. New file: `src/lib/export-to-ai.ts`

Export `generateAIPrompt(tripId)` that loads:
- Trip (destination, num travelers, start/end, total budget)
- Days (day_number, date, city_label)
- Day entries (title, time_of_day, icon_emoji, location_name, notes, linked_recommendation_id, display_order)
- Recommendations joined for notes fallback
- Hotels: derived from day entries with `entry_type = "hotel_checkin"` grouped by linked_recommendation_id (checkin/checkout dates, nights). Cost from `recommendations` if present.
- Expenses sum for `spent`; `remaining = total_budget - spent`

Builds the Hebrew prompt from the exact template in the request (destination, travelers, days, budget, itinerary grouped by day with city label, hotels, analysis prompt, summary request).

Formatting details:
- Group entries per day sorted by `display_order`
- `time_of_day` padded to 5 chars, else 5 spaces
- Notes truncated to 80 chars via helper
- Empty days → "(יום ריק — לא תוכנן עדיין)"
- Blank line between days

Returns:
```ts
{ prompt: string,
  stats: { totalDays, entryCount, emptyDays, hotelCount, charCount } }
```

## 2. `src/routes/itinerary.index.tsx` — Export BottomSheet

Add an "ייצא ל-AI" trigger button in the page header (next to the days summary), and a `BottomSheet` state controlling it. Lazy-compute the prompt via `useQuery` keyed on tripId, only when the sheet opens.

Sheet content per spec:
- Header title "🤖 ייצא מסלול ל-AI" + muted subtitle
- Stats row: 3 pills (`bg-surface-2`) — days / entries / hotels
- Preview label + `max-h-[35vh]` scrollable box, `font-mono text-[12px]`, `bg-surface-2 rounded-xl p-3`, dir="rtl", first 30 lines with bottom gradient fade
- Below preview: "{chars} תווים — {tokens} טוקנים בערך" (tokens ≈ chars/4)
- Actions (vertical, full width):
  - Copy full prompt → toast/inline "✅ הועתק! כעת הדבק בכלי AI" for 3s (accent bg, h-48)
  - Open ChatGPT (h-44, border) → `https://chatgpt.com/?q=` + `encodeURIComponent(prompt.slice(0,2000) + "\n\n[המשך מלא הועתק ללוח - הדבק בצ'אט]")`; also copies full prompt to clipboard first
  - Open Claude (h-44, border) → opens `https://claude.ai/new`; copies full prompt first
- Tip box (`bg-accent/10 border border-accent/20 rounded-xl p-3 text-[12px]`) with the provided Hebrew tip text

No DB/schema changes. No changes to existing features.

## Technical

- Reuse existing `supabase` client, `useActiveTripId`, `BottomSheet`.
- All queries are read-only via existing RLS.
- `hebDateLong` from `@/lib/format` for weekday+date in itinerary lines.
- No new deps.
