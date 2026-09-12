import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type PlaceResult = {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  primaryType: string | null;
  photoName: string | null;
  google_maps_url: string;
  city: string | null;
  rating: number | null;
  userRatingCount: number | null;
};

export type SearchPlacesResponse = {
  results: PlaceResult[];
  error?: string;
};

type AddressComponent = {
  longText?: string;
  shortText?: string;
  types?: string[];
};

function extractCity(components?: AddressComponent[]): string | null {
  if (!components) return null;
  const byType = (t: string) =>
    components.find((c) => (c.types ?? []).includes(t))?.longText ?? null;
  return (
    byType("locality") ??
    byType("administrative_area_level_2") ??
    byType("administrative_area_level_1") ??
    null
  );
}

export const searchPlaces = createServerFn({ method: "POST" })
  .inputValidator((input: { query: string }) => {
    if (!input || typeof input.query !== "string") throw new Error("query required");
    return { query: input.query.slice(0, 200).trim() };
  })
  .handler(async ({ data }): Promise<SearchPlacesResponse> => {
    const query = data.query;
    if (!query || query.length < 2) return { results: [] };

    const apiKey = process.env.GOOGLE_PLACES_KEY;
    if (!apiKey) {
      console.error("[searchPlaces] GOOGLE_PLACES_KEY missing");
      return { results: [], error: "missing_api_key" };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask":
            "places.id,places.displayName,places.formattedAddress,places.location,places.primaryTypeDisplayName,places.photos,places.addressComponents,places.rating,places.userRatingCount",
        },
        body: JSON.stringify({ textQuery: query, languageCode: "he" }),
      });
      clearTimeout(timeout);

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        console.error("[searchPlaces] http", res.status, body.slice(0, 500));
        return { results: [], error: "upstream_error" };
      }

      const json = (await res.json()) as {
        places?: Array<{
          id: string;
          displayName?: { text?: string };
          formattedAddress?: string;
          location?: { latitude: number; longitude: number };
          primaryTypeDisplayName?: { text?: string };
          photos?: Array<{ name: string }>;
          addressComponents?: AddressComponent[];
          rating?: number;
          userRatingCount?: number;
        }>;
      };

      const results: PlaceResult[] = (json.places ?? [])
        .filter((p) => p.location && p.displayName?.text)
        .map((p) => {
          const lat = p.location!.latitude;
          const lng = p.location!.longitude;
          return {
            id: p.id,
            name: p.displayName!.text!,
            address: p.formattedAddress ?? "",
            latitude: lat,
            longitude: lng,
            primaryType: p.primaryTypeDisplayName?.text ?? null,
            photoName: p.photos?.[0]?.name ?? null,
            google_maps_url: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
            city: extractCity(p.addressComponents),
            rating: typeof p.rating === "number" ? p.rating : null,
            userRatingCount: typeof p.userRatingCount === "number" ? p.userRatingCount : null,
          };
        });

      return { results };
    } catch (e) {
      clearTimeout(timeout);
      console.error("[searchPlaces] error", e);
      return { results: [], error: "network_error" };
    }
  });

export const getPlacePhotoUrl = createServerFn({ method: "POST" })
  .inputValidator((input: { photoName: string; maxWidthPx?: number }) => {
    if (!input || typeof input.photoName !== "string") throw new Error("photoName required");
    return {
      photoName: input.photoName.slice(0, 512),
      maxWidthPx: Math.min(Math.max(input.maxWidthPx ?? 400, 40), 1600),
    };
  })
  .handler(async ({ data }): Promise<{ url: string | null }> => {
    const apiKey = process.env.GOOGLE_PLACES_KEY;
    if (!apiKey) return { url: null };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const url = `https://places.googleapis.com/v1/${encodeURI(data.photoName)}/media?maxWidthPx=${data.maxWidthPx}&skipHttpRedirect=true`;
      const res = await fetch(url, {
        method: "GET",
        signal: controller.signal,
        headers: { "X-Goog-Api-Key": apiKey },
      });
      clearTimeout(timeout);
      if (!res.ok) {
        console.error("[getPlacePhotoUrl] http", res.status);
        return { url: null };
      }
      const json = (await res.json()) as { photoUri?: string };
      return { url: json.photoUri ?? null };
    } catch (e) {
      clearTimeout(timeout);
      console.error("[getPlacePhotoUrl] error", e);
      return { url: null };
    }
  });

export type EnrichResult = {
  updated: boolean;
  photo_url: string | null;
  google_rating: number | null;
  google_rating_count: number | null;
};

