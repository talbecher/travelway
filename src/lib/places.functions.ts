import { createServerFn } from "@tanstack/react-start";

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
