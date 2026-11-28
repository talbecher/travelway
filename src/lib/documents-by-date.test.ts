// @ts-nocheck -- run with `bun test`; bun:test types are not installed (no new deps).
import { describe, expect, test } from "bun:test";
import {
  addDaysToKey,
  dateKeyInTimeZone,
  docDateKey,
  documentsOnDate,
  filterDateKey,
  filterDocumentsByDate,
  TRIP_TIME_ZONE,
} from "./documents-by-date";

const doc = (id, valid_date) => ({ id, valid_date });

describe("dateKeyInTimeZone", () => {
  test("uses Asia/Tokyo, not UTC", () => {
    expect(TRIP_TIME_ZONE).toBe("Asia/Tokyo");
    // 2026-11-28 20:30 UTC = 2026-11-29 05:30 in Tokyo.
    expect(dateKeyInTimeZone(new Date("2026-11-28T20:30:00Z"))).toBe("2026-11-29");
    // 2026-11-28 14:59 UTC = 23:59 in Tokyo, still the 28th.
    expect(dateKeyInTimeZone(new Date("2026-11-28T14:59:00Z"))).toBe("2026-11-28");
    // 15:00 UTC = Tokyo midnight → the 29th.
    expect(dateKeyInTimeZone(new Date("2026-11-28T15:00:00Z"))).toBe("2026-11-29");
  });
  test("other zones when asked", () => {
    expect(dateKeyInTimeZone(new Date("2026-11-28T20:30:00Z"), "UTC")).toBe("2026-11-28");
  });
});

describe("addDaysToKey", () => {
  test("rolls month and year", () => {
    expect(addDaysToKey("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDaysToKey("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysToKey("2028-02-28", 1)).toBe("2028-02-29");
  });
});

describe("docDateKey", () => {
  test("date, timestamp prefix, empty and junk", () => {
    expect(docDateKey("2026-11-28")).toBe("2026-11-28");
    expect(docDateKey("2026-11-28T10:00:00")).toBe("2026-11-28");
    expect(docDateKey(null)).toBe(null);
    expect(docDateKey("")).toBe(null);
    expect(docDateKey("soon")).toBe(null);
  });
});

describe("filterDocumentsByDate", () => {
  const docs = [doc("a", "2026-11-28"), doc("b", null), doc("c", "2026-11-29"), doc("d", "2026-11-28"), doc("e", "2026-11-30")];
  test("today keeps order and only that date", () => {
    expect(filterDocumentsByDate(docs, "today", "2026-11-28").map((d) => d.id)).toEqual(["a", "d"]);
  });
  test("tomorrow", () => {
    expect(filterDocumentsByDate(docs, "tomorrow", "2026-11-28").map((d) => d.id)).toEqual(["c"]);
  });
  test("all returns everything, including undated", () => {
    expect(filterDocumentsByDate(docs, "all", "2026-11-28").map((d) => d.id)).toEqual(["a", "b", "c", "d", "e"]);
  });
  test("no match is empty", () => {
    expect(documentsOnDate(docs, "2026-12-01")).toEqual([]);
  });
  test("filterDateKey", () => {
    expect(filterDateKey("today", "2026-11-28")).toBe("2026-11-28");
    expect(filterDateKey("tomorrow", "2026-11-28")).toBe("2026-11-29");
    expect(filterDateKey("all", "2026-11-28")).toBe(null);
  });
});
