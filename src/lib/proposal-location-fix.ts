// Pure helpers for filling missing stop locations on a pending day-replace proposal.
// The server (revise_day_proposal_locations) re-validates everything; these only shape the payload.

export type SavedPlace = {
  key: string;
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  google_maps_url: string | null;
  source: "recommendation" | "hotel" | "google";
  /** Google place id of a saved recommendation (or of a Google pick); used only to hide duplicates. */
  provider_place_id?: string | null;
};

/** One Google autocomplete suggestion (same shape as PlaceSuggestion from places.functions). */
export type GoogleSuggestion = { placeId: string; main: string; secondary: string };

export type PlaceOption =
  | { kind: "saved"; place: SavedPlace }
  | { kind: "google"; suggestion: GoogleSuggestion };

export const MAX_GOOGLE_RESULTS = 5;
const PLACE_ID_RE = /^[A-Za-z0-9_-]{5,300}$/;

/**
 * Saved places first (order kept), then up to MAX_GOOGLE_RESULTS Google suggestions.
 * A Google suggestion is hidden only when its placeId equals a saved place's provider_place_id
 * (no name matching). `google` is null when Google failed or did not run: saved places still show.
 */
export function mergePlaceResults(
  saved: SavedPlace[],
  google: GoogleSuggestion[] | null,
): PlaceOption[] {
  const out: PlaceOption[] = saved.map((place) => ({ kind: "saved", place }));
  const taken = new Set(saved.map((p) => p.provider_place_id).filter((id): id is string => !!id));
  let added = 0;
  for (const s of google ?? []) {
    if (added >= MAX_GOOGLE_RESULTS) break;
    if (!s.placeId || taken.has(s.placeId)) continue;
    taken.add(s.placeId);
    out.push({ kind: "google", suggestion: s });
    added++;
  }
  return out;
}

/** Initial search text for a stop: its location_name, otherwise its title. */
export function prefillQuery(entry: { title: string; location_name?: string | null }): string {
  return (entry.location_name ?? "").trim() || entry.title.trim();
}

/** Google Maps link to the exact place: explicit destination coordinates plus the Google place id. */
export function googleMapsPlaceUrl(lat: number, lng: number, placeId: string): string {
  const base = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  return PLACE_ID_RE.test(placeId) ? `${base}&query_place_id=${encodeURIComponent(placeId)}` : base;
}

/** Converts a Google Place Details result into a pick; null when its coordinates are unusable. */
export function savedFromGooglePlace(p: {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
}): SavedPlace | null {
  if (!validCoords(p.latitude, p.longitude) || !PLACE_ID_RE.test(p.id)) return null;
  return {
    key: `google:${p.id}`,
    name: p.name,
    address: p.address || null,
    latitude: p.latitude,
    longitude: p.longitude,
    google_maps_url: googleMapsPlaceUrl(p.latitude, p.longitude, p.id),
    source: "google",
    provider_place_id: p.id,
  };
}

export type ProposalEntryLike = {
  title: string;
  time_of_day: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

export type LocationRevision = {
  index: number;
  latitude: number;
  longitude: number;
  google_maps_url?: string;
};

const MAPS_RE = /^https:\/\/(www\.)?(google\.[a-z.]+\/maps|maps\.google\.[a-z.]+\/)/;

export function validCoords(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180 &&
    !(lat === 0 && lng === 0)
  );
}

/** Case-insensitive filter over saved place name/address. */
export function filterSavedPlaces(places: SavedPlace[], query: string): SavedPlace[] {
  const q = query.trim().toLowerCase();
  if (!q) return places;
  return places.filter(
    (p) => p.name.toLowerCase().includes(q) || (p.address ?? "").toLowerCase().includes(q),
  );
}

/** Indexes of entries that still have no stored location. */
export function missingIndexes(entries: ProposalEntryLike[], locationSources: string[]): number[] {
  return entries
    .map((_, i) => i)
    .filter(
      (i) =>
        (locationSources[i] ?? "missing") === "missing" &&
        entries[i].latitude == null &&
        entries[i].longitude == null,
    );
}

/**
 * Builds the revise payload: only entries still missing a location, only valid picked coords,
 * and a Maps URL only when it is an https Google Maps link. Sorted by index.
 */
export function buildLocationRevisions(
  entries: ProposalEntryLike[],
  locationSources: string[],
  picks: Record<number, SavedPlace>,
): LocationRevision[] {
  const out: LocationRevision[] = [];
  for (const [k, place] of Object.entries(picks)) {
    const index = Number(k);
    if (!Number.isInteger(index)) continue;
    const e = entries[index];
    if (!e) continue;
    if ((locationSources[index] ?? "missing") !== "missing") continue;
    if (e.latitude != null || e.longitude != null) continue;
    if (!validCoords(place.latitude, place.longitude)) continue;
    const rev: LocationRevision = { index, latitude: place.latitude, longitude: place.longitude };
    if (
      place.google_maps_url &&
      place.google_maps_url.length <= 2000 &&
      MAPS_RE.test(place.google_maps_url)
    ) {
      rev.google_maps_url = place.google_maps_url;
    }
    out.push(rev);
  }
  return out.sort((a, b) => a.index - b.index);
}
