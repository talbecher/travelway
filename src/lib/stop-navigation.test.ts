// @ts-nocheck -- bun:test types are not installed; no new dependency needed.
import { describe, expect, test } from "bun:test";
import { canNavigate, navigationHref } from "./stop-navigation";

describe("navigationHref (moved unchanged from the Live Now card)", () => {
  test("coordinates → directions to the point", () => {
    expect(navigationHref({ title: "x", latitude: 35.1, longitude: 139.2 })).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=35.1,139.2",
    );
  });
  test("no coordinates → saved Maps link, then a name search", () => {
    expect(navigationHref({ title: "x", google_maps_url: "https://maps.google.com/?cid=1" })).toBe(
      "https://maps.google.com/?cid=1",
    );
    expect(navigationHref({ title: "מקדש סנסו-ג'י" })).toBe(
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent("מקדש סנסו-ג'י")}`,
    );
  });
  test("canNavigate needs coordinates or a Maps link", () => {
    expect(canNavigate({ title: "x" })).toBe(false);
    expect(canNavigate({ title: "x", latitude: 1, longitude: 2 })).toBe(true);
    expect(canNavigate({ title: "x", google_maps_url: "u" })).toBe(true);
  });
});
