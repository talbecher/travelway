// Best-effort lat/lng extraction from Google Maps URLs.

export type LatLng = { lat: number; lng: number };

function valid(lat: number, lng: number): LatLng | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90) return null;
  if (lng < -180 || lng > 180) return null;
  if (lat === 0 && lng === 0) return null;
  return { lat, lng };
}

const PATTERNS: RegExp[] = [
  // /maps/@LAT,LNG,zoom | /maps/place/.../@LAT,LNG
  /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
  // Google canonical embedded coords
  /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,
  // ?q=LAT,LNG | &query=LAT,LNG | &ll=LAT,LNG | &destination=LAT,LNG
  /[?&](?:q|query|ll|destination|center)=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
];

export function parseLatLngFromMapsUrl(url: string | null | undefined): LatLng | null {
  if (!url) return null;
  const s = url.trim();
  if (!s) return null;
  for (const re of PATTERNS) {
    const m = s.match(re);
    if (m) {
      const p = valid(Number(m[1]), Number(m[2]));
      if (p) return p;
    }
  }
  // Bare "lat,lng" fallback
  const bare = s.match(/^(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)$/);
  if (bare) return valid(Number(bare[1]), Number(bare[2]));
  return null;
}

export function googleDirectionsUrl(points: LatLng[]): string {
  if (points.length < 2) {
    return points[0] ? mapsSearchUrl(points[0].lat, points[0].lng) : "https://www.google.com/maps";
  }
  const origin = `${points[0].lat},${points[0].lng}`;
  const destination = `${points[points.length - 1].lat},${points[points.length - 1].lng}`;
  const waypoints = points
    .slice(1, -1)
    .map((p) => `${p.lat},${p.lng}`)
    .join("|");
  const params = new URLSearchParams({
    api: "1",
    origin,
    destination,
    travelmode: "walking",
  });
  if (waypoints) params.set("waypoints", waypoints);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function mapsSearchUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

export function walkTimeMin(km: number): number {
  return Math.max(1, Math.round((km / 5) * 60));
}

export const TYPE_PIN_COLOR: Record<string, string> = {
  food: "#FF6B6B",
  attraction: "#6C63FF",
  transport: "#4ECDC4",
  hotel: "#FFD93D",
  hotel_checkin: "#FFD93D",
  flight: "#6C63FF",
  note: "#9CA3AF",
};
