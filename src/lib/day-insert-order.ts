/**
 * Pure helpers for where a new day stop goes and for the "sort by time" action.
 * No Supabase imports, so this stays unit-testable.
 *
 * Fixed entries (hotel check-in, booked linked recommendation, anything without a
 * valid time) never act as time anchors and are never moved relative to the rest.
 */

export type DayOrderEntry = {
  id: string;
  entry_type: string;
  time_of_day: string | null;
  display_order?: number | null;
  /** booking_status of the linked recommendation, when known. */
  booking_status?: string | null;
};

/** "H:MM", "HH:MM" or "HH:MM:SS" → minutes since midnight; anything else → null. */
export function timeToMinutes(t: string | null | undefined): number | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(t.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** True for entries that keep their slot: hotel check-in or booked (same rule as the server). */
export function isFixedEntry(e: Pick<DayOrderEntry, "entry_type" | "booking_status">): boolean {
  return e.entry_type === "hotel_checkin" || e.booking_status === "booked";
}

/** Minutes of an entry that takes part in time ordering, else null. */
function anchorMinutes(e: DayOrderEntry): number | null {
  if (isFixedEntry(e)) return null;
  return timeToMinutes(e.time_of_day);
}

/**
 * Index in `existing` (already in display order) at which a new stop with `newTime`
 * should be inserted.
 * - No/invalid time → end of the day (unchanged behavior).
 * - Otherwise right after the last anchor whose time ≤ newTime (ties go after),
 *   so a manually unsorted list is never reordered; if every anchor is later, right
 *   before the first anchor; with no anchors at all → end.
 */
export function insertIndexByTime(
  existing: readonly DayOrderEntry[],
  newTime: string | null | undefined,
): number {
  const t = timeToMinutes(newTime);
  if (t == null) return existing.length;
  let lastLE = -1;
  let firstAnchor = -1;
  existing.forEach((e, i) => {
    const m = anchorMinutes(e);
    if (m == null) return;
    if (firstAnchor < 0) firstAnchor = i;
    if (m <= t) lastLE = i;
  });
  if (lastLE >= 0) return lastLE + 1;
  if (firstAnchor >= 0) return firstAnchor;
  return existing.length;
}

/** Display comparator shared with the day screen: display_order, then time as tie-break. */
export function compareDayEntryOrder(
  a: Pick<DayOrderEntry, "display_order" | "time_of_day">,
  b: Pick<DayOrderEntry, "display_order" | "time_of_day">,
): number {
  const oa = a.display_order ?? 0;
  const ob = b.display_order ?? 0;
  if (oa !== ob) return oa - ob;
  const ta = a.time_of_day ?? "";
  const tb = b.time_of_day ?? "";
  if (ta && tb) return ta.localeCompare(tb);
  if (ta && !tb) return -1;
  if (!ta && tb) return 1;
  return 0;
}

export type OrderUpdate = { id: string; display_order: number };

/** Positions 0..n-1 for `ordered`; only rows whose display_order actually changes. */
export function renumberUpdates(ordered: readonly DayOrderEntry[]): OrderUpdate[] {
  const out: OrderUpdate[] = [];
  ordered.forEach((e, i) => {
    if ((e.display_order ?? null) !== i) out.push({ id: e.id, display_order: i });
  });
  return out;
}

export type InsertPlan = { display_order: number; updates: OrderUpdate[] };

/**
 * Plan for inserting one new stop into `existing` (display order). Existing rows keep
 * their relative order; only rows at/after the insertion point (or rows whose stored
 * order was not contiguous) get a new display_order. Hotel check-ins being added keep
 * the old append-at-end behavior.
 */
export function planDayInsert(
  existing: readonly DayOrderEntry[],
  newEntry: { entry_type: string; time_of_day?: string | null },
): InsertPlan {
  const idx =
    newEntry.entry_type === "hotel_checkin"
      ? existing.length
      : insertIndexByTime(existing, newEntry.time_of_day ?? null);
  const updates: OrderUpdate[] = [];
  existing.forEach((e, i) => {
    const want = i < idx ? i : i + 1;
    if ((e.display_order ?? null) !== want) updates.push({ id: e.id, display_order: want });
  });
  return { display_order: idx, updates };
}

/**
 * "Sort by time": timed, non-fixed stops are sorted by time (stable on ties) inside the
 * slots they already occupy; untimed stops, hotel check-ins and booked stops stay at
 * their exact positions. Returns the same array when nothing would change.
 */
export function sortByTimeKeepingFixed<T extends DayOrderEntry>(
  entries: readonly T[],
): readonly T[] {
  const slots: number[] = [];
  const movable: { e: T; m: number; i: number }[] = [];
  entries.forEach((e, i) => {
    const m = anchorMinutes(e);
    if (m == null) return;
    slots.push(i);
    movable.push({ e, m, i });
  });
  const sorted = [...movable].sort((a, b) => a.m - b.m || a.i - b.i);
  if (sorted.every((s, k) => s === movable[k])) return entries;
  const out = [...entries];
  slots.forEach((slot, k) => {
    out[slot] = sorted[k].e;
  });
  return out;
}
