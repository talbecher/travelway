// @ts-nocheck -- bun:test types are not installed; no new dependency needed.
import { describe, expect, test } from "bun:test";
import { DAY_NEARBY_RECS_KM, dayHotelAnchors, dayNearbyRecs } from "./day-nearby-recs";

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

describe("dayNearbyRecs", () => {
  test("empty day: no stops, no hotel → no anchors, nothing shown", () => {
    const r = dayNearbyRecs([rec("a", north(0.2))], {
      stops: [],
      hotelAnchors: [],
      linkedRecIds: [],
    });
    expect(r.anchorKind).toBe("none");
    expect(r.items).toEqual([]);
  });

  test("hotel-only day: the night's hotel becomes the anchor", () => {
    const hotels = [
      {
        id: "h0",
        hotel_name: "Old",
        checkin_date: "2026-11-10",
        checkout_date: "2026-11-12",
        latitude: 0,
        longitude: 0,
      },
      {
        id: "h1",
        hotel_name: "Ryokan",
        checkin_date: "2026-11-18",
        checkout_date: "2026-11-20",
        latitude: BASE.lat,
        longitude: BASE.lng,
      },
    ];
    const hotelAnchors = dayHotelAnchors(hotels, "2026-11-19");
    expect(hotelAnchors.map((h) => h.id)).toEqual(["h1"]);
    // checkout day is not a night at that hotel
    expect(dayHotelAnchors(hotels, "2026-11-20")).toEqual([]);
    const r = dayNearbyRecs([rec("a", north(0.5)), rec("far", north(3))], {
      stops: [],
      hotelAnchors,
      linkedRecIds: [],
    });
    expect(r.anchorKind).toBe("hotel");
    expect(r.items.map((i) => i.rec.id)).toEqual(["a"]);
    expect(r.items[0].nearest).toMatchObject({ id: "h1", kind: "hotel", title: "Ryokan" });
  });

  test("located stops win over the hotel", () => {
    const hotelAnchors = [
      { id: "h", title: "H", lat: BASE.lat + 1, lng: BASE.lng, kind: "hotel" as const },
    ];
    const r = dayNearbyRecs([rec("a", north(0.3))], {
      stops: [stop],
      hotelAnchors,
      linkedRecIds: [],
    });
    expect(r.anchorKind).toBe("stops");
    expect(r.items[0].nearest.id).toBe("s1");
  });

  test("a recommendation already in the day is left out", () => {
    const r = dayNearbyRecs([rec("in-day", north(0.1)), rec("b", north(0.2))], {
      stops: [stop],
      hotelAnchors: [],
      linkedRecIds: ["in-day"],
    });
    expect(r.items.map((i) => i.rec.id)).toEqual(["b"]);
  });

  test("1.5 km boundary: inside kept, just outside dropped, nearest stop reported", () => {
    const second = { id: "s2", title: "Gion", lat: BASE.lat + 5 * KM_LAT, lng: BASE.lng };
    const r = dayNearbyRecs(
      [
        rec("in", north(1.49)),
        rec("out", north(1.51)),
        rec("edge", north(DAY_NEARBY_RECS_KM - 1e-9)),
        rec("near2", north(4.6)),
      ],
      { stops: [stop, second], hotelAnchors: [], linkedRecIds: [] },
    );
    expect(r.items.map((i) => i.rec.id)).toEqual(["near2", "in", "edge"]);
    const near2 = r.items.find((i) => i.rec.id === "near2")!;
    expect(near2.nearest.id).toBe("s2");
    expect(near2.km).toBeCloseTo(0.4, 6);
  });

  test("recommendation without a location (or 0,0 / invalid) is left out; a Maps link with coordinates counts", () => {
    const r = dayNearbyRecs(
      [
        rec("none", {}),
        rec("zero", { latitude: 0, longitude: 0 }),
        rec("bad", { latitude: "abc", longitude: 135 }),
        rec("viewport", {
          google_maps_url: `https://www.google.com/maps/@${BASE.lat},${BASE.lng},15z`,
        }),
        rec("link", {
          google_maps_url: `https://www.google.com/maps/search/?api=1&query=${BASE.lat + 0.001},${BASE.lng}`,
        }),
      ],
      { stops: [stop], hotelAnchors: [], linkedRecIds: [] },
    );
    expect(r.items.map((i) => i.rec.id)).toEqual(["link"]);
  });

  test("stops with invalid coordinates are not anchors", () => {
    const r = dayNearbyRecs([rec("a", { latitude: 0.001, longitude: 0 })], {
      stops: [{ id: "z", title: "z", lat: 0, lng: 0 }],
      hotelAnchors: [],
      linkedRecIds: [],
    });
    expect(r.anchorKind).toBe("none");
    expect(r.items).toEqual([]);
  });
});
