import { haversine } from "@/lib/geo";
import { parseLatLngFromMapsUrl, type LatLng } from "@/lib/coords";

export const SUGGEST_MAX_KM = 3.5;

export type GeoEntry = {
  id: string;
  day_id: string;
  title: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
  linked_recommendation_id: string | null;
  display_order: number | null;
  created_at: string | null;
};

export type SuggestDay = { id: string; day_number: number; date: string };

export type DaySuggestion = { dayId: string; dayNumber: number; km: number; stopTitle: string };

function validPoint(lat: unknown, lng: unknown): LatLng | null {
  if (lat == null || lng == null || lat === "" || lng === "") return null;
  const a = Number(lat), b = Number(lng);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (a < -90 || a > 90 || b < -180 || b > 180) return null;
  if (a === 0 && b === 0) return null;
  return { lat: a, lng: b };
}

/** Same coordinate source as addRecommendationToDay: stored lat/lng, else the Maps URL. */
export function recLatLng(rec: { latitude?: unknown; longitude?: unknown; google_maps_url?: string | null }): LatLng | null {
  return validPoint(rec.latitude, rec.longitude) ?? parseLatLngFromMapsUrl(rec.google_maps_url);
}

function entryCmp(a: GeoEntry, b: GeoEntry) {
  return (a.display_order ?? 0) - (b.display_order ?? 0)
    || (a.created_at ?? "").localeCompare(b.created_at ?? "")
    || a.id.localeCompare(b.id);
}

/**
 * Picks the day whose nearest located stop is closest (straight-line) to the rec.
 * Ties: distance rounded to 10 m, then lower day_number, then date, then id.
 * Days without located stops get no score; days already holding the rec are excluded.
 */
export function suggestDayForRec(
  point: LatLng | null,
  recId: string,
  days: SuggestDay[],
  entriesByDay: Record<string, GeoEntry[]>,
): { suggestion: DaySuggestion | null; alreadyInDayIds: Set<string> } {
  const alreadyInDayIds = new Set<string>();
  for (const d of days) {
    if ((entriesByDay[d.id] ?? []).some((e) => e.linked_recommendation_id === recId)) alreadyInDayIds.add(d.id);
  }
  if (!point) return { suggestion: null, alreadyInDayIds };
  const p = { lat: point.lat, lon: point.lng };
  let best: (DaySuggestion & { key: number; date: string }) | null = null;
  for (const d of days) {
    if (alreadyInDayIds.has(d.id)) continue;
    const entries = [...(entriesByDay[d.id] ?? [])].sort(entryCmp);
    let dayBest: { km: number; title: string } | null = null;
    for (const e of entries) {
      const q = validPoint(e.latitude, e.longitude);
      if (!q) continue;
      const km = haversine(p, { lat: q.lat, lon: q.lng });
      if (!dayBest || Math.round(km * 100) < Math.round(dayBest.km * 100)) dayBest = { km, title: e.title ?? "" };
    }
    if (!dayBest || dayBest.km > SUGGEST_MAX_KM) continue;
    const key = Math.round(dayBest.km * 100);
    const better = !best
      || key < best.key
      || (key === best.key && (d.day_number - best.dayNumber
        || d.date.localeCompare(best.date)
        || d.id.localeCompare(best.dayId)) < 0);
    if (better) best = { dayId: d.id, dayNumber: d.day_number, km: dayBest.km, stopTitle: dayBest.title, key, date: d.date };
  }
  return {
    suggestion: best ? { dayId: best.dayId, dayNumber: best.dayNumber, km: best.km, stopTitle: best.stopTitle } : null,
    alreadyInDayIds,
  };
}

export function fmtApproxDistance(km: number): string {
  if (km < 1) return `כ־${Math.max(50, Math.round((km * 1000) / 50) * 50)} מ׳`;
  return `כ־${km.toFixed(1)} ק״מ`;
}
