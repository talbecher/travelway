// @ts-nocheck -- run with `bun test`; bun:test types are not installed for tsc
import { describe, expect, it } from "bun:test";
import { fmtDistance, geoFailureKind, haversine, nearestSavedPlaces } from "./geo";

const ME = { lat: 35.6595, lng: 139.7005 }; // Shibuya crossing

type P = {
  id: string;
  type: string;
  latitude: number | string | null;
  longitude: number | string | null;
  google_maps_url: string | null;
};
const p = (
  id: string,
  type: string,
  lat: P["latitude"],
  lng: P["longitude"],
  url: string | null = null,
): P => ({
  id,
  type,
  latitude: lat,
  longitude: lng,
  google_maps_url: url,
});

/** The home card's ranking as it was on main before this change (kept here for the regression check). */
function oldNearby(recs: P[], userPos: { lat: number; lng: number }, filter: string) {
  return recs
    .filter((r) => {
      if (r.latitude == null || r.longitude == null) return false;
      if (filter === "all") return true;
      return r.type === filter;
    })
    .map((r) => ({
      rec: r,
      distance: haversine(
        { lat: userPos.lat, lon: userPos.lng },
        { lat: Number(r.latitude), lon: Number(r.longitude) },
      ),
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 3);
}

const valid = [
  p("sky", "attraction", 35.6585, 139.7022),
  p("ichiran", "food", 35.6614, 139.7005),
  p("meiji", "attraction", 35.6764, 139.6993),
  p("hotel", "hotel", 35.6581, 139.7017),
  p("afuri", "food", "35.6655", "139.7120"), // numeric strings, as PostgREST may return
  p("senso", "attraction", 35.7148, 139.7967),
];

describe("fmtDistance", () => {
  it("shows metres below 1 km and kilometres from 1 km", () => {
    expect(fmtDistance(0.05)).toBe("50 מ׳");
    expect(fmtDistance(0.9994)).toBe("999 מ׳");
    expect(fmtDistance(1)).toBe("1.0 ק״מ");
    expect(fmtDistance(3.347)).toBe("3.3 ק״מ");
  });
  it("never shows 1000 metres", () => {
    expect(fmtDistance(0.9995)).toBe("1.0 ק״מ");
    expect(fmtDistance(0.9999)).toBe("1.0 ק״מ");
  });
});

describe("geoFailureKind", () => {
  it("separates a denied permission from other failures", () => {
    expect(geoFailureKind({ code: 1 })).toBe("denied");
    expect(geoFailureKind({ code: 2 })).toBe("unavailable");
    expect(geoFailureKind({ code: 3 })).toBe("unavailable");
    expect(geoFailureKind(null)).toBe("unavailable");
    expect(geoFailureKind(undefined)).toBe("unavailable");
  });
});

describe("nearestSavedPlaces", () => {
  it("regression: valid places keep main's order and distances for every filter", () => {
    for (const filter of ["all", "food", "attraction"]) {
      const before = oldNearby(valid, ME, filter);
      const after = nearestSavedPlaces(valid, ME, filter, 3);
      expect(after.map((x) => x.rec.id)).toEqual(before.map((x) => x.rec.id));
      after.forEach((x, i) => {
        expect(x.distance).toBeCloseTo(before[i].distance, 9);
        expect(fmtDistance(x.distance)).toBe(fmtDistance(before[i].distance));
      });
    }
  });
  it("includes a place that has only a Google Maps coordinate link", () => {
    const linkOnly = p(
      "link",
      "food",
      null,
      null,
      "https://www.google.com/maps/search/?api=1&query=35.6597,139.7006",
    );
    const r = nearestSavedPlaces([...valid, linkOnly], ME, "all", 3);
    expect(r[0].rec.id).toBe("link");
    expect(r[0].point).toEqual({ lat: 35.6597, lng: 139.7006 });
    expect(oldNearby([...valid, linkOnly], ME, "all").map((x) => x.rec.id)).not.toContain("link");
  });
  it("skips 0,0, swapped, out-of-range and non-numeric coordinates", () => {
    const bad = [
      p("zero", "food", 0, 0),
      p("swapped", "food", 139.7005, 35.6595),
      p("empty", "food", "", ""),
      p("text", "food", "abc", "def"),
      p("half", "food", 35.66, null),
    ];
    const r = nearestSavedPlaces([...bad, ...valid], ME, "all", 10);
    expect(r.map((x) => x.rec.id)).toEqual(
      nearestSavedPlaces(valid, ME, "all", 10).map((x) => x.rec.id),
    );
    // main ranked some of these with absurd distances
    expect(oldNearby([bad[0], bad[2]], ME, "all").map((x) => Math.round(x.distance))).toEqual([
      14265, 14265,
    ]);
  });
  it("keeps input order on equal distances and respects the limit", () => {
    const a = p("a", "food", 35.66, 139.7);
    const b = p("b", "food", 35.66, 139.7);
    expect(nearestSavedPlaces([a, b], ME, "food", 3).map((x) => x.rec.id)).toEqual(["a", "b"]);
    expect(nearestSavedPlaces(valid, ME, "all", 2)).toHaveLength(2);
  });
});
