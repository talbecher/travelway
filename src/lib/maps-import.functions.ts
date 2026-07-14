import { createServerFn } from "@tanstack/react-start";
import { XMLParser } from "fast-xml-parser";

export type ImportedPlace = {
  name: string;
  description: string | null;
  latitude: number | null;
  longitude: number | null;
  suggested_type: "food" | "attraction" | "hotel";
  google_maps_url: string | null;
  hasCoords: boolean;
};

function stripHtml(s: string | null | undefined): string | null {
  if (!s) return null;
  const text = String(s)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
  return text || null;
}

function guessType(hints: string): "food" | "attraction" | "hotel" {
  const s = hints.toLowerCase();
  if (/(lodging|hotel|ryokan|hostel|inn|yellow)/.test(s)) return "hotel";
  if (/(restaurant|dining|food|cafe|coffee|bar|red|orange|pink)/.test(s)) return "food";
  return "attraction";
}

function collectStyleHints(styleUrl: unknown, style: unknown): string {
  let hint = "";
  if (typeof styleUrl === "string") hint += " " + styleUrl;
  const s = style as Record<string, unknown> | undefined;
  const icon = s?.IconStyle as Record<string, unknown> | undefined;
  const iconObj = icon?.Icon as Record<string, unknown> | undefined;
  const href = iconObj?.href;
  if (typeof href === "string") hint += " " + href;
  return hint;
}

function toArray<T>(v: T | T[] | undefined | null): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

export const fetchMyMapKml = createServerFn({ method: "POST" })
  .inputValidator((input: { url: string }) => {
    if (!input || typeof input.url !== "string") throw new Error("url required");
    return { url: input.url.slice(0, 2048) };
  })
  .handler(async ({ data }): Promise<ImportedPlace[]> => {
    let mid: string | null = null;
    try {
      const u = new URL(data.url.trim());
      mid = u.searchParams.get("mid");
    } catch {
      throw new Error("הלינק לא נראה כמו Google My Maps");
    }
    if (!mid) throw new Error("הלינק לא נראה כמו Google My Maps");

    const kmlUrl = `https://www.google.com/maps/d/kml?mid=${encodeURIComponent(mid)}&forcekml=1`;
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 10000);
    let kmlText = "";
    try {
      const res = await fetch(kmlUrl, {
        redirect: "follow",
        signal: controller.signal,
        headers: { "User-Agent": "Mozilla/5.0" },
      });
      if (!res.ok) throw new Error("fetch failed");
      kmlText = await res.text();
    } catch {
      clearTimeout(t);
      throw new Error("לא ניתן לייבא — ודא שהמפה ציבורית");
    }
    clearTimeout(t);

    if (!kmlText || !kmlText.includes("<")) {
      throw new Error("לא ניתן לייבא — ודא שהמפה ציבורית");
    }

    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      textNodeName: "#text",
      isArray: (name) => ["Placemark", "Folder", "Style"].includes(name),
    });

    let parsed: Record<string, unknown>;
    try {
      parsed = parser.parse(kmlText) as Record<string, unknown>;
    } catch {
      throw new Error("לא ניתן לייבא — ודא שהמפה ציבורית");
    }

    // Collect placemarks recursively (they live inside Document/Folder).
    const placemarks: Record<string, unknown>[] = [];
    const walk = (node: unknown): void => {
      if (!node || typeof node !== "object") return;
      const obj = node as Record<string, unknown>;
      if (obj.Placemark) {
        for (const pm of toArray(obj.Placemark as Record<string, unknown> | Record<string, unknown>[])) {
          placemarks.push(pm as Record<string, unknown>);
        }
      }
      if (obj.Folder) {
        for (const f of toArray(obj.Folder as Record<string, unknown>)) walk(f);
      }
      if (obj.Document) walk(obj.Document);
      if (obj.kml) walk(obj.kml);
    };
    walk(parsed);

    const places: ImportedPlace[] = [];
    for (const pm of placemarks) {
      const nameRaw = pm.name;
      const name =
        typeof nameRaw === "string"
          ? nameRaw.trim()
          : nameRaw && typeof nameRaw === "object" && "#text" in (nameRaw as object)
            ? String((nameRaw as { "#text": unknown })["#text"]).trim()
            : "";
      if (!name) continue;

      const descRaw = pm.description;
      const description =
        typeof descRaw === "string"
          ? stripHtml(descRaw)
          : descRaw && typeof descRaw === "object" && "#text" in (descRaw as object)
            ? stripHtml(String((descRaw as { "#text": unknown })["#text"]))
            : null;

      // Coordinates: try Point first, then LineString/Polygon centroid fallback (first coord).
      let coordsStr = "";
      const point = pm.Point as Record<string, unknown> | undefined;
      if (point && typeof point.coordinates === "string") coordsStr = point.coordinates;
      if (!coordsStr) {
        const ls = pm.LineString as Record<string, unknown> | undefined;
        if (ls && typeof ls.coordinates === "string") coordsStr = ls.coordinates;
      }

      let lat: number | null = null;
      let lng: number | null = null;
      if (coordsStr) {
        const first = coordsStr.trim().split(/\s+/)[0];
        const parts = first.split(",");
        const lo = Number(parts[0]);
        const la = Number(parts[1]);
        if (Number.isFinite(lo) && Number.isFinite(la) && la >= -90 && la <= 90 && lo >= -180 && lo <= 180) {
          lat = la;
          lng = lo;
        }
      }

      const hint = collectStyleHints(pm.styleUrl, pm.Style);
      const suggested_type = guessType(hint + " " + name + " " + (description ?? ""));

      const google_maps_url =
        lat != null && lng != null
          ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
          : null;

      places.push({
        name,
        description,
        latitude: lat,
        longitude: lng,
        suggested_type,
        google_maps_url,
        hasCoords: lat != null && lng != null,
      });
    }

    if (places.length === 0) {
      throw new Error("לא נמצאו מקומות במפה זו");
    }
    return places;
  });
