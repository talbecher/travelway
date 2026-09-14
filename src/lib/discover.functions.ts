import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* ---------- types ---------- */

export const DISCOVER_INTERESTS = [
  "food",
  "coffee",
  "bars",
  "attractions",
  "nature",
  "views",
  "shopping",
  "nightlife",
] as const;

export type DiscoverInterest = (typeof DISCOVER_INTERESTS)[number];

export const INTEREST_LABELS: Record<DiscoverInterest, string> = {
  food: "אוכל",
  coffee: "קפה",
  bars: "ברים",
  attractions: "אטרקציות",
  nature: "טבע",
  views: "נופים",
  shopping: "קניות",
  nightlife: "חיי לילה",
};

export type DiscoverRecType = "food" | "attraction";

export const INTEREST_REC_TYPE: Record<DiscoverInterest, DiscoverRecType> = {
  food: "food",
  coffee: "food",
  bars: "food",
  nightlife: "food",
  attractions: "attraction",
  nature: "attraction",
  views: "attraction",
  shopping: "attraction",
};

export type DiscoverPlace = {
  id: string;
  name: string;
  interest: DiscoverInterest;
  recType: DiscoverRecType;
  categoryLabel: string;
  area: string | null;
  address: string;
  city: string;
  latitude: number | null;
  longitude: number | null;
  photoUrl: string | null;
  rating: number | null;
  ratingCount: number | null;
  googleMapsUrl: string;
  /** internal only — never rendered as a quality badge */
  score: number | null;
};

export type DiscoverResponse = {
  ok: boolean;
  /** user-facing error message (Hebrew) when ok = false */
  message?: string;
  /** interests whose search failed while others succeeded */
  failedInterests?: DiscoverInterest[];
  results: DiscoverPlace[];
};

/* ---------- config ---------- */

const SEARCH_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.addressComponents",
  "places.rating",
  "places.userRatingCount",
  "places.businessStatus",
  "places.types",
  "places.photos",
  "places.primaryTypeDisplayName",
].join(",");

const RESOLVE_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.types",
  "places.addressComponents",
  "places.viewport",
].join(",");

const MAX_RESULTS = 20;
const PRIOR_WEIGHT = 150; // m — tunable

const INTEREST_QUERY: Record<DiscoverInterest, string> = {
  food: "restaurants",
  coffee: "coffee shops",
  bars: "bars",
  attractions: "tourist attractions",
  nature: "parks and nature",
  views: "scenic viewpoints",
  shopping: "shopping",
  nightlife: "nightlife",
};

const INTEREST_TYPES: Record<DiscoverInterest, string[]> = {
  food: ["restaurant", "meal_takeaway", "meal_delivery", "food", "bakery"],
  coffee: ["cafe", "coffee_shop", "bakery"],
  bars: ["bar", "pub", "wine_bar"],
  attractions: ["tourist_attraction", "museum", "art_gallery", "historical_landmark", "amusement_park", "zoo", "aquarium"],
  nature: ["park", "national_park", "hiking_area", "garden", "beach", "natural_feature", "botanical_garden"],
  views: ["observation_deck", "tourist_attraction", "scenic_point", "natural_feature", "historical_landmark"],
  shopping: ["shopping_mall", "store", "clothing_store", "department_store", "market", "book_store", "gift_shop"],
  nightlife: ["night_club", "bar", "pub", "casino", "karaoke"],
};

const GEO_TYPES = new Set([
  "locality",
  "postal_town",
  "administrative_area_level_1",
  "administrative_area_level_2",
  "administrative_area_level_3",
  "sublocality",
  "neighborhood",
]);

/* ---------- helpers ---------- */

type AddressComponent = { longText?: string; shortText?: string; types?: string[] };
type LatLng = { latitude: number; longitude: number };

type ApiPlace = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: LatLng;
  addressComponents?: AddressComponent[];
  rating?: number;
  userRatingCount?: number;
  businessStatus?: string;
  types?: string[];
  primaryTypeDisplayName?: { text?: string };
  photos?: Array<{ name: string }>;
  viewport?: { low?: LatLng; high?: LatLng };
};

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function componentValues(place: ApiPlace, types: string[]): string[] {
  const out: string[] = [];
  for (const c of place.addressComponents ?? []) {
    if (!(c.types ?? []).some((t) => types.includes(t))) continue;
    if (c.longText) out.push(c.longText);
    if (c.shortText) out.push(c.shortText);
  }
  return out;
}

function matchesTerm(values: string[], term: string): boolean {
  const t = norm(term);
  if (!t) return false;
  return values.some((v) => {
    const n = norm(v);
    return n === t || n.includes(t) || t.includes(n);
  });
}

