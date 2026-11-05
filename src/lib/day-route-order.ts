import { resolveDayLocation, type StoredLocation } from "./day-location";
import { haversine } from "./geo";

/** Minimal shape the day-route optimizer needs (structural; EntryRow satisfies it). */
export type RouteOrderEntry = StoredLocation & {
  entry_type: string;
  time_of_day: string | null;
  linked_hotel_id?: string | null;
  linked_location?: StoredLocation | null;
  recommendations?: StoredLocation | null;
};

export type OptimizeResult<T> = {
  isSuboptimal: boolean;
  optimalOrder: T[];
  currentDistKm: number;
  optimalDistKm: number;
  savedMinutes: number;
};

function coordsOf(e: RouteOrderEntry): { lat: number; lng: number } | null {
  return resolveDayLocation(e, e.linked_location ?? e.recommendations);
}

function isLodgingEntry(e: RouteOrderEntry): boolean {
  return e.entry_type === "hotel_checkin" || !!e.linked_hotel_id;
}

/**
 * Computes a nearest-neighbor route (starting from the first located entry)
 * and compares it with the current order. Returns the full suggested order —
 * entries without coordinates or with a set time keep their original slots.
 */
export function computeOptimalOrder<T extends RouteOrderEntry>(entries: T[]): OptimizeResult<T> {
  const none: OptimizeResult<T> = {
    isSuboptimal: false,
    optimalOrder: entries,
    currentDistKm: 0,
    optimalDistKm: 0,
    savedMinutes: 0,
  };
  // Pin lodging entries at the start/end of the day — the day always begins
  // and ends at the hotel. Only the "day body" (activities in between) is reordered.
  const startAnchor = entries.length > 0 && isLodgingEntry(entries[0]) ? entries[0] : null;
  const endAnchor =
    entries.length > 1 && isLodgingEntry(entries[entries.length - 1]) && entries[entries.length - 1] !== startAnchor
      ? entries[entries.length - 1]
      : null;
  const body = entries.filter((e) => e !== startAnchor && e !== endAnchor);

  // Only free-floating located stops are reorderable: entries without
  // coordinates (notes, briefings) and entries with a set time (flights,
  // reservations) keep their original positions in the day.
  const isFixed = (e: T) => coordsOf(e) === null || !!e.time_of_day;
  const withCoords = body.filter((e) => !isFixed(e));
  if (withCoords.length < 3) return none;
  const toPt = (e: T) => {
    const c = coordsOf(e)!;
    return { lat: c.lat, lon: c.lng };
  };
  const pathDist = (list: T[]) => {
    let d = 0;
    for (let i = 0; i < list.length - 1; i++) d += haversine(toPt(list[i]), toPt(list[i + 1]));
    return d;
  };

  // Include pinned lodging anchors (if they have coords) in the distance math,
  // so current vs optimal comparison reflects the real full-day path.
  const anchorPt = (e: T | null) => (e && coordsOf(e) ? e : null);
  const start = anchorPt(startAnchor);
  const end = anchorPt(endAnchor);
  const withAnchors = (list: T[]) =>
    [...(start ? [start] : []), ...list, ...(end ? [end] : [])];

  const currentDist = pathDist(withAnchors(withCoords));

  // Nearest-neighbor starting from the lodging anchor (or first body entry).
  const firstEntry = start ?? withCoords[0];
  const remaining = withCoords.filter((e) => e !== firstEntry);
  const optimized: T[] = start ? [] : [firstEntry];
  let last = firstEntry;
  while (remaining.length > 0) {
    let nearestIdx = 0;
    let nearestDist = Infinity;
    remaining.forEach((e, i) => {
      const d = haversine(toPt(last), toPt(e));
      if (d < nearestDist) {
        nearestDist = d;
        nearestIdx = i;
      }
    });
    last = remaining.splice(nearestIdx, 1)[0];
    optimized.push(last);
  }

  const optimalDist = pathDist(withAnchors(optimized));
  const savedKm = currentDist - optimalDist;

  // Merge back: fixed entries (no coords / timed) stay at their original
  // slots; movable entries fill the remaining slots in optimized order.
  const queue = [...optimized];
  const rebuiltBody = body.map((e) => (isFixed(e) ? e : queue.shift()!));

  const optimalOrder = [
    ...(startAnchor ? [startAnchor] : []),
    ...rebuiltBody,
    ...(endAnchor ? [endAnchor] : []),
  ];

  return {
    isSuboptimal: currentDist > optimalDist * 1.3 && savedKm > 0,
    optimalOrder,
    currentDistKm: Math.round(currentDist * 10) / 10,
    optimalDistKm: Math.round(optimalDist * 10) / 10,
    savedMinutes: Math.max(0, Math.round((savedKm / 30) * 60)),
  };
}
