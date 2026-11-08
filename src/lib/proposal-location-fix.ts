// Pure helpers for filling missing stop locations on a pending day-replace proposal.
// The server (revise_day_proposal_locations) re-validates everything; these only shape the payload.

export type SavedPlace = {
  key: string;
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  google_maps_url: string | null;
  source: "recommendation" | "hotel";
};

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
