// @ts-nocheck -- run with `bun test`; bun:test types are not installed for tsc
import { describe, expect, it } from "bun:test";
import {
  autoMatchSaved,
  buildLocationRevisions,
  filterSavedPlaces,
  googleMapsPlaceUrl,
  MAX_GOOGLE_RESULTS,
  mergePlaceResults,
  missingIndexes,
  prefillQuery,
  savedFromGooglePlace,
  validCoords,
  type GoogleSuggestion,
  type SavedPlace,
} from "./proposal-location-fix";
import { explicitMapsCoordinates } from "./day-location";

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

describe("filterSavedPlaces with a full location text", () => {
  const hotel: SavedPlace = {
    ...place,
    key: "hotel:1",
    name: "Hotel Resol Kyoto Shijo Muromachi",
    address: null,
    source: "hotel",
  };
  const station: SavedPlace = {
    ...place,
    key: "rec:2",
    name: "Kawaguchiko Station",
    address: "Fujikawaguchiko",
  };
  it("finds a saved place when the query contains its name plus a city suffix", () => {
    expect(filterSavedPlaces([hotel, station], "Hotel Resol Kyoto Shijo Muromachi, Kyoto")).toEqual(
      [hotel],
    );
    expect(filterSavedPlaces([hotel, station], "Kawaguchiko Station, Fujikawaguchiko")).toEqual([
      station,
    ]);
  });
  it("ignores case and punctuation in both directions", () => {
    expect(filterSavedPlaces([station], "kawaguchiko-station")).toHaveLength(1);
    expect(filterSavedPlaces([station], "KAWAGUCHIKO")).toHaveLength(1);
  });
  it("does not match a very short saved name inside a longer query", () => {
    const short: SavedPlace = { ...place, key: "rec:3", name: "Ko", address: null };
    expect(filterSavedPlaces([short], "Kawaguchiko Station")).toHaveLength(0);
  });
});

