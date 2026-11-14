import type { LatLng } from "./coords";
import { locationDistanceKm, resolveDayLocation, type StoredLocation } from "./day-location";

export function haversine(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

export function fmtDistance(km: number) {
  // Rounding 999.5–999.99 m gives 1000: show it as kilometres, not "1000 מ׳".
  const m = Math.round(km * 1000);
  if (m < 1000) return `${m} מ׳`;
  return `${km.toFixed(1)} ק״מ`;
}

/**
 * Why a geolocation request failed. "denied" is the permission error (code 1);
 * position unavailable (2), timeout (3), anything else, or no geolocation API is "unavailable".
 */
export type GeoFailure = "denied" | "unavailable";
export function geoFailureKind(err: { code?: number } | null | undefined): GeoFailure {
  return err?.code === 1 ? "denied" : "unavailable";
}

/**
 * Nearest saved places to `origin`, through the shared day-location resolver: invalid, 0,0 and
 * out-of-range pairs are skipped, and a place with only an explicit Google Maps coordinate link
 * is included. Ties keep the input order. `filter` "all" keeps every type.
 */
export function nearestSavedPlaces<T extends StoredLocation & { type: string }>(
  places: T[],
  origin: LatLng,
  filter: string,
  limit: number,
): Array<{ rec: T; distance: number; point: LatLng }> {
  const from = { latitude: origin.lat, longitude: origin.lng };
  const out: Array<{ rec: T; distance: number; point: LatLng }> = [];
  for (const rec of places) {
    if (filter !== "all" && rec.type !== filter) continue;
    const point = resolveDayLocation(rec);
    const distance = point
      ? locationDistanceKm(from, { latitude: point.lat, longitude: point.lng })
      : null;
    if (!point || distance == null) continue;
    out.push({ rec, distance, point });
  }
  return out.sort((a, b) => a.distance - b.distance).slice(0, limit);
}

export type DayLoad = {
  /** total travel distance between consecutive located stops, km */
  totalKm: number;
  /** number of located stops used for the calculation */
  stops: number;
  /** longest single hop, km */
  longestHopKm: number;
  level: "light" | "normal" | "heavy";
};

/**
 * Rough, offline feasibility estimate for one day: sums straight-line
 * distance between consecutive stops that have coordinates.
 */
export function dayLoadSummary(points: Array<{ lat: number; lon: number }>): DayLoad | null {
  if (points.length < 2) return null;
  let total = 0;
  let longest = 0;
  for (let i = 1; i < points.length; i++) {
    const d = haversine(points[i - 1], points[i]);
    total += d;
    if (d > longest) longest = d;
  }
  const level: DayLoad["level"] = total >= 60 ? "heavy" : total >= 20 ? "normal" : "light";
  return { totalKm: total, stops: points.length, longestHopKm: longest, level };
}

export const DAY_LOAD_LABEL: Record<DayLoad["level"], string> = {
  light: "יום רגוע",
  normal: "יום סביר",
  heavy: "יום צפוף",
};

