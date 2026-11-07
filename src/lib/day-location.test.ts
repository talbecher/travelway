// @ts-nocheck -- bun:test types are not installed; no new dependency needed.
import { describe, expect, test } from "bun:test";
import { explicitMapsCoordinates, resolveDayLocation } from "./day-location";

const point = { lat: 35.711, lng: 139.796 };
const url = "https://www.google.com/maps/search/?api=1&query=35.711,139.796";

describe("day location resolution", () => {
  test("stored valid stop coordinates win over its URL and linked recommendation", () => {
    expect(resolveDayLocation({ latitude: "35", longitude: "139", google_maps_url: url }, { latitude: 36, longitude: 140 })).toEqual({ lat: 35, lng: 139 });
  });
  test("coordinate-only search URL works without a Place ID or stop columns", () => {
    expect(resolveDayLocation({ google_maps_url: url })).toEqual(point);
    expect(explicitMapsCoordinates(url.replace(",", "%2C"))).toEqual(point);
  });
  test("explicit stop URL precedes linked coordinates", () => {
    expect(resolveDayLocation({ google_maps_url: url }, { latitude: 36, longitude: 140 })).toEqual(point);
  });
  test("linked recommendation coordinates then explicit URL are fallbacks", () => {
    expect(resolveDayLocation({}, { latitude: 35.711, longitude: 139.796 })).toEqual(point);
    expect(resolveDayLocation({}, { google_maps_url: url })).toEqual(point);
  });
  test("range and malformed coordinate validation allows zero and boundaries", () => {
    for (const latitude of [91, Infinity, NaN, "", " ", "35junk", "0x23"]) expect(resolveDayLocation({ latitude, longitude: 139 })).toBeNull();
    expect(resolveDayLocation({ latitude: 35, longitude: 181 })).toBeNull();
    expect(resolveDayLocation({ latitude: 90, longitude: -180 })).toEqual({ lat: 90, lng: -180 });
    expect(resolveDayLocation({ latitude: 0, longitude: 0 })).toBeNull();
    expect(resolveDayLocation({ latitude: 0, longitude: 139 })).toEqual({ lat: 0, lng: 139 });
    expect(resolveDayLocation({ latitude: 91, longitude: 139, google_maps_url: url })).toEqual(point);
  });
  test("never uses viewport, text, short links or bare coordinates", () => {
    for (const input of ["https://www.google.com/maps/place/Gate/@35.711,139.796,16z", "https://www.google.com/maps?ll=35.711,139.796", "https://www.google.com/maps?center=35.711,139.796", "https://www.google.com/maps?q=Kaminarimon", "https://maps.app.goo.gl/example", "35.711,139.796"]) expect(explicitMapsCoordinates(input)).toBeNull();
  });
  test("rejects untrusted, malformed and ambiguous URLs", () => {
    for (const input of [url.replace("www.google.com", "evil.example"), url.replace("www.google.com", "www.google.com.evil.example"), url.replace("www.google.com", "user@www.google.com"), url.replace("https:", "javascript:"), url + "junk", url + "%ZZ", url + "&query=35,139", url + "&q=36,140", url.replace("35.711", "91"), url.replace("139.796", "181"), url.replace("/maps/search/", "/other/")]) expect(explicitMapsCoordinates(input)).toBeNull();
  });
  test("explicit canonical place coordinates do not use the preceding viewport", () => {
    expect(explicitMapsCoordinates("https://www.google.com/maps/place/Gate/@1,2,16z/data=!3d35.711!4d139.796!16sabc")).toEqual(point);
    expect(explicitMapsCoordinates("https://www.google.com/maps/place/Gate/data=!3d35.711!4d139.796junk")).toBeNull();
  });
  test("resolution never mutates its input", () => {
    const stop = Object.freeze({ latitude: null, longitude: null, google_maps_url: url });
    expect(resolveDayLocation(stop)).toEqual(point);
    expect(stop.latitude).toBeNull();
  });
});
import { dayEndpoint, endpointDirectionsUrl } from "./day-location";
describe("arrival endpoints", () => {
  test("coords without Place ID are usable", () => {
    expect(dayEndpoint({ latitude: 35.688, longitude: 139.718 })).toEqual({ kind: "coords", lat: 35.688, lng: 139.718, query: "35.688,139.718" });
  });
  test("supported saved Maps URL", () => {
    expect(dayEndpoint({ google_maps_url: "https://www.google.com/maps/search/?api=1&query=35.5,138.77" })?.kind).toBe("coords");
  });
  test("text-only place name falls back to text directions", () => {
    expect(dayEndpoint({ location_name: " Kawaguchiko Station " })).toEqual({ kind: "text", query: "Kawaguchiko Station" });
  });
  test("truly missing location and notes", () => {
    expect(dayEndpoint({})).toBeNull();
    expect(dayEndpoint({ entry_type: "note", location_name: "x" })).toBeNull();
  });
  test("origin/destination order and travel modes", () => {
    const a = dayEndpoint({ latitude: 35.688, longitude: 139.718 })!;
    const b = dayEndpoint({ location_name: "Kawaguchiko Station" })!;
    for (const mode of ["walking", "transit"]) {
      const u = new URL(endpointDirectionsUrl(a, b, mode));
      expect(u.searchParams.get("origin")).toBe("35.688,139.718");
      expect(u.searchParams.get("destination")).toBe("Kawaguchiko Station");
      expect(u.searchParams.get("travelmode")).toBe(mode);
    }
  });
});
