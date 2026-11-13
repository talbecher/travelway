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

/**
 * Text normalisation for comparing place names: NFKC, lower case, punctuation and symbols
 * replaced by spaces, runs of spaces collapsed, trimmed. No transliteration and no fuzziness.
 */
export function normalizePlaceText(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const MIN_FILTER_NAME = 3;

/**
 * Filter over saved place name/address, compared after normalisation. A place also shows when
 * the query contains its whole name (e.g. "Hotel X, Kyoto" finds the saved "Hotel X").
 */
export function filterSavedPlaces(places: SavedPlace[], query: string): SavedPlace[] {
  const q = normalizePlaceText(query);
  if (!q) return places;
  return places.filter((p) => {
    const name = normalizePlaceText(p.name);
    return (
      name.includes(q) ||
      normalizePlaceText(p.address).includes(q) ||
      (name.length >= MIN_FILTER_NAME && q.includes(name))
    );
  });
}

/** A saved name distinctive enough to match on its own: at least 8 characters or 2 words. */
function distinctiveName(norm: string): boolean {
  return norm.length >= 8 || norm.split(" ").length >= 2;
}

/**
 * Pre-selects a saved place for stops that are still missing a location, only when the match is
 * unambiguous. A stop matches a saved place when, after normalisation:
 *  (a) its location_name equals the saved name, or its title equals a distinctive saved name; or
 *  (b) its location_name is the saved name followed by a comma and a suffix (", Kyoto"), and the
 *      saved name is distinctive (8+ characters or 2+ words).
 * Exactly one saved place (with valid coordinates) must match; otherwise the stop is left alone.
 * Stops not in `missing` and stops that already have a pick are never touched.
 * Returns stop index -> saved place. Nothing is written: the caller only shows these as picks.
 */
export function autoMatchSaved(
  entries: Array<{ title: string; location_name?: string | null }>,
  missing: number[],
  saved: SavedPlace[],
  existingPicks: Record<number, unknown> = {},
): Record<number, SavedPlace> {
  const usable = saved
    .filter((p) => p.source !== "google" && validCoords(p.latitude, p.longitude))
    .map((p) => ({ place: p, norm: normalizePlaceText(p.name) }))
    .filter((p) => p.norm.length > 0);
  const out: Record<number, SavedPlace> = {};
  for (const i of missing) {
    const e = entries[i];
    if (!e || existingPicks[i] !== undefined) continue;
    const loc = (e.location_name ?? "").trim();
    const locNorm = normalizePlaceText(loc);
    const titleNorm = normalizePlaceText(e.title);
    // Every "name, suffix" split of the raw location_name (comma positions only).
    const heads: string[] = [];
    for (let k = loc.indexOf(","); k > 0; k = loc.indexOf(",", k + 1)) {
      if (normalizePlaceText(loc.slice(k + 1))) heads.push(normalizePlaceText(loc.slice(0, k)));
    }
    const hits = usable.filter(
      ({ norm }) =>
        (locNorm !== "" && locNorm === norm) ||
        (distinctiveName(norm) && (titleNorm === norm || heads.includes(norm))),
    );
    if (hits.length === 1) out[i] = hits[0].place;
  }
  return out;
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
