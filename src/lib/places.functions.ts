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
  .middleware([requireSupabaseAuth])
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
        body: JSON.stringify({ textQuery: query, languageCode: "he", pageSize: 5 }),
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
          const lat = p.location?.latitude ?? 0;
          const lng = p.location?.longitude ?? 0;
          return {
            id: p.id,
            name: p.displayName?.text ?? "",
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

export type PlaceSuggestion = { placeId: string; main: string; secondary: string };

const TOKEN_RE = /^[A-Za-z0-9_-]{8,64}$/;

export const autocompletePlaces = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { input: string; sessionToken: string }) => {
    if (!input || typeof input.input !== "string") throw new Error("input required");
    if (typeof input.sessionToken !== "string" || !TOKEN_RE.test(input.sessionToken))
      throw new Error("invalid session");
    return { input: input.input.slice(0, 200).trim(), sessionToken: input.sessionToken };
  })
  .handler(async ({ data }): Promise<{ suggestions: PlaceSuggestion[]; error?: string }> => {
    if (data.input.length < 2) return { suggestions: [] };
    const apiKey = process.env.GOOGLE_PLACES_KEY;
    if (!apiKey) return { suggestions: [], error: "missing_api_key" };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask":
            "suggestions.placePrediction.placeId,suggestions.placePrediction.structuredFormat,suggestions.placePrediction.text",
        },
        body: JSON.stringify({
          input: data.input,
          languageCode: "he",
          sessionToken: data.sessionToken,
        }),
      });
      clearTimeout(timeout);
      if (!res.ok) {
        console.error("[autocompletePlaces] http", res.status);
        return { suggestions: [], error: "upstream_error" };
      }
      const json = (await res.json()) as {
        suggestions?: Array<{
          placePrediction?: {
            placeId?: string;
            text?: { text?: string };
            structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } };
          };
        }>;
      };
      const suggestions: PlaceSuggestion[] = [];
      for (const s of json.suggestions ?? []) {
        const p = s.placePrediction;
        if (!p?.placeId) continue;
        const main = p.structuredFormat?.mainText?.text ?? p.text?.text ?? "";
        if (!main) continue;
        suggestions.push({
          placeId: p.placeId,
          main,
          secondary: p.structuredFormat?.secondaryText?.text ?? "",
        });
      }
      return { suggestions };
    } catch (e) {
      clearTimeout(timeout);
      console.error("[autocompletePlaces] error", e instanceof Error ? e.name : "unknown");
      return { suggestions: [], error: "network_error" };
    }
  });

export const getPlaceDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { placeId: string; sessionToken: string; profile?: "default" | "expense" }) => {
    if (!input || typeof input.placeId !== "string" || !/^[A-Za-z0-9_-]{5,300}$/.test(input.placeId))
      throw new Error("invalid placeId");
    if (typeof input.sessionToken !== "string" || !TOKEN_RE.test(input.sessionToken))
      throw new Error("invalid session");
    const profile: "default" | "expense" = input.profile === "expense" ? "expense" : "default";
    return { placeId: input.placeId, sessionToken: input.sessionToken, profile };
  })
  .handler(async ({ data }): Promise<{ place: PlaceResult | null; error?: string }> => {
    const apiKey = process.env.GOOGLE_PLACES_KEY;
    if (!apiKey) return { place: null, error: "missing_api_key" };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(data.placeId)}?languageCode=he&sessionToken=${encodeURIComponent(data.sessionToken)}`;
      const res = await fetch(url, {
        method: "GET",
        signal: controller.signal,
        headers: {
          "X-Goog-Api-Key": apiKey,
          // "expense" profile: no photos/rating fields (cheaper SKU, no Photo Media follow-up).
          "X-Goog-FieldMask":
            data.profile === "expense"
              ? "id,displayName,formattedAddress,location,primaryTypeDisplayName,addressComponents"
              : "id,displayName,formattedAddress,location,primaryTypeDisplayName,photos,addressComponents,rating,userRatingCount",
        },
      });
      clearTimeout(timeout);
      if (!res.ok) {
        console.error("[getPlaceDetails] http", res.status);
        return { place: null, error: "upstream_error" };
      }
      const p = (await res.json()) as {
        id: string;
        displayName?: { text?: string };
        formattedAddress?: string;
        location?: { latitude: number; longitude: number };
        primaryTypeDisplayName?: { text?: string };
        photos?: Array<{ name: string }>;
        addressComponents?: AddressComponent[];
        rating?: number;
        userRatingCount?: number;
      };
      if (!p.location || !p.displayName?.text) return { place: null, error: "incomplete" };
      const lat = p.location.latitude;
      const lng = p.location.longitude;
      return {
        place: {
          id: p.id,
          name: p.displayName.text,
          address: p.formattedAddress ?? "",
          latitude: lat,
          longitude: lng,
          primaryType: p.primaryTypeDisplayName?.text ?? null,
          photoName: p.photos?.[0]?.name ?? null,
          google_maps_url: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
          city: extractCity(p.addressComponents),
          rating: typeof p.rating === "number" ? p.rating : null,
          userRatingCount: typeof p.userRatingCount === "number" ? p.userRatingCount : null,
        },
      };
    } catch (e) {
      clearTimeout(timeout);
      console.error("[getPlaceDetails] error", e instanceof Error ? e.name : "unknown");
      return { place: null, error: "network_error" };
    }
  });

export const getPlacePhotoUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { photoName: string; maxWidthPx?: number }) => {
    if (!input || typeof input.photoName !== "string" || !/^places\/[A-Za-z0-9_-]{5,300}\/photos\/[A-Za-z0-9_-]+$/.test(input.photoName)) throw new Error("invalid photoName");
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

/* ---------- destination ambience photo (read-only) ---------- */

export type PhotoAttribution = {
  name: string;
  uri: string | null;
  photoUri: string | null;
};

export type DestinationPhoto = {
  url: string | null;
  attributions: PhotoAttribution[];
  googleMapsUri: string | null;
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
    googleMapsUri?: string;
    authorAttributions?: Array<{ displayName?: string; uri?: string; photoUri?: string }>;
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
    const empty: DestinationPhoto = {
      url: null,
      attributions: [],
      googleMapsUri: null,
      matched: null,
    };
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
          .map((a) => ({
            name: a.displayName ?? "",
            uri: a.uri ?? null,
            photoUri: a.photoUri ?? null,
          }));
        return {
          url: uri,
          attributions,
          googleMapsUri: photo.googleMapsUri ?? null,
          matched: attempt.matched,
        };
      }
      if (photoTries >= 2) break;
    }

    return empty;
  });
