import type { LatLng } from "./coords";
import { locationDistanceKm, resolveDayLocation } from "./day-location";
import { recLatLng } from "./day-suggest";

/** Radius around the day's stops (or its hotel) for the "nearby recommendations" map layer. */
export const DAY_NEARBY_RECS_KM = 1.5;

export type NearbyAnchor = {
  id: string;
  title: string;
  lat: number;
  lng: number;
  kind: "stop" | "hotel";
};

export type NearbyRecInput = {
  id: string;
  name: string;
  type: string;
  latitude?: unknown;
  longitude?: unknown;
  google_maps_url?: string | null;
};

export type NearbyHotelInput = {
  id: string;
  hotel_name: string;
  checkin_date: string | null;
  checkout_date: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  google_maps_url?: string | null;
};

export type NearbyRec<R> = { rec: R; point: LatLng; km: number; nearest: NearbyAnchor };

export type DayNearbyResult<R> = {
  /** "stops": located stops are the anchors; "hotel": the night's hotel; "none": nothing to measure from. */
  anchorKind: "stops" | "hotel" | "none";
  anchors: NearbyAnchor[];
  items: NearbyRec<R>[];
};

/** Located hotels for the night of `date` (checkin_date <= date < checkout_date), in input order. */
export function dayHotelAnchors(
  hotels: NearbyHotelInput[],
  date: string | null | undefined,
): NearbyAnchor[] {
  if (!date) return [];
  const out: NearbyAnchor[] = [];
  for (const h of hotels) {
    if (!h.checkin_date || !h.checkout_date || !(h.checkin_date <= date && date < h.checkout_date))
      continue;
    const p = resolveDayLocation(h);
    if (p) out.push({ id: h.id, title: h.hotel_name, lat: p.lat, lng: p.lng, kind: "hotel" });
  }
  return out;
}

/**
 * Saved recommendations within `maxKm` (inclusive) of any anchor. Anchors are the day's located
 * stops; without any, the day's hotel anchors; without those, nothing. Recommendations already
 * linked to the day and ones without a resolvable location are left out. Nearest first, ties by
 * name then id. Pure: reads only its arguments.
 */
export function dayNearbyRecs<R extends NearbyRecInput>(
  recs: R[],
  input: {
    stops: Array<{ id: string; title: string; lat: number; lng: number }>;
    hotelAnchors: NearbyAnchor[];
    linkedRecIds: Iterable<string>;
    maxKm?: number;
  },
): DayNearbyResult<R> {
  const maxKm = input.maxKm ?? DAY_NEARBY_RECS_KM;
  const stopAnchors: NearbyAnchor[] = [];
  for (const s of input.stops) {
    const p = resolveDayLocation({ latitude: s.lat, longitude: s.lng });
    if (p) stopAnchors.push({ id: s.id, title: s.title, lat: p.lat, lng: p.lng, kind: "stop" });
  }
  const anchors = stopAnchors.length > 0 ? stopAnchors : input.hotelAnchors;
  const anchorKind = stopAnchors.length > 0 ? "stops" : anchors.length > 0 ? "hotel" : "none";
  if (anchors.length === 0) return { anchorKind, anchors, items: [] };

  const linked = new Set(input.linkedRecIds);
  const items: NearbyRec<R>[] = [];
  for (const rec of recs) {
    if (linked.has(rec.id)) continue;
    const point = recLatLng(rec);
    if (!point) continue;
    let best: { km: number; anchor: NearbyAnchor } | null = null;
    for (const a of anchors) {
      const km = locationDistanceKm(
        { latitude: a.lat, longitude: a.lng },
        { latitude: point.lat, longitude: point.lng },
      );
      if (km != null && (!best || km < best.km)) best = { km, anchor: a };
    }
    if (best && best.km <= maxKm) items.push({ rec, point, km: best.km, nearest: best.anchor });
  }
  items.sort(
    (a, b) =>
      a.km - b.km || a.rec.name.localeCompare(b.rec.name) || a.rec.id.localeCompare(b.rec.id),
  );
  return { anchorKind, anchors, items };
}
