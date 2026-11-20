// @ts-nocheck -- bun:test types are not installed; no new dependency needed.
import { describe, expect, test } from "bun:test";
import { DAY_NEARBY_RECS_KM, stopNearbyRecs } from "./day-nearby-recs";

// 1 km of latitude on the haversine sphere (R = 6371 km).
const KM_LAT = 180 / (Math.PI * 6371);
const BASE = { lat: 35.0, lng: 135.75 };
const north = (km: number) => ({ latitude: BASE.lat + km * KM_LAT, longitude: BASE.lng });
const stop = { id: "s1", title: "Kiyomizu", lat: BASE.lat, lng: BASE.lng };
const rec = (id: string, loc: object, extra: object = {}) => ({
  id,
  name: id,
  type: "food",
  ...loc,
  ...extra,
});

describe("stopNearbyRecs", () => {
  test("stop without a location → nothing", () => {
    expect(stopNearbyRecs([rec("a", north(0.1))], { stop: null })).toEqual([]);
  });

  test("radius is 1.5 km, inclusive; farther recs are left out", () => {
    const r = stopNearbyRecs(
      [
        rec("in", north(1.0)),
        rec("edge", north(DAY_NEARBY_RECS_KM - 1e-9)),
        rec("out", north(1.6)),
      ],
      { stop },
    );
    expect(r.map((i) => i.rec.id)).toEqual(["in", "edge"]);
    expect(r[0].nearest).toMatchObject({ id: "s1", kind: "stop" });
    expect(r[0].km).toBeCloseTo(1.0, 5);
  });

  test("nearest first, ties by name", () => {
    const r = stopNearbyRecs([rec("b", north(0.5)), rec("a", north(0.5)), rec("c", north(0.2))], {
      stop,
    });
    expect(r.map((i) => i.rec.id)).toEqual(["c", "a", "b"]);
  });

  test("the stop's own linked recommendation is excluded", () => {
    const r = stopNearbyRecs([rec("self", north(0)), rec("other", north(0.3))], {
      stop,
      excludeRecIds: ["self"],
    });
    expect(r.map((i) => i.rec.id)).toEqual(["other"]);
  });

  test("recs without a resolvable location are skipped; Maps link coordinates count", () => {
    const r = stopNearbyRecs(
      [
        rec("none", {}),
        rec("zero", { latitude: 0, longitude: 0 }),
        rec("link", {
          google_maps_url: `https://www.google.com/maps/search/?api=1&query=${north(0.4).latitude},${BASE.lng}`,
        }),
      ],
      { stop },
    );
    expect(r.map((i) => i.rec.id)).toEqual(["link"]);
  });

  test("custom radius", () => {
    const r = stopNearbyRecs([rec("a", north(0.5)), rec("b", north(2.5))], { stop, maxKm: 3 });
    expect(r.map((i) => i.rec.id)).toEqual(["a", "b"]);
  });
});
