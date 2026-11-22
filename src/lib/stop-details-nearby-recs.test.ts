// @ts-nocheck -- bun:test types are not installed; no new dependency needed.
import { describe, expect, test } from "bun:test";
import { STOP_DETAILS_NEARBY_LIMIT, stopDetailsNearbyRecs } from "./day-nearby-recs";

// 1 km of latitude on the haversine sphere (R = 6371 km).
const KM_LAT = 180 / (Math.PI * 6371);
const BASE = { lat: 35.0, lng: 135.75 };
const north = (km: number) => ({ latitude: BASE.lat + km * KM_LAT, longitude: BASE.lng });
const stop = { id: "s1", title: "Kiyomizu", entryType: "attraction", lat: BASE.lat, lng: BASE.lng };
const rec = (id: string, loc: object) => ({ id, name: id, type: "food", ...loc });

describe("stopDetailsNearbyRecs", () => {
  test("limit is 5, nearest first", () => {
    const recs = [0.9, 0.1, 0.5, 0.3, 0.7, 0.2, 1.1].map((km) => rec(`r${km}`, north(km)));
    const r = stopDetailsNearbyRecs(recs, { stop });
    expect(STOP_DETAILS_NEARBY_LIMIT).toBe(5);
    expect(r.map((i) => i.rec.id)).toEqual(["r0.1", "r0.2", "r0.3", "r0.5", "r0.7"]);
  });

  test("same 1.5 km radius as the day/home layers", () => {
    const r = stopDetailsNearbyRecs([rec("in", north(1.4)), rec("out", north(1.6))], { stop });
    expect(r.map((i) => i.rec.id)).toEqual(["in"]);
  });

  test("the stop's own linked recommendation is excluded", () => {
    const r = stopDetailsNearbyRecs([rec("self", north(0)), rec("other", north(0.3))], {
      stop,
      linkedRecId: "self",
    });
    expect(r.map((i) => i.rec.id)).toEqual(["other"]);
  });

  test("stop without a location → nothing", () => {
    expect(stopDetailsNearbyRecs([rec("a", north(0.1))], { stop: null })).toEqual([]);
  });

  test("notes → nothing, even with coordinates", () => {
    const r = stopDetailsNearbyRecs([rec("a", north(0.1))], {
      stop: { ...stop, entryType: "note" },
    });
    expect(r).toEqual([]);
  });

  test("recs without a resolvable location are skipped", () => {
    const r = stopDetailsNearbyRecs([rec("none", {}), rec("ok", north(0.2))], { stop });
    expect(r.map((i) => i.rec.id)).toEqual(["ok"]);
  });

  test("custom / zero limit", () => {
    const recs = [rec("a", north(0.1)), rec("b", north(0.2))];
    expect(stopDetailsNearbyRecs(recs, { stop, limit: 1 }).map((i) => i.rec.id)).toEqual(["a"]);
    expect(stopDetailsNearbyRecs(recs, { stop, limit: 0 })).toEqual([]);
  });

  test("keeps distance and nearest anchor", () => {
    const [first] = stopDetailsNearbyRecs([rec("a", north(1))], { stop });
    expect(first.km).toBeCloseTo(1, 5);
    expect(first.nearest).toMatchObject({ id: "s1", kind: "stop" });
  });
});
