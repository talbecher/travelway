// Pure helpers that decide WHERE the weather chip's forecast is fetched for.
// Order: today's own coordinates → country-filtered geocoding of a short name.
// Never falls back to an unfiltered first geocoding hit in another country.
import { COUNTRIES } from "./countries";
import type { LatLng } from "./coords";
import { resolveDayLocation, type StoredLocation } from "./day-location";

export type WeatherStop = StoredLocation & {
  entry_type?: string | null;
  recommendations?: (StoredLocation & { city?: string | null }) | null;
};

const SKIP_TYPES = new Set(["note", "flight"]);

function sameLabel(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = a?.trim().toLowerCase();
  const y = b?.trim().toLowerCase();
  return !!x && !!y && x === y;
}

/**
 * Coordinates for today's weather, from data the trip already stores:
 * 1. a stop whose linked recommendation city is the label shown on the chip,
 * 2. any other located stop of the day (display order; notes and flights skipped),
 * 3. tonight's hotel.
 */
export function dayWeatherPoint(
  stops: readonly WeatherStop[],
  hotel?: StoredLocation | null,
  label?: string | null,
): LatLng | null {
  const usable = stops.filter((s) => !SKIP_TYPES.has(s.entry_type ?? ""));
  const locate = (s: WeatherStop) => resolveDayLocation(s, s.recommendations ?? null);
  if (label) {
    for (const s of usable) {
      if (!sameLabel(s.recommendations?.city, label)) continue;
      const p = locate(s);
      if (p) return p;
    }
  }
  for (const s of usable) {
    const p = locate(s);
    if (p) return p;
  }
  return hotel ? resolveDayLocation(hotel) : null;
}

/**
 * Shortest meaningful part of a location label for geocoding:
 * "Mount Fuji - Kawaguchiko" → "Mount Fuji", "Kyoto – Nara" → "Kyoto".
 * Splits on a spaced hyphen and on en/em dash, middle dot, slash, pipe and comma.
 * A hyphen inside a word ("Saint-Tropez", "Fuji-san") is kept.
 */
export function weatherQueryName(label: string | null | undefined): string | null {
  const text = label?.trim();
  if (!text) return null;
  const first = text.split(/\s+-\s+|\s*[–—·|/,]\s*/)[0]?.trim();
  return first || null;
}

/** ISO 3166-1 alpha-2 code for a trip's destination_country (Hebrew, English or code). */
export function tripCountryCode(destination: string | null | undefined): string | null {
  const first = destination
    ?.trim()
    .split(/\s*[,/·|]\s*/)[0]
    ?.trim();
  if (!first) return null;
  const lower = first.toLowerCase();
  const match = COUNTRIES.find(
    (c) => c.he === first || c.en.toLowerCase() === lower || c.code.toLowerCase() === lower,
  );
  if (match) return match.code;
  const aliases: Record<string, string> = {
    'ארה"ב': "US",
    ארהב: "US",
    "ארצות הברית": "US",
    usa: "US",
    "united states": "US",
    אנגליה: "GB",
    בריטניה: "GB",
    england: "GB",
    uk: "GB",
    "united kingdom": "GB",
    "צ'כיה": "CZ",
    czechia: "CZ",
    "czech republic": "CZ",
  };
  return aliases[first] ?? aliases[lower] ?? null;
}

export type GeocodeResult = { latitude: number; longitude: number; country_code?: string | null };

/**
 * First geocoding hit that belongs to the trip's country. Without a known
 * country the first hit is used (previous behaviour). Never crosses countries.
 */
export function pickGeocodeResult(
  results: readonly GeocodeResult[] | null | undefined,
  countryCode: string | null | undefined,
): LatLng | null {
  const cc = countryCode?.toUpperCase() ?? null;
  for (const r of results ?? []) {
    if (!Number.isFinite(r.latitude) || !Number.isFinite(r.longitude)) continue;
    if (cc && r.country_code?.toUpperCase() !== cc) continue;
    return { lat: r.latitude, lng: r.longitude };
  }
  return null;
}
