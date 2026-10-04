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
  /** Google photo resource name — fetched on demand via getDiscoverPhoto */
  photoName: string | null;
  photoAttributions: Array<{ displayName: string; uri: string | null }>;
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
  /** shared with photo requests for per-search measurement */
  searchId?: string;
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

// Place Details Essentials only — no displayName/photos/rating (those are Pro/Enterprise SKUs).
const DETAILS_FIELD_MASK = "id,types,location,viewport,addressComponents";

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

// Accepted destination types: city, town, neighborhood, district, region, natural feature (e.g. a lake).
// Rejected: country, administrative_area_level_1 (too broad to bound), businesses and POIs.
const GEO_TYPES = new Set([
  "locality",
  "postal_town",
  "administrative_area_level_2",
  "administrative_area_level_3",
  "sublocality",
  "sublocality_level_1",
  "neighborhood",
  "colloquial_area",
  "natural_feature",
]);

// Preferred components for the search-term label, in priority order.
const LABEL_TYPES = [
  "locality",
  "postal_town",
  "sublocality",
  "sublocality_level_1",
  "neighborhood",
  "natural_feature",
  "administrative_area_level_3",
  "administrative_area_level_2",
];

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
  photos?: Array<{ name: string; authorAttributions?: Array<{ displayName?: string; uri?: string }> }>;
  viewport?: { low?: LatLng; high?: LatLng };
};

function componentValues(place: ApiPlace, types: string[]): string[] {
  const out: string[] = [];
  for (const c of place.addressComponents ?? []) {
    if (!(c.types ?? []).some((t) => types.includes(t))) continue;
    if (c.longText) out.push(c.longText);
    if (c.shortText) out.push(c.shortText);
  }
  return out;
}

/** ISO country code (shortText of the "country" component), or null. */
function countryCodeOf(place: ApiPlace): string | null {
  for (const c of place.addressComponents ?? []) {
    if ((c.types ?? []).includes("country") && c.shortText) return c.shortText;
  }
  return null;
}

/** Search-term label derived server-side from address components — never from the client. */
function destLabel(place: ApiPlace): string | null {
  for (const t of LABEL_TYPES) {
    const v = componentValues(place, [t]).find((s) => s.trim().length > 0);
    if (v) return v;
  }
  return null;
}

function areaOf(place: ApiPlace): string | null {
  const vals = componentValues(place, ["neighborhood", "sublocality", "sublocality_level_1"]);
  const first = vals.find((v) => v.trim().length > 0);
  return first ?? null;
}

type FailKind = "quota" | "denied" | "upstream" | "network" | "unknown";
type FetchResult = { ok: true; places: ApiPlace[] } | { ok: false; kind: FailKind };

const FAIL_MESSAGES: Record<FailKind, string> = {
  quota: "שירות גילוי המקומות אינו זמין כרגע בגלל מגבלת שימוש. נסו שוב מאוחר יותר.",
  denied: "שירות גילוי המקומות אינו זמין כרגע. נסו שוב מאוחר יותר.",
  upstream: "שירות המקומות לא הגיב כרגע. נסו שוב בעוד כמה דקות.",
  network: "השרת לא הצליח להתחבר לשירות המקומות. נסו שוב מאוחר יותר.",
  unknown: "החיפוש נכשל. נסו שוב מאוחר יותר.",
};

function pickFailKind(kinds: FailKind[]): FailKind {
  const order: FailKind[] = ["quota", "denied", "upstream", "network", "unknown"];
  return order.find((k) => kinds.includes(k)) ?? "unknown";
}