export const enrichRecommendationPhoto = createServerFn({ method: "POST" })
  .inputValidator((input: {
    id?: string | null;
    name: string;
    city?: string | null;
    lat?: number | null;
    lng?: number | null;
  }) => {
    if (!input || typeof input.name !== "string") throw new Error("name required");
    return {
      id: typeof input.id === "string" ? input.id : null,
      name: input.name.slice(0, 200).trim(),
      city: typeof input.city === "string" ? input.city.slice(0, 100).trim() : null,
      lat: typeof input.lat === "number" && Number.isFinite(input.lat) ? input.lat : null,
      lng: typeof input.lng === "number" && Number.isFinite(input.lng) ? input.lng : null,
    };
  })
  .handler(async ({ data }): Promise<EnrichResult> => {
    const empty: EnrichResult = { updated: false, photo_url: null, google_rating: null, google_rating_count: null };
    const apiKey = process.env.GOOGLE_PLACES_KEY;
    if (!apiKey || !data.name) return empty;

    const textQuery = data.city ? `${data.name} ${data.city}` : data.name;
    const body: Record<string, unknown> = { textQuery, languageCode: "he" };
    if (data.lat != null && data.lng != null) {
      body.locationBias = {
        circle: { center: { latitude: data.lat, longitude: data.lng }, radius: 500 },
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    let photo_url: string | null = null;
    let google_rating: number | null = null;
    let google_rating_count: number | null = null;

    try {
      const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": "places.photos,places.rating,places.userRatingCount",
        },
        body: JSON.stringify(body),
      });
      clearTimeout(timeout);
      if (!res.ok) {
        console.error("[enrichRecommendationPhoto] search http", res.status);
        return empty;
      }
      const json = (await res.json()) as {
        places?: Array<{
          photos?: Array<{ name: string }>;
          rating?: number;
          userRatingCount?: number;
        }>;
      };
      const first = (json.places ?? [])[0];
      if (!first) return empty;

      if (typeof first.rating === "number") google_rating = first.rating;
      if (typeof first.userRatingCount === "number") google_rating_count = first.userRatingCount;

      const photoName = first.photos?.[0]?.name;
      if (photoName) {
        const c2 = new AbortController();
        const t2 = setTimeout(() => c2.abort(), 8000);
        try {
          const purl = `https://places.googleapis.com/v1/${encodeURI(photoName)}/media?maxWidthPx=400&skipHttpRedirect=true`;
          const pr = await fetch(purl, {
            method: "GET",
            signal: c2.signal,
            headers: { "X-Goog-Api-Key": apiKey },
          });
          clearTimeout(t2);
          if (pr.ok) {
            const pj = (await pr.json()) as { photoUri?: string };
            photo_url = pj.photoUri ?? null;
          }
        } catch (e) {
          clearTimeout(t2);
          console.error("[enrichRecommendationPhoto] photo error", e);
        }
      }
    } catch (e) {
      clearTimeout(timeout);
      console.error("[enrichRecommendationPhoto] error", e);
      return empty;
    }

    const anyFound = photo_url != null || google_rating != null || google_rating_count != null;
    if (!anyFound) return empty;

    if (data.id) {
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const patch: {
          photo_url?: string;
          google_rating?: number;
          google_rating_count?: number;
        } = {};
        if (photo_url != null) patch.photo_url = photo_url;
        if (google_rating != null) patch.google_rating = google_rating;
        if (google_rating_count != null) patch.google_rating_count = google_rating_count;
        if (Object.keys(patch).length > 0) {
          const { error } = await supabaseAdmin.from("recommendations").update(patch).eq("id", data.id);
          if (error) console.error("[enrichRecommendationPhoto] db update", error);
        }
      } catch (e) {
        console.error("[enrichRecommendationPhoto] db import", e);
      }
    }

    return { updated: true, photo_url, google_rating, google_rating_count };
  });

/* ---------- destination ambience photo (read-only) ---------- */

export type PhotoAttribution = { name: string; uri: string | null };

export type DestinationPhoto = {
  url: string | null;
  attributions: PhotoAttribution[];
  matched: "city" | "destination" | null;
};

type PlaceLite = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  types?: string[];
  addressComponents?: AddressComponent[];
  photos?: Array<{
    name: string;
    widthPx?: number;
    heightPx?: number;
    authorAttributions?: Array<{ displayName?: string; uri?: string }>;
  }>;
};

