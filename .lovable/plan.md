## Fix LodgingPicker when selected hotel dates don't cover the current day

Scope: `src/routes/itinerary.$dayId.tsx` only. No DB / schema / sync-logic changes.

### Change in `HotelEntrySection` (around lines 1251–1367)

1. Resolve the current day's date from `days` using `props.dayId`:
   ```
   const currentDay = days.find(d => d.id === props.dayId);
   const currentDate = currentDay?.date ?? null;
   ```

2. Add state for the out-of-range confirmation dialog:
   ```
   const [pending, setPending] = useState<Hotel | null>(null);
   ```

3. Update `chooseHotel(h)`:
   - Compute `isWithinRange = !!(currentDate && h.checkin_date && h.checkout_date && currentDate >= h.checkin_date && currentDate < h.checkout_date)`.
   - CASE A (in range): run existing `syncHotelToItinerary` flow unchanged.
   - CASE B (missing dates OR out of range): `setPending(h)` and return — no sync, no toast.

4. Add a `<BottomSheet open={!!pending} onOpenChange={(o)=>!o && setPending(null)} title={`${pending?.hotel_name ?? ""}`}>` (rendered alongside the pick UI) with:
   - Info block (`bg-surface-2 rounded-xl p-3 mb-4 text-sm text-muted-foreground space-y-1`):
     - `📅 שמור לתאריכים: {hebDate(pending.checkin_date)} – {hebDate(pending.checkout_date)}` (or "לא הוגדרו תאריכים" if null)
     - `📅 היום במסלול: {hebDate(currentDate)}`
   - Question: `<div className="text-sm mb-3">מה תרצה לעשות?</div>`
   - Three stacked buttons `flex flex-col gap-2`:
     1. Primary `h-12 rounded-xl bg-[color:var(--accent)] text-white font-medium` — "📌 רשום לינה ביום זה בלבד" → `addSingleNight(pending)`.
     2. Secondary `h-11 rounded-xl bg-card border border-border` — "✏️ עדכן את תאריכי המלון" → `setMode("editHotel")` with `linkedHotel` override (see step 5) + `setPending(null)`.
     3. Ghost `h-10 text-muted-foreground` — "ביטול" → `setPending(null)`.

5. Route the "update dates" action into the existing HotelForm branch:
   - Add `const [editOverride, setEditOverride] = useState<Hotel | null>(null);`
   - The `mode === "editHotel"` branch currently uses `linkedHotel` (from `existing.linked_hotel_id`). Extend it to `const hotelToEdit = editOverride ?? linkedHotel;` and render when `hotelToEdit` is present. `onHotelSaved` stays as-is (it re-fetches and calls `syncHotelToItinerary`, matching existing behavior).
   - Secondary button handler: `setEditOverride(pending); setMode("editHotel"); setPending(null);`.

6. New `addSingleNight(h: Hotel)`:
   - Query existing entry count for the day to compute `display_order`:
     ```
     const { count } = await supabase.from("day_entries")
       .select("id", { count: "exact", head: true }).eq("day_id", props.dayId);
     ```
   - Insert one row:
     ```
     await supabase.from("day_entries").insert({
       day_id: props.dayId,
       entry_type: "hotel_checkin",
       title: `לינה: ${h.hotel_name}`,
       time_of_day: "20:00",
       location_name: h.city ?? null,
       latitude: h.latitude != null ? Number(h.latitude) : null,
       longitude: h.longitude != null ? Number(h.longitude) : null,
       google_maps_url: h.google_maps_url ?? null,
       photo_url: h.photo_url ?? null,
       linked_hotel_id: h.id,
       display_order: count ?? 0,
     });
     ```
   - Invalidate `["day-entries", props.dayId]` + `["day-entries-summary"]`.
   - `toast.success("✅ לינה נוספה ליום")`, then `setPending(null); onDone();`.
   - Wrap in try/catch → `toast.error`.

### Notes

- Pure ISO string compare — no `Date` math, no UTC risk.
- Does not modify `hotel.checkin_date` / `checkout_date` on the single-day path.
- No changes to `syncHotelToItinerary`, `HotelForm`, or other entry types.
- Legacy edit path (`mode === "legacy"`) is untouched.