async function placesFetch(
  apiKey: string,
  fieldMask: string,
  body: Record<string, unknown>,
): Promise<FetchResult> {
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
      const kind: FailKind =
        res.status === 429 ? "quota"
        : res.status === 403 ? "denied"
        : res.status >= 500 ? "upstream"
        : "unknown";
      return { ok: false, kind };
    }
    const json = (await res.json()) as { places?: ApiPlace[] };
    return { ok: true, places: json.places ?? [] };
  } catch (e) {
    clearTimeout(timeout);
    const aborted = e instanceof Error && e.name === "AbortError";
    console.error("[discover] places error", aborted ? "timeout" : e instanceof Error ? e.message : "unknown");
    return { ok: false, kind: aborted ? "upstream" : "network" };
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

/* ---------- server functions ---------- */

/** Lightweight pilot-access check — never calls Google. */
export const checkPilotAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ allowed: boolean }> => {
    return { allowed: isPilotUser(context.userId) };
  });

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

    const searchId = crypto.randomUUID().slice(0, 8);
    const t0 = Date.now();
    let searchTextCalls = 1;
    /* 1. destination resolution — single request */
    const resolved = await placesFetch(apiKey, RESOLVE_FIELD_MASK, {
      textQuery: `${city}, ${country}`,
      languageCode: "he",
      pageSize: 1,
    });
    if (!resolved.ok) {
      return { ok: false, message: FAIL_MESSAGES[resolved.kind], results: [] };
    }
    const dest = resolved.places[0];
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
    const tResolve = Date.now();

    /* 2. one search per interest */
    const failedInterests: DiscoverInterest[] = [];
    const perInterest = new Map<DiscoverInterest, ApiPlace[]>();

    const failKinds: FailKind[] = [];
    for (const interest of interests) {
      searchTextCalls++;
      const r = await placesFetch(apiKey, SEARCH_FIELD_MASK, {
        textQuery: `${INTEREST_QUERY[interest]} ${city}`,
        languageCode: "he",
        locationRestriction,
        pageSize: MAX_RESULTS,
      });
      if (!r.ok) {
        failedInterests.push(interest);
        failKinds.push(r.kind);
        continue;
      }
      perInterest.set(interest, r.places);
    }

    if (perInterest.size === 0) {
      return {
        ok: false,
        message: FAIL_MESSAGES[pickFailKind(failKinds)],
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
          recType: INTEREST_REC_TYPE[interest],
          categoryLabel: p.primaryTypeDisplayName?.text ?? INTEREST_LABELS[interest],
          area: areaOf(p),
          address: p.formattedAddress ?? "",
          city,
          latitude: typeof p.location?.latitude === "number" ? p.location.latitude : null,
          longitude: typeof p.location?.longitude === "number" ? p.location.longitude : null,
          photoName: p.photos?.[0]?.name ?? null,
          photoAttributions: (p.photos?.[0]?.authorAttributions ?? [])
            .filter((a) => !!a.displayName)
            .map((a) => ({ displayName: a.displayName!, uri: a.uri ?? null })),
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

    const results: DiscoverPlace[] = selected.slice(0, MAX_RESULTS).map((item) => {
      const { _order, ...rest } = item;
      void _order;
      return rest;
    });

    console.info(
      `[discover] search searchId=${searchId} resolveMs=${tResolve - t0} placesMs=${Date.now() - tResolve} searchTextCalls=${searchTextCalls} results=${results.length}`,
    );

    return {
      ok: true,
      searchId,
      results,
      ...(failedInterests.length > 0 ? { failedInterests } : {}),
    };
  });

const PHOTO_NAME_RE = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_\-.~=]+$/;

/** One Photo Media call for one visible card. Pilot-gated; key stays server-side. */
export const getDiscoverPhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { photoName: string; searchId?: string }) => {
    const photoName = String(input?.photoName ?? "").slice(0, 4000);
    const searchId = String(input?.searchId ?? "").replace(/[^a-z0-9-]/gi, "").slice(0, 16);
    return { photoName, searchId };
  })
  .handler(async ({ data, context }): Promise<{ url: string | null }> => {
    if (!PHOTO_NAME_RE.test(data.photoName) || data.photoName.length > 2000) {
      console.warn(`[discover] photoMedia searchId=${data.searchId || "-"} rejected len=${data.photoName.length}`);
      return { url: null };
    }
    if (!isPilotUser(context.userId)) return { url: null };
    const apiKey = process.env.GOOGLE_PLACES_KEY;
    if (!apiKey) return { url: null };
    const t = Date.now();
    const url = await resolvePhoto(apiKey, data.photoName);
    console.info(`[discover] photoMedia searchId=${data.searchId || "-"} ok=${!!url} ms=${Date.now() - t}`);
    return { url };
  });