describe("autoMatchSaved", () => {
  const hotel: SavedPlace = {
    ...place,
    key: "hotel:1",
    name: "Hotel Resol Kyoto Shijo Muromachi",
    address: null,
    source: "hotel",
    latitude: 35.0,
    longitude: 135.76,
  };
  const station: SavedPlace = {
    ...place,
    key: "rec:2",
    name: "Kawaguchiko Station",
    address: null,
    latitude: 35.49,
    longitude: 138.76,
  };
  const ramen: SavedPlace = { ...place, key: "rec:4", name: "Ichiran", address: null };
  const saved = [hotel, station, ramen];
  const run = (es, sv = saved, picks = {}) =>
    autoMatchSaved(
      es,
      es.map((_, i) => i),
      sv,
      picks,
    );

  it("matches an exact location_name (normalised)", () => {
    expect(run([{ title: "ארוחה", location_name: "ichiran" }])).toEqual({ 0: ramen });
    expect(run([{ title: "x", location_name: "  KAWAGUCHIKO   station. " }])).toEqual({
      0: station,
    });
  });
  it("matches a location_name with a city suffix after a comma", () => {
    expect(
      run([{ title: "צ'ק אין", location_name: "Hotel Resol Kyoto Shijo Muromachi, Kyoto" }]),
    ).toEqual({ 0: hotel });
    expect(run([{ title: "רכבת", location_name: "Kawaguchiko Station, Fujikawaguchiko" }])).toEqual(
      { 0: station },
    );
    expect(
      run([{ title: "רכבת", location_name: "Kawaguchiko Station, Fujikawaguchiko, Yamanashi" }]),
    ).toEqual({ 0: station });
  });
  it("matches a hotel and a recommendation separately", () => {
    const r = run([
      { title: "לינה", location_name: "Hotel Resol Kyoto Shijo Muromachi, Kyoto" },
      { title: "Kawaguchiko Station", location_name: null },
    ]);
    expect(r[0].source).toBe("hotel");
    expect(r[1].source).toBe("recommendation");
  });
  it("does not pick when two saved places match", () => {
    const twin: SavedPlace = { ...station, key: "rec:9" };
    expect(run([{ title: "x", location_name: "Kawaguchiko Station" }], [station, twin])).toEqual(
      {},
    );
  });
  it("does not pick when a hotel and a recommendation share the name", () => {
    const recCopy: SavedPlace = { ...hotel, key: "rec:7", source: "recommendation" };
    expect(
      run(
        [{ title: "x", location_name: "Hotel Resol Kyoto Shijo Muromachi, Kyoto" }],
        [hotel, recCopy],
      ),
    ).toEqual({});
  });
  it("does not use the suffix rule or the title for short or generic names", () => {
    const generic: SavedPlace = { ...place, key: "rec:5", name: "Station", address: null };
    expect(run([{ title: "x", location_name: "Station, Kyoto" }], [generic])).toEqual({});
    expect(run([{ title: "Station", location_name: null }], [generic])).toEqual({});
    expect(run([{ title: "Ichiran", location_name: null }], [ramen])).toEqual({});
    expect(run([{ title: "x", location_name: "Ichiran, Shibuya" }], [ramen])).toEqual({});
  });
  it("never matches partially or fuzzily", () => {
    expect(run([{ title: "x", location_name: "Kawaguchiko" }])).toEqual({});
    expect(run([{ title: "x", location_name: "Kawaguchiko Station Hotel" }])).toEqual({});
    expect(
      run([{ title: "x", location_name: "Kyoto, Hotel Resol Kyoto Shijo Muromachi" }]),
    ).toEqual({});
  });
  it("does not match Hebrew against an English saved name", () => {
    expect(run([{ title: "תחנת קוואגוצ'יקו", location_name: "תחנת קוואגוצ'יקו" }])).toEqual({});
  });
  it("only touches missing stops without an existing pick", () => {
    const es = [
      { title: "a", location_name: "Ichiran" },
      { title: "b", location_name: "Ichiran" },
      { title: "c", location_name: "Ichiran" },
    ];
    expect(autoMatchSaved(es, [0, 2], saved, { 2: station })).toEqual({ 0: ramen });
  });
  it("skips saved places with unusable coordinates and Google picks", () => {
    const noCoords: SavedPlace = { ...ramen, latitude: 0, longitude: 0 };
    const g: SavedPlace = { ...ramen, key: "google:x", source: "google" };
    expect(run([{ title: "x", location_name: "Ichiran" }], [noCoords])).toEqual({});
    expect(run([{ title: "x", location_name: "Ichiran" }], [g])).toEqual({});
  });
  it("feeds buildLocationRevisions only for missing stops without coordinates", () => {
    const es = [
      {
        title: "a",
        time_of_day: "09:00",
        location_name: "Hotel Resol Kyoto Shijo Muromachi, Kyoto",
      },
      { title: "b", time_of_day: "10:00", location_name: "Ichiran", latitude: 35, longitude: 135 },
      { title: "c", time_of_day: null, location_name: "Kawaguchiko Station" },
    ];
    const sources = ["missing", "existing", "missing"];
    const picks = autoMatchSaved(es, missingIndexes(es, sources), saved);
    expect(Object.keys(picks)).toEqual(["0", "2"]);
    expect(buildLocationRevisions(es, sources, picks)).toEqual([
      { index: 0, latitude: 35.0, longitude: 135.76, google_maps_url: place.google_maps_url },
      { index: 2, latitude: 35.49, longitude: 138.76, google_maps_url: place.google_maps_url },
    ]);
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
    expect(buildLocationRevisions(entries, ["ai", "existing", "missing"], { 0: place })).toEqual(
      [],
    );
  });
  it("drops invalid coordinates and non-Google URLs", () => {
    const bad = { ...place, latitude: 0, longitude: 0 };
    expect(buildLocationRevisions(entries, ["missing", "existing", "missing"], { 0: bad })).toEqual(
      [],
    );
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

const PID = "ChIJ8T1GpMGOGGARDYGSgpooDWw";
const g = (placeId: string, main = placeId): GoogleSuggestion => ({
  placeId,
  main,
  secondary: "Tokyo",
});

describe("mergePlaceResults", () => {
  const hotel: SavedPlace = { ...place, key: "hotel:1", name: "Hotel", source: "hotel" };

  it("puts saved places first, in their order, then Google results", () => {
    const out = mergePlaceResults([place, hotel], [g("pid_aaaaa"), g("pid_bbbbb")]);
    expect(
      out.map((o) => (o.kind === "saved" ? o.place.key : `g:${o.suggestion.placeId}`)),
    ).toEqual(["rec:1", "hotel:1", "g:pid_aaaaa", "g:pid_bbbbb"]);
  });

  it("hides a Google result only when its placeId equals a saved provider_place_id", () => {
    const savedWithId = { ...place, provider_place_id: PID };
    const out = mergePlaceResults(
      [savedWithId],
      [g(PID, "Kuma Kafe"), g("pid_other", "Kuma Kafe")],
    );
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ kind: "saved", place: savedWithId });
    // Same name, different id: kept (no name matching by design).
    expect(out[1]).toEqual({ kind: "google", suggestion: g("pid_other", "Kuma Kafe") });
  });

  it("does not treat saved places without provider_place_id as duplicates", () => {
    const out = mergePlaceResults([{ ...place, provider_place_id: null }], [g(PID)]);
    expect(out.map((o) => o.kind)).toEqual(["saved", "google"]);
  });

  it("drops repeated Google ids and empty ids", () => {
    const out = mergePlaceResults([], [g("pid_aaaaa"), g("pid_aaaaa"), g("")]);
    expect(out).toHaveLength(1);
  });

  it(`caps Google results at ${MAX_GOOGLE_RESULTS} (after removing duplicates)`, () => {
    const many = ["dup_id_1", "p_00001", "p_00002", "p_00003", "p_00004", "p_00005", "p_00006"].map(
      (id) => g(id),
    );
    const out = mergePlaceResults([{ ...place, provider_place_id: "dup_id_1" }], many);
    const google = out.filter((o) => o.kind === "google");
    expect(google).toHaveLength(MAX_GOOGLE_RESULTS);
    expect(google[0]).toEqual({ kind: "google", suggestion: g("p_00001") });
  });

  it("handles empty results on either side", () => {
    expect(mergePlaceResults([], [])).toEqual([]);
    expect(mergePlaceResults([place], [])).toEqual([{ kind: "saved", place }]);
    expect(mergePlaceResults([], [g("pid_aaaaa")])).toHaveLength(1);
  });

  it("keeps saved places when Google failed (null)", () => {
    expect(mergePlaceResults([place, hotel], null)).toEqual([
      { kind: "saved", place },
      { kind: "saved", place: hotel },
    ]);
    expect(mergePlaceResults([], null)).toEqual([]);
  });
});

describe("prefillQuery", () => {
  it("prefers location_name, trimmed", () => {
    expect(prefillQuery({ title: "Lunch", location_name: "  Kuma Kafe " })).toBe("Kuma Kafe");
  });
  it("falls back to the title when location_name is missing or blank", () => {
    expect(prefillQuery({ title: " Senso-ji ", location_name: null })).toBe("Senso-ji");
    expect(prefillQuery({ title: "Senso-ji", location_name: "   " })).toBe("Senso-ji");
    expect(prefillQuery({ title: "Senso-ji" })).toBe("Senso-ji");
  });
});

describe("googleMapsPlaceUrl / savedFromGooglePlace", () => {
  it("builds a coordinate link with the Google place id", () => {
    expect(googleMapsPlaceUrl(35.7148, 139.7967, PID)).toBe(
      `https://www.google.com/maps/search/?api=1&query=35.7148,139.7967&query_place_id=${PID}`,
    );
  });
  it("is read back by the app's location resolver as the same coordinates", () => {
    expect(explicitMapsCoordinates(googleMapsPlaceUrl(35.7148, 139.7967, PID))).toEqual({
      lat: 35.7148,
      lng: 139.7967,
    });
  });
  it("omits a malformed place id but keeps the coordinates", () => {
    expect(googleMapsPlaceUrl(35.7, 139.7, "bad id!")).toBe(
      "https://www.google.com/maps/search/?api=1&query=35.7,139.7",
    );
  });
  it("converts details into a pick that saves through the same revision path", () => {
    const pick = savedFromGooglePlace({
      id: PID,
      name: "Senso-ji",
      address: "Asakusa",
      latitude: 35.7148,
      longitude: 139.7967,
    });
    expect(pick).toEqual({
      key: `google:${PID}`,
      name: "Senso-ji",
      address: "Asakusa",
      latitude: 35.7148,
      longitude: 139.7967,
      google_maps_url: `https://www.google.com/maps/search/?api=1&query=35.7148,139.7967&query_place_id=${PID}`,
      source: "google",
      provider_place_id: PID,
    });
    expect(
      buildLocationRevisions(entries, ["missing", "existing", "missing"], { 0: pick! }),
    ).toEqual([
      { index: 0, latitude: 35.7148, longitude: 139.7967, google_maps_url: pick!.google_maps_url },
    ]);
  });
  it("rejects unusable coordinates or ids", () => {
    expect(
      savedFromGooglePlace({ id: PID, name: "X", address: "", latitude: 0, longitude: 0 }),
    ).toBeNull();
    expect(
      savedFromGooglePlace({ id: "x", name: "X", address: "", latitude: 35, longitude: 139 }),
    ).toBeNull();
  });
});