function areaOf(place: ApiPlace): string | null {
  const vals = componentValues(place, ["neighborhood", "sublocality", "sublocality_level_1"]);
  const first = vals.find((v) => v.trim().length > 0);
  return first ?? null;
}

async function placesFetch(
  apiKey: string,
  fieldMask: string,
  body: Record<string, unknown>,
): Promise<ApiPlace[] | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);
  try {
    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": fieldMask,
      },
      body: JSON.stringify(body),
    });
    clearTimeout(timeout);
    if (!res.ok) {
      console.error("[discover] places http", res.status);
      return null;
    }
    const json = (await res.json()) as { places?: ApiPlace[] };
    return json.places ?? [];
  } catch (e) {
    clearTimeout(timeout);
    console.error("[discover] places error", e instanceof Error ? e.message : "unknown");
    return null;
  }
}

async function resolvePhoto(apiKey: string, photoName: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const url = `https://places.googleapis.com/v1/${encodeURI(photoName)}/media?maxWidthPx=480&skipHttpRedirect=true`;
    const res = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: { "X-Goog-Api-Key": apiKey },
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const json = (await res.json()) as { photoUri?: string };
    return json.photoUri ?? null;
  } catch {
    clearTimeout(timeout);
    return null;
  }
}

function isPilotUser(userId: string): boolean {
  const raw = process.env.DISCOVER_PILOT_USER_IDS ?? "";
  const allow = raw
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return allow.includes(userId);
}

/* ---------- server function ---------- */

