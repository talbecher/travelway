// @ts-nocheck -- run with `bun test`; bun:test types are not installed for tsc
import { describe, expect, it } from "bun:test";
import { nearbyPlaceSheetModel } from "./nearby-place-sheet";

const POINT = { lat: 35.6595, lng: 139.7005 };

describe("nearbyPlaceSheetModel", () => {
  it("full place: name, type, distance, description, navigate and the old Maps link", () => {
    const m = nearbyPlaceSheetModel(
      {
        name: "Ichiran",
        type: "food",
        notes: "  ramen, open late  ",
        google_maps_url: "https://maps.app.goo.gl/abc",
      },
      POINT,
      0.42,
    );
    expect(m.name).toBe("Ichiran");
    expect(m.typeLabel).toBe("🍜 אוכל");
    expect(m.distanceText).toBe("420 מ׳");
    expect(m.description).toBe("ramen, open late");
    expect(m.navigateHref).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=35.6595,139.7005",
    );
    expect(m.openMapHref).toBe("https://maps.app.goo.gl/abc");
  });

  it("no Maps link: the secondary link is the coordinate search the row used to open", () => {
    const m = nearbyPlaceSheetModel(
      { name: "Shrine", type: "attraction", notes: null },
      POINT,
      1.25,
    );
    expect(m.typeLabel).toBe("⛩ אטרקציה");
    expect(m.distanceText).toBe("1.3 ק״מ");
    expect(m.openMapHref).toBe("https://www.google.com/maps/search/?api=1&query=35.6595,139.7005");
  });

  it("no description: description is null (blank notes too)", () => {
    expect(
      nearbyPlaceSheetModel({ name: "A", type: "food", notes: "   " }, POINT, 1).description,
    ).toBeNull();
    expect(nearbyPlaceSheetModel({ name: "A", type: "food" }, POINT, 1).description).toBeNull();
  });

  it("no location and no link: no distance, no navigate, no map link", () => {
    const m = nearbyPlaceSheetModel({ name: "Somewhere", type: "hotel", notes: "x" }, null, null);
    expect(m.typeLabel).toBe("🏨 לינה");
    expect(m.distanceText).toBeNull();
    expect(m.navigateHref).toBeNull();
    expect(m.openMapHref).toBeNull();
  });

  it("no location but a Maps link: navigate uses the link and the duplicate secondary is dropped", () => {
    const m = nearbyPlaceSheetModel(
      { name: "B", type: "food", google_maps_url: "https://maps.app.goo.gl/xyz" },
      null,
      null,
    );
    expect(m.navigateHref).toBe("https://maps.app.goo.gl/xyz");
    expect(m.openMapHref).toBeNull();
  });

  it("unknown type: no type label", () => {
    expect(nearbyPlaceSheetModel({ name: "C", type: "other" }, POINT, 1).typeLabel).toBeNull();
  });
});
