// @ts-expect-error -- matches the existing dependency-free bun test suite.
import { describe, expect, it } from "bun:test";
import { weatherForecastUrl } from "./weather";

describe("weatherForecastUrl", () => {
  it("pins Japan coordinates in path and map centre, lat before lon", () => {
    expect(weatherForecastUrl(35.36056, 138.72778)).toBe(
      "https://www.windy.com/35.36056/138.72778?35.36056,138.72778,11",
    );
  });

  it("keeps negative signs for western and southern hemispheres", () => {
    // Rio de Janeiro (south + west)
    expect(weatherForecastUrl(-22.90642, -43.18223)).toBe(
      "https://www.windy.com/-22.90642/-43.18223?-22.90642,-43.18223,11",
    );
    // New York (west)
    expect(weatherForecastUrl(40.71427, -74.00597)).toBe(
      "https://www.windy.com/40.71427/-74.00597?40.71427,-74.00597,11",
    );
    // Sydney (south)
    expect(weatherForecastUrl(-33.86785, 151.20732)).toBe(
      "https://www.windy.com/-33.86785/151.20732?-33.86785,151.20732,11",
    );
  });

  it("never uses a place name and never emits exponent or -0", () => {
    expect(weatherForecastUrl(0.0000001, -0)).toBe("https://www.windy.com/0/0?0,0,11");
    expect(weatherForecastUrl(35.123456789, 138.987654321)).toBe(
      "https://www.windy.com/35.123457/138.987654?35.123457,138.987654,11",
    );
  });

  it("returns null for missing or invalid coordinates", () => {
    expect(weatherForecastUrl(null, 138.7)).toBeNull();
    expect(weatherForecastUrl(35.3, undefined)).toBeNull();
    expect(weatherForecastUrl(Number.NaN, 138.7)).toBeNull();
    expect(weatherForecastUrl(35.3, Number.POSITIVE_INFINITY)).toBeNull();
    expect(weatherForecastUrl(138.7, 35.3)).toBeNull(); // swapped: lat out of range
    expect(weatherForecastUrl(35.3, 181)).toBeNull();
  });
});