export const discoverPlaces = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { city: string; country: string; interests: string[] }) => {
    if (!input || typeof input.city !== "string" || typeof input.country !== "string") {
      throw new Error("city and country are required");
    }
    const city = input.city.slice(0, 100).trim();
    const country = input.country.slice(0, 100).trim();
    const interests = Array.isArray(input.interests) ? input.interests : [];
    return { city, country, interests: interests.slice(0, 10).map((i) => String(i)) };
  })
  .handler(async ({ data, context }): Promise<DiscoverResponse> => {
    if (!isPilotUser(context.userId)) {
      return { ok: false, message: "התכונה בפיילוט סגור. אין הרשאה לחשבון הזה.", results: [] };
    }

    const { city, country } = data;
    if (!city || !country) {
      return { ok: false, message: "יש להזין עיר ומדינה.", results: [] };
    }

    const interests = Array.from(new Set(data.interests)).filter((i): i is DiscoverInterest =>
      (DISCOVER_INTERESTS as readonly string[]).includes(i),
    );
    if (interests.length !== new Set(data.interests).size) {
      return { ok: false, message: "נבחר תחום עניין שאינו נתמך.", results: [] };
    }
    if (interests.length < 1 || interests.length > 3) {
      return { ok: false, message: "יש לבחור בין תחום עניין אחד לשלושה.", results: [] };
    }

    const apiKey = process.env.GOOGLE_PLACES_KEY;
    if (!apiKey) {
      console.error("[discover] GOOGLE_PLACES_KEY missing");
      return { ok: false, message: "שירות המקומות אינו מוגדר.", results: [] };
    }

    /* 1. destination resolution — single request */
    const resolved = await placesFetch(apiKey, RESOLVE_FIELD_MASK, {
      textQuery: `${city}, ${country}`,
      languageCode: "he",
      pageSize: 1,
    });
    if (resolved === null) {
      return { ok: false, message: "לא הצלחנו לזהות את היעד כרגע. נסו שוב מאוחר יותר.", results: [] };
    }
    const dest = resolved[0];
    if (!dest || !(dest.types ?? []).some((t) => GEO_TYPES.has(t))) {
      return { ok: false, message: "היעד לא זוהה. בדקו את שם העיר והמדינה ונסו שוב.", results: [] };
    }

    const cityValues = componentValues(dest, [
      "locality",
      "postal_town",
      "administrative_area_level_1",
      "administrative_area_level_2",
    ]);
    const countryValues = componentValues(dest, ["country"]);
    if (!matchesTerm(cityValues, city) || !matchesTerm(countryValues, country)) {
      return { ok: false, message: "היעד עמום. דייקו את שם העיר והמדינה.", results: [] };
    }

    const low = dest.viewport?.low;
    const high = dest.viewport?.high;
    if (!low || !high) {
      return { ok: false, message: "לא התקבלה תחימה אמינה ליעד. דייקו את שם העיר ונסו שוב.", results: [] };
    }
    const locationRestriction = { rectangle: { low, high } };

    /* 2. one search per interest */
    const failedInterests: DiscoverInterest[] = [];
    const perInterest = new Map<DiscoverInterest, ApiPlace[]>();

    for (const interest of interests) {
      const places = await placesFetch(apiKey, SEARCH_FIELD_MASK, {
        textQuery: `${INTEREST_QUERY[interest]} ${city}`,
        languageCode: "he",
        locationRestriction,
        pageSize: MAX_RESULTS,
      });
      if (places === null) {
        failedInterests.push(interest);
        continue;
      }
      perInterest.set(interest, places);
    }

    if (perInterest.size === 0) {
      return {
        ok: false,
        message: "החיפוש נכשל. נסו שוב מאוחר יותר.",
        failedInterests,
        results: [],
      };
    }

    /* 3. filter + score, per interest */
    type Candidate = DiscoverPlace & { _order: number };
    const seen = new Set<string>();
    const byInterest: Array<{ interest: DiscoverInterest; items: Candidate[] }> = [];

    for (const interest of interests) {
      const raw = perInterest.get(interest);
      if (!raw) continue;
      const allowed = INTEREST_TYPES[interest];
      const kept: Candidate[] = [];
      raw.forEach((p, idx) => {
        if (!p.id || !p.displayName?.text) return;
        if (p.businessStatus === "CLOSED_PERMANENTLY") return;
        if (seen.has(p.id)) return;
        if (!matchesTerm(componentValues(p, ["country"]), country)) return;
        if (!(p.types ?? []).some((t) => allowed.includes(t))) return;
        seen.add(p.id);
        kept.push({
          id: p.id,
          name: p.displayName.text!,
          interest,
          categoryLabel: p.primaryTypeDisplayName?.text ?? INTEREST_LABELS[interest],
          area: areaOf(p),
          address: p.formattedAddress ?? "",
          photoUrl: null,
          rating: typeof p.rating === "number" ? p.rating : null,
          ratingCount: typeof p.userRatingCount === "number" ? p.userRatingCount : null,
          googleMapsUrl: p.location
            ? `https://www.google.com/maps/search/?api=1&query=${p.location.latitude},${p.location.longitude}&query_place_id=${p.id}`
            : `https://www.google.com/maps/search/?api=1&query_place_id=${p.id}`,
          score: null,
          _order: idx,
        });
      });

      const scored = kept.filter((k) => k.rating != null && k.ratingCount != null);
      if (scored.length > 0) {
        const C = scored.reduce((sum, k) => sum + (k.rating ?? 0), 0) / scored.length;
        for (const k of scored) {
          const v = k.ratingCount ?? 0;
          const R = k.rating ?? 0;
          k.score = (v * R + PRIOR_WEIGHT * C) / (v + PRIOR_WEIGHT);
        }
      }

      kept.sort((a, b) => {
        if (a.score == null && b.score == null) return a._order - b._order;
        if (a.score == null) return 1;
        if (b.score == null) return -1;
        return b.score - a.score;
      });

      byInterest.push({ interest, items: kept });
    }

    /* 4. interleave for interest representation + light area diversity */
    const selected: Candidate[] = [];
    const areaCount = new Map<string, number>();

    let progress = true;
    while (selected.length < MAX_RESULTS && progress) {
      progress = false;
      for (const bucket of byInterest) {
        if (selected.length >= MAX_RESULTS) break;
        if (bucket.items.length === 0) continue;
        // prefer an item from a less-represented area, without dropping anything
        let pickIndex = 0;
        for (let j = 0; j < bucket.items.length; j++) {
          const a = bucket.items[j]!.area;
          if (!a || (areaCount.get(a) ?? 0) < 2) {
            pickIndex = j;
            break;
          }
        }
        const item = bucket.items.splice(pickIndex, 1)[0]!;
        if (item.area) areaCount.set(item.area, (areaCount.get(item.area) ?? 0) + 1);
        selected.push(item);
        progress = true;
      }
    }

    /* 5. photos — one request per returned result */
    const photoNames = new Map<string, string>();
    for (const bucketRaw of perInterest.values()) {
      for (const p of bucketRaw) {
        const n = p.photos?.[0]?.name;
        if (p.id && n && !photoNames.has(p.id)) photoNames.set(p.id, n);
      }
    }

    const results: DiscoverPlace[] = [];
    for (const item of selected.slice(0, MAX_RESULTS)) {
      const photoName = photoNames.get(item.id);
      const photoUrl = photoName ? await resolvePhoto(apiKey, photoName) : null;
      const { _order, ...rest } = item;
      void _order;
      results.push({ ...rest, photoUrl });
    }

    return {
      ok: true,
      results,
      ...(failedInterests.length > 0 ? { failedInterests } : {}),
    };
  });
