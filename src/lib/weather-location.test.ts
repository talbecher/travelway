// @ts-expect-error -- matches the existing dependency-free bun test suite.
import { describe, expect, it } from "bun:test";
import {
  dayWeatherPoint,
  pickGeocodeResult,
  tripCountryCode,
  weatherQueryName,
} from "./weather-location";

// Real Open-Meteo answer for name=Mount Fuji (count=1/10, language=en): only this result.
const WISCONSIN = { latitude: 42.62502, longitude: -88.4501, country_code: "US" };
const FUJI_CITY = { latitude: 35.16667, longitude: 138.68333, country_code: "JP" };

describe("weatherQueryName", () => {
  it("keeps the first part before a spaced hyphen or dash", () => {
    expect(weatherQueryName("Mount Fuji - Kawaguchiko")).toBe("Mount Fuji");
    expect(weatherQueryName("Kyoto – Nara")).toBe("Kyoto");
    expect(weatherQueryName("Tokyo — Shinjuku · Day 2")).toBe("Tokyo");
    expect(weatherQueryName("טוקיו - קיוטו")).toBe("טוקיו");
    expect(weatherQueryName("Shinjuku, Tokyo")).toBe("Shinjuku");
  });
  it("keeps hyphenated names and plain names intact", () => {
    expect(weatherQueryName("Mount Fuji")).toBe("Mount Fuji");
    expect(weatherQueryName("Saint-Tropez")).toBe("Saint-Tropez");
    expect(weatherQueryName("  ")).toBeNull();
    expect(weatherQueryName(null)).toBeNull();
  });
});

describe("tripCountryCode", () => {
  it("maps Hebrew, English and codes", () => {
    expect(tripCountryCode("יפן")).toBe("JP");
    expect(tripCountryCode("Japan")).toBe("JP");
    expect(tripCountryCode("jp")).toBe("JP");
    expect(tripCountryCode('ארה"ב')).toBe("US");
    expect(tripCountryCode("יפן, קוריאה")).toBe("JP");
    expect(tripCountryCode("ארץ לא ידועה")).toBeNull();
    expect(tripCountryCode(null)).toBeNull();
  });
});

describe("pickGeocodeResult", () => {
  it("never returns the Wisconsin hit for a Japan trip", () => {
    expect(pickGeocodeResult([WISCONSIN], "JP")).toBeNull();
    expect(pickGeocodeResult([WISCONSIN, FUJI_CITY], "JP")).toEqual({
      lat: 35.16667,
      lng: 138.68333,
    });
    expect(pickGeocodeResult([WISCONSIN, FUJI_CITY], "jp")).toEqual({
      lat: 35.16667,
      lng: 138.68333,
    });
  });
  it("uses the first hit only when the country is unknown", () => {
    expect(pickGeocodeResult([WISCONSIN, FUJI_CITY], null)).toEqual({
      lat: 42.62502,
      lng: -88.4501,
    });
    expect(pickGeocodeResult([], "JP")).toBeNull();
    expect(pickGeocodeResult(undefined, null)).toBeNull();
  });
});

describe("dayWeatherPoint", () => {
  const fujiStop = {
    entry_type: "attraction",
    latitude: 35.36056,
    longitude: 138.72778,
    recommendations: { city: "Mount Fuji" },
  };
  const tokyoStop = {
    entry_type: "food",
    latitude: "35.6895",
    longitude: "139.69171",
    recommendations: { city: "Tokyo" },
  };
  const hotel = { latitude: 35.49, longitude: 138.69 };

  it("prefers the stop whose city is the chip label", () => {
    expect(dayWeatherPoint([tokyoStop, fujiStop], hotel, "Mount Fuji")).toEqual({
      lat: 35.36056,
      lng: 138.72778,
    });
  });
  it("falls back to the first located stop, then tonight's hotel", () => {
    expect(dayWeatherPoint([tokyoStop, fujiStop], hotel, "Elsewhere")).toEqual({
      lat: 35.6895,
      lng: 139.69171,
    });
    expect(
      dayWeatherPoint([{ entry_type: "note", latitude: 1, longitude: 1 }], hotel, null),
    ).toEqual({ lat: 35.49, lng: 138.69 });
  });
  it("reads a linked recommendation or an explicit maps URL", () => {
    const linked = {
      entry_type: "attraction",
      recommendations: { city: "Mount Fuji", latitude: 35.3606, longitude: 138.7274 },
    };
    expect(dayWeatherPoint([linked], null, "Mount Fuji")).toEqual({ lat: 35.3606, lng: 138.7274 });
    const url = {
      entry_type: "attraction",
      google_maps_url: "https://www.google.com/maps/search/?api=1&query=35.36,138.73",
    };
    expect(dayWeatherPoint([url], null, null)).toEqual({ lat: 35.36, lng: 138.73 });
  });
  it("skips flights and returns null when nothing is located", () => {
    expect(
      dayWeatherPoint([{ entry_type: "flight", latitude: 32.0, longitude: 34.8 }], null, null),
    ).toBeNull();
    expect(dayWeatherPoint([], null, "Mount Fuji")).toBeNull();
  });
});
