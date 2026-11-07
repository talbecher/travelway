import type { LatLng } from "./coords";

export type StoredLocation = {
  latitude?: number | string | null;
  longitude?: number | string | null;
  google_maps_url?: string | null;
};

const NUMBER = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/;

function coordinate(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !NUMBER.test(value.trim())) return null;
  const number = Number(value.trim());
  return Number.isFinite(number) ? number : null;
}

function pair(latitude: unknown, longitude: unknown): LatLng | null {
  const lat = coordinate(latitude), lng = coordinate(longitude);
  if (lat == null || lng == null || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  // Preserve DayMap's existing unset-location sentinel, keeping pins and sheets aligned.
  if (lat === 0 && lng === 0) return null;
  return { lat, lng };
}

/** Destination coordinates only. Never read @, ll or center (map viewport). */
export function explicitMapsCoordinates(value: string | null | undefined): LatLng | null {
  if (!value) return null;
  const text = value.trim();
  if (/[\\\u0000-\u0020]/.test(text) || /%(?![\da-f]{2})/i.test(text)) return null;
  try {
    const url = new URL(text);
    const trusted = ["google.com", "www.google.com", "maps.google.com", "www.google.co.jp", "www.google.co.uk"];
    if (!trusted.includes(url.hostname) || !["https:", "http:"].includes(url.protocol) || url.username || url.password || url.port) return null;
    if (!/^\/maps(?:\/|$)/.test(url.pathname) && url.hostname !== "maps.google.com") return null;
    const candidates: LatLng[] = [];
    for (const key of ["query", "q", "destination"]) {
      const values = url.searchParams.getAll(key);
      if (values.length > 1) return null;
      for (const val of values) {
        const parts = val.split(",");
        const coords = parts.length === 2 ? pair(parts[0], parts[1]) : null;
        // A present non-coordinate destination is not evidence of a location.
        if (!coords) return null;
        candidates.push(coords);
      }
    }
    const path = decodeURIComponent(url.pathname);
    for (const match of path.matchAll(/!3d([^!\/]+)!4d([^!\/]+)(?=!|\/|$)/g)) {
      const coords = pair(match[1], match[2]);
      if (!coords) return null;
      candidates.push(coords);
    }
    const first = candidates[0];
    if (!first || candidates.some((p) => p.lat !== first.lat || p.lng !== first.lng)) return null;
    return first;
  } catch {
    return null;
  }
}

/** Pure read-time resolution; the source rows remain untouched. */
export function resolveDayLocation(stop: StoredLocation, recommendation?: StoredLocation | null): LatLng | null {
  return pair(stop.latitude, stop.longitude)
    ?? explicitMapsCoordinates(stop.google_maps_url)
    ?? (recommendation ? pair(recommendation.latitude, recommendation.longitude)
      ?? explicitMapsCoordinates(recommendation.google_maps_url) : null);
}
export type DayEndpointStop = StoredLocation & { entry_type?: string | null; location_name?: string | null };
export type DayEndpoint =
  | { kind: "coords"; lat: number; lng: number; query: string }
  | { kind: "text"; query: string };

/** Navigation endpoint: resolved coordinates first, otherwise the saved place name (text-only directions, no estimates). */
export function dayEndpoint(stop: DayEndpointStop, recommendation?: StoredLocation | null): DayEndpoint | null {
  if (stop.entry_type === "note") return null;
  const c = resolveDayLocation(stop, recommendation);
  if (c) return { kind: "coords", lat: c.lat, lng: c.lng, query: `${c.lat},${c.lng}` };
  const name = stop.location_name?.trim();
  return name ? { kind: "text", query: name } : null;
}

export function endpointDirectionsUrl(from: DayEndpoint, to: DayEndpoint, mode: string): string {
  const p = new URLSearchParams({ api: "1", origin: from.query, destination: to.query, travelmode: mode });
  return `https://www.google.com/maps/dir/?${p.toString()}`;
}
