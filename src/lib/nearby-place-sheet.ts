import type { LatLng } from "./coords";
import { fmtDistance } from "./geo";
import { navigationHref } from "./stop-navigation";

/** Fields of a saved place the home "near you" details sheet reads. */
export type NearbyPlaceSheetRec = {
  name: string;
  type: string;
  notes?: string | null;
  google_maps_url?: string | null;
};

export type NearbyPlaceSheetModel = {
  name: string;
  typeLabel: string | null;
  distanceText: string | null;
  description: string | null;
  /** Primary "נווט": the shared navigation link, only when there is a location or a saved Maps link. */
  navigateHref: string | null;
  /** Secondary: the link the row opened before the sheet existed (saved Maps link, else a coordinate search). */
  openMapHref: string | null;
};

const TYPE_LABELS: Record<string, string> = {
  food: "🍜 אוכל",
  attraction: "⛩ אטרקציה",
  hotel: "🏨 לינה",
};

/**
 * What the home "near you" details sheet shows for one saved place. Every field is null when the
 * place has no data for it, so the sheet renders only what exists. `point` and `distance` come from
 * `nearestSavedPlaces` unchanged; this does not compute proximity.
 */
export function nearbyPlaceSheetModel(
  rec: NearbyPlaceSheetRec,
  point: LatLng | null,
  distance: number | null,
): NearbyPlaceSheetModel {
  const mapsUrl = rec.google_maps_url?.trim() || null;
  const navigateHref = point
    ? navigationHref({
        title: rec.name,
        latitude: point.lat,
        longitude: point.lng,
        google_maps_url: mapsUrl,
      })
    : mapsUrl
      ? navigationHref({ title: rec.name, google_maps_url: mapsUrl })
      : null;
  const openMapHref =
    mapsUrl ??
    (point ? `https://www.google.com/maps/search/?api=1&query=${point.lat},${point.lng}` : null);
  const description = rec.notes?.trim() || null;
  return {
    name: rec.name,
    typeLabel: TYPE_LABELS[rec.type] ?? null,
    distanceText: distance != null && Number.isFinite(distance) ? fmtDistance(distance) : null,
    description,
    navigateHref,
    // Same link twice would be one action shown as two buttons.
    openMapHref: openMapHref && openMapHref !== navigateHref ? openMapHref : null,
  };
}
