import { describe, expect, it } from "vitest";
import {
  buildLocationRevisions,
  filterSavedPlaces,
  missingIndexes,
  validCoords,
  type SavedPlace,
} from "./proposal-location-fix";

const place: SavedPlace = {
  key: "rec:1",
  name: "Kuma Kafe",
  address: "Asakusa, Tokyo",
  latitude: 35.7148,
  longitude: 139.7967,
  google_maps_url: "https://www.google.com/maps/place/Kuma+Kafe",
  source: "recommendation",
};

const entries = [
  { title: "A", time_of_day: "09:00" },
  { title: "B", time_of_day: "11:00", latitude: 35.0, longitude: 135.0 },
  { title: "C", time_of_day: null },
];

describe("validCoords", () => {
  it("accepts a complete in-range pair", () => {
    expect(validCoords(35.7148, 139.7967)).toBe(true);
  });
  it("rejects partial, out-of-range and 0,0 pairs", () => {
    expect(validCoords(91, 0)).toBe(false);
    expect(validCoords(0, 181)).toBe(false);
    expect(validCoords(0, 0)).toBe(false);
    expect(validCoords("35.7", 139.7)).toBe(false);
    expect(validCoords(NaN, 10)).toBe(false);
  });
});

describe("missingIndexes", () => {
  it("returns only entries marked missing without coordinates", () => {
    expect(missingIndexes(entries, ["missing", "existing", "missing"])).toEqual([0, 2]);
    expect(missingIndexes(entries, ["ai", "existing", "existing"])).toEqual([]);
  });
  it("treats absent source as missing", () => {
    expect(missingIndexes([{ title: "A", time_of_day: null }], [])).toEqual([0]);
  });
});

describe("filterSavedPlaces", () => {
  it("matches name and address case-insensitively", () => {
    expect(filterSavedPlaces([place], "kuma")).toHaveLength(1);
    expect(filterSavedPlaces([place], "ASAKUSA")).toHaveLength(1);
    expect(filterSavedPlaces([place], "kyoto")).toHaveLength(0);
    expect(filterSavedPlaces([place], "  ")).toHaveLength(1);
  });
});

describe("buildLocationRevisions", () => {
  it("builds a revision for a picked missing entry", () => {
    const revs = buildLocationRevisions(entries, ["missing", "existing", "missing"], { 0: place });
    expect(revs).toEqual([
      {
        index: 0,
        latitude: 35.7148,
        longitude: 139.7967,
        google_maps_url: "https://www.google.com/maps/place/Kuma+Kafe",
      },
    ]);
  });
  it("skips entries that already have a location or a non-missing source", () => {
    expect(
      buildLocationRevisions(entries, ["missing", "existing", "missing"], { 1: place }),
    ).toEqual([]);
    expect(
      buildLocationRevisions(entries, ["ai", "existing", "missing"], { 0: place }),
    ).toEqual([]);
  });
  it("drops invalid coordinates and non-Google URLs", () => {
    const bad = { ...place, latitude: 0, longitude: 0 };
    expect(buildLocationRevisions(entries, ["missing", "existing", "missing"], { 0: bad })).toEqual([]);
    const badUrl = { ...place, google_maps_url: "http://evil.example/maps" };
    const revs = buildLocationRevisions(entries, ["missing", "existing", "missing"], { 0: badUrl });
    expect(revs).toEqual([{ index: 0, latitude: 35.7148, longitude: 139.7967 }]);
  });
  it("sorts revisions by index", () => {
    const revs = buildLocationRevisions(entries, ["missing", "existing", "missing"], {
      2: place,
      0: place,
    });
    expect(revs.map((r) => r.index)).toEqual([0, 2]);
  });
});
