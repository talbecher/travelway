import { createServerFn } from "@tanstack/react-start";
import { parseLatLngFromMapsUrl } from "./coords";

/**
 * Resolves a short Google Maps share URL (maps.app.goo.gl / goo.gl/maps) by
 * following redirects server-side and extracting lat/lng from the final URL.
 * Fails silently on timeout / network error — returns null so the form can
 * still save with null coordinates.
 */
export const resolveMapsUrl = createServerFn({ method: "POST" })
  .inputValidator((input: { url: string }) => {
    if (!input || typeof input.url !== "string") throw new Error("url required");
    return { url: input.url.slice(0, 2048) };
  })
  .handler(async ({ data }): Promise<{ lat: number; lng: number; resolvedUrl: string } | null> => {
    const url = data.url.trim();
    if (!url) return null;

    // Only resolve known short-link hosts; anything else, the client regex already tried.
    let host = "";
    try {
      host = new URL(url).hostname.toLowerCase();
    } catch {
      return null;
    }
    const isShort =
      host === "maps.app.goo.gl" ||
      host === "goo.gl" ||
      host.endsWith(".app.goo.gl");
    if (!isShort) {
      const direct = parseLatLngFromMapsUrl(url);
      return direct ? { ...direct, resolvedUrl: url } : null;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: { "User-Agent": "Mozilla/5.0" },
      });
      clearTimeout(timeout);

      const finalUrl = res.url || url;
      const coords = parseLatLngFromMapsUrl(finalUrl);
      return coords ? { ...coords, resolvedUrl: finalUrl } : null;
    } catch {
      clearTimeout(timeout);
      return null;
    }
  });
