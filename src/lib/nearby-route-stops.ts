import type { LatLng } from "./coords";
import { resolveDayLocation, type StoredLocation } from "./day-location";

export type RouteStopEntry = StoredLocation & {
  id: string;
  day_id: string;
  title: string | null;
  entry_type?: string | null;
  linked_recommendation_id: string | null;
};
export type RouteStopDay = { id: string; day_number: number };
export type RouteStopRec = StoredLocation & { id: string };

/** One located itinerary stop for the near-me map; the same place on several days is one point. */
export type RouteStopPoint = {
  id: string;
  title: string;
  point: LatLng;
  dayIds: string[];
  dayNumbers: number[];
};

export function routeDaysLabel(dayNumbers: number[]): string {
  return dayNumbers.length === 1
    ? `במסלול · יום ${dayNumbers[0]}`
    : `במסלול · ימים ${dayNumbers.join(", ")}`;
}

/**
 * Itinerary stops (every day of the active version, regardless of date or time) with a location,
 * resolved like the day screen: the stop's own coordinates/Maps link, then its linked recommendation.
 * A stop linked to a recommendation that already has a location is not returned as a point; its day
 * numbers go to `recDays` so the recommendation is shown once, marked as in the route.
 * Notes and stops of days not in `days` are skipped.
 */
export function collectRouteStops(
  entriesByDay: Record<string, RouteStopEntry[]>,
  days: RouteStopDay[],
  recs: RouteStopRec[],
): { stops: RouteStopPoint[]; recDays: Map<string, number[]> } {
  const recById = new Map(recs.map((r) => [r.id, r]));
  const recDays = new Map<string, number[]>();
  const byKey = new Map<string, RouteStopPoint>();
  const addDay = (list: number[], n: number) => {
    if (!list.includes(n)) list.push(n);
    list.sort((a, b) => a - b);
  };
  const ordered = [...days].sort((a, b) => a.day_number - b.day_number);
  for (const day of ordered) {
    for (const entry of entriesByDay[day.id] ?? []) {
      if (entry.entry_type === "note") continue;
      const linked = entry.linked_recommendation_id
        ? recById.get(entry.linked_recommendation_id)
        : undefined;
      if (linked && resolveDayLocation(linked)) {
        const list = recDays.get(linked.id) ?? [];
        addDay(list, day.day_number);
        recDays.set(linked.id, list);
        continue;
      }
      const point = resolveDayLocation(entry, linked ?? null);
      if (!point) continue;
      const title = entry.title?.trim() || "תחנה במסלול";
      const key = `${title.toLowerCase()}|${point.lat.toFixed(5)},${point.lng.toFixed(5)}`;
      const existing = byKey.get(key);
      if (existing) {
        if (!existing.dayIds.includes(day.id)) existing.dayIds.push(day.id);
        addDay(existing.dayNumbers, day.day_number);
      } else {
        byKey.set(key, {
          id: `stop:${entry.id}`,
          title,
          point,
          dayIds: [day.id],
          dayNumbers: [day.day_number],
        });
      }
    }
  }
  return { stops: [...byKey.values()], recDays };
}
