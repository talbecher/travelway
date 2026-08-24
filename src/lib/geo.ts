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
  if (km < 1) return `${Math.round(km * 1000)} מ׳`;
  return `${km.toFixed(1)} ק״מ`;
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

