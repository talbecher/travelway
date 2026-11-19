// @ts-nocheck -- bun:test types are not installed; no new dependency needed.
import { describe, expect, test } from "bun:test";
import { collectRouteStops, routeDaysLabel } from "./nearby-route-stops";

const days = [
  { id: "d2", day_number: 2 },
  { id: "d1", day_number: 1 },
  { id: "d3", day_number: 3 },
];
const stop = (id: string, day_id: string, extra: Record<string, unknown> = {}) => ({
  id,
  day_id,
  title: id,
  latitude: null,
  longitude: null,
  linked_recommendation_id: null,
  ...extra,
});

describe("collectRouteStops", () => {
  test("located stops from every day become points labelled with their day", () => {
    const { stops, recDays } = collectRouteStops(
      {
        d1: [stop("Senso-ji", "d1", { latitude: 35.7148, longitude: 139.7967 })],
        d3: [stop("Fushimi", "d3", { latitude: "34.9671", longitude: "135.7727" })],
      },
      days,
      [],
    );
    expect(stops.map((s) => [s.id, s.title, s.dayNumbers])).toEqual([
      ["stop:Senso-ji", "Senso-ji", [1]],
      ["stop:Fushimi", "Fushimi", [3]],
    ]);
    expect(stops[1].point).toEqual({ lat: 34.9671, lng: 135.7727 });
    expect(recDays.size).toBe(0);
  });

  test("a stop linked to a located recommendation is not duplicated; the rec gets the days", () => {
    const recs = [{ id: "r1", latitude: 35.0, longitude: 135.0 }];
    const { stops, recDays } = collectRouteStops(
      {
        d2: [
          stop("Ramen", "d2", { latitude: 35.0, longitude: 135.0, linked_recommendation_id: "r1" }),
        ],
        d1: [stop("Ramen again", "d1", { linked_recommendation_id: "r1" })],
      },
      days,
      recs,
    );
    expect(stops).toEqual([]);
    expect(recDays.get("r1")).toEqual([1, 2]);
  });

  test("linked recommendation without a location: the stop is shown with its own location", () => {
    const { stops, recDays } = collectRouteStops(
      {
        d1: [
          stop("Cafe", "d1", { latitude: 35.1, longitude: 139.1, linked_recommendation_id: "r1" }),
        ],
      },
      days,
      [{ id: "r1", latitude: null, longitude: null }],
    );
    expect(stops.map((s) => s.title)).toEqual(["Cafe"]);
    expect(recDays.size).toBe(0);
  });

  test("uses the day-screen resolver: Maps link coordinates, then the linked rec's location", () => {
    const { stops } = collectRouteStops(
      {
        d1: [
          stop("Link only", "d1", {
            google_maps_url: "https://www.google.com/maps/search/?api=1&query=35.5,139.5",
          }),
          stop("Viewport only", "d1", {
            google_maps_url: "https://www.google.com/maps/@35.6,139.6,15z",
          }),
        ],
      },
      days,
      [],
    );
    expect(stops.map((s) => [s.title, s.point])).toEqual([
      ["Link only", { lat: 35.5, lng: 139.5 }],
    ]);
  });

  test("skips notes, unlocated stops, 0,0 and days outside the version", () => {
    const { stops } = collectRouteStops(
      {
        d1: [
          stop("Note", "d1", { entry_type: "note", latitude: 35, longitude: 139 }),
          stop("Nowhere", "d1"),
          stop("Zero", "d1", { latitude: 0, longitude: 0 }),
        ],
        other: [stop("Other version", "other", { latitude: 35, longitude: 139 })],
      },
      days,
      [],
    );
    expect(stops).toEqual([]);
  });

  test("the same place on several days is one point with all days", () => {
    const hotel = { latitude: 35.68, longitude: 139.76 };
    const { stops } = collectRouteStops(
      {
        d3: [stop("Hotel", "d3", hotel)],
        d1: [stop("Hotel", "d1", hotel)],
        d2: [stop("hotel ", "d2", hotel), stop("Station", "d2", hotel)],
      },
      days,
      [],
    );
    expect(stops.map((s) => [s.title, s.dayNumbers, s.dayIds])).toEqual([
      ["Hotel", [1, 2, 3], ["d1", "d2", "d3"]],
      ["Station", [2], ["d2"]],
    ]);
  });
});

describe("routeDaysLabel", () => {
  test("one day / several days", () => {
    expect(routeDaysLabel([4])).toBe("במסלול · יום 4");
    expect(routeDaysLabel([1, 3])).toBe("במסלול · ימים 1, 3");
  });
});