const GEO_TYPES = new Set([
  "locality",
  "administrative_area_level_1",
  "administrative_area_level_2",
  "administrative_area_level_3",
  "country",
  "sublocality",
  "neighborhood",
  "postal_town",
  "tourist_attraction",
  "natural_feature",
  "landmark",
  "point_of_interest",
]);

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Does the place's address/components plausibly contain the requested term? */
function componentsMatch(place: PlaceLite, term: string): boolean {
  const t = norm(term);
  if (!t) return false;
  const haystack: string[] = [];
  for (const c of place.addressComponents ?? []) {
    if (c.longText) haystack.push(norm(c.longText));
    if (c.shortText) haystack.push(norm(c.shortText));
  }
  if (place.formattedAddress) haystack.push(norm(place.formattedAddress));
  if (place.displayName?.text) haystack.push(norm(place.displayName.text));
  return haystack.some((h) => h === t || h.includes(t) || t.includes(h));
}

function isGeographic(place: PlaceLite): boolean {
  const types = place.types ?? [];
  // `political` alone is not proof — require a real geographic/landmark type.
  return types.some((t) => GEO_TYPES.has(t));
}

async function searchDestinationPlace(
  apiKey: string,
  textQuery: string,
): Promise<PlaceLite | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask":
          "places.id,places.displayName,places.formattedAddress,places.types,places.addressComponents,places.photos",
      },
      body: JSON.stringify({ textQuery, languageCode: "he", pageSize: 5 }),
    });
    clearTimeout(timeout);
    if (!res.ok) {
      console.error("[destinationPhoto] search http", res.status);
      return null;
    }
    const json = (await res.json()) as { places?: PlaceLite[] };
    return (json.places ?? [])[0] ?? null;
  } catch (e) {
    clearTimeout(timeout);
    console.error("[destinationPhoto] search error", e);
    return null;
  }
}

async function resolvePhotoUri(
  apiKey: string,
  photoName: string,
): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const url = `https://places.googleapis.com/v1/${encodeURI(photoName)}/media?maxWidthPx=1200&skipHttpRedirect=true`;
    const res = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: { "X-Goog-Api-Key": apiKey },
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const json = (await res.json()) as { photoUri?: string };
    return json.photoUri ?? null;
  } catch (e) {
    clearTimeout(timeout);
    console.error("[destinationPhoto] photo error", e);
    return null;
  }
}

/** Pick landscape photos first, then anything else. */
function rankPhotos(place: PlaceLite) {
  return [...(place.photos ?? [])]
    .filter((p) => !!p.name)
    .sort((a, b) => {
      const la = (a.widthPx ?? 0) > (a.heightPx ?? 0) ? 0 : 1;
      const lb = (b.widthPx ?? 0) > (b.heightPx ?? 0) ? 0 : 1;
      if (la !== lb) return la - lb;
      return (b.widthPx ?? 0) - (a.widthPx ?? 0);
    })
    .slice(0, 2);
}

export const getDestinationPhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { city?: string | null; destination: string }) => {
    if (!input || typeof input.destination !== "string") throw new Error("destination required");
    return {
      city: typeof input.city === "string" ? input.city.slice(0, 100).trim() : null,
      destination: input.destination.slice(0, 120).trim(),
    };
  })
  .handler(async ({ data }): Promise<DestinationPhoto> => {
    const empty: DestinationPhoto = { url: null, attributions: [], matched: null };
    const apiKey = process.env.GOOGLE_PLACES_KEY;
    if (!apiKey || !data.destination) return empty;

    // Ambiguous / multi-country destination text — don't guess.
    if (/[,/|]|\band\b|\bו-|\+/.test(data.destination)) {
      if (!data.city) return empty;
    }

    const attempts: Array<{ query: string; verify: string[]; matched: "city" | "destination" }> = [];
    if (data.city) {
      attempts.push({
        query: `${data.city} ${data.destination}`,
        verify: [data.city],
        matched: "city",
      });
    }
    attempts.push({
      query: data.destination,
      verify: [data.destination],
      matched: "destination",
    });

    let photoTries = 0;
    for (const attempt of attempts.slice(0, 2)) {
      const place = await searchDestinationPlace(apiKey, attempt.query);
      if (!place) continue;
      if (!isGeographic(place)) continue;
      if (!attempt.verify.some((term) => componentsMatch(place, term))) continue;

      for (const photo of rankPhotos(place)) {
        if (photoTries >= 2) break;
        photoTries += 1;
        const uri = await resolvePhotoUri(apiKey, photo.name);
        if (!uri) continue;
        const attributions: PhotoAttribution[] = (photo.authorAttributions ?? [])
          .filter((a) => a.displayName)
          .map((a) => ({ name: a.displayName!, uri: a.uri ?? null }));
        return { url: uri, attributions, matched: attempt.matched };
      }
      if (photoTries >= 2) break;
    }

    return empty;
  });
