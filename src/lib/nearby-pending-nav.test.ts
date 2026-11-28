// @ts-nocheck -- run with `bun test`; bun:test types are not installed for tsc
import { describe, expect, it } from "bun:test";
import {
  PENDING_NAV_TTL_MS,
  isPendingNavLive,
  parsePendingNav,
  pendingNavHighlightId,
  promotePendingNav,
  shouldClearPendingNav,
} from "./nearby-pending-nav";

const NOW = 1_800_000_000_000;
const status = (map: Record<string, string>) => (id: string) => map[id];

describe("parsePendingNav", () => {
  it("reads a valid value", () => {
    expect(parsePendingNav(JSON.stringify({ recId: "a", ts: 5 }))).toEqual({ recId: "a", ts: 5 });
  });
  it("rejects missing, malformed and wrongly typed values", () => {
    expect(parsePendingNav(null)).toBeNull();
    expect(parsePendingNav("")).toBeNull();
    expect(parsePendingNav("{oops")).toBeNull();
    expect(parsePendingNav("null")).toBeNull();
    expect(parsePendingNav(JSON.stringify({ recId: "", ts: 5 }))).toBeNull();
    expect(parsePendingNav(JSON.stringify({ recId: "a", ts: "5" }))).toBeNull();
    expect(parsePendingNav(JSON.stringify({ recId: 1, ts: 5 }))).toBeNull();
  });
});

describe("isPendingNavLive", () => {
  it("is live just after navigating and just before 3 hours", () => {
    expect(isPendingNavLive({ recId: "a", ts: NOW }, NOW)).toBe(true);
    expect(isPendingNavLive({ recId: "a", ts: NOW - PENDING_NAV_TTL_MS + 1 }, NOW)).toBe(true);
  });
  it("expires at 3 hours, and a future timestamp is not live", () => {
    expect(isPendingNavLive({ recId: "a", ts: NOW - PENDING_NAV_TTL_MS }, NOW)).toBe(false);
    expect(isPendingNavLive({ recId: "a", ts: NOW + 60_000 }, NOW)).toBe(false);
    expect(isPendingNavLive(null, NOW)).toBe(false);
  });
});

describe("pendingNavHighlightId", () => {
  const nav = { recId: "a", ts: NOW - 60_000 };
  it("highlights a live, not-yet-visited place", () => {
    expect(pendingNavHighlightId(nav, NOW, status({ a: "wishlist" }))).toBe("a");
    expect(pendingNavHighlightId(nav, NOW, status({ a: "skipped" }))).toBe("a");
  });
  it("no highlight when visited, deleted or expired", () => {
    expect(pendingNavHighlightId(nav, NOW, status({ a: "visited" }))).toBeNull();
    expect(pendingNavHighlightId(nav, NOW, status({}))).toBeNull();
    expect(pendingNavHighlightId(nav, NOW + PENDING_NAV_TTL_MS, status({ a: "wishlist" }))).toBeNull();
  });
});

describe("shouldClearPendingNav", () => {
  it("clears when expired or visited, keeps otherwise", () => {
    const nav = { recId: "a", ts: NOW };
    expect(shouldClearPendingNav(nav, NOW, status({ a: "wishlist" }))).toBe(false);
    expect(shouldClearPendingNav(nav, NOW, status({ a: "visited" }))).toBe(true);
    expect(shouldClearPendingNav(nav, NOW + PENDING_NAV_TTL_MS, status({ a: "wishlist" }))).toBe(true);
    expect(shouldClearPendingNav(null, NOW, status({}))).toBe(false);
  });
  it("keeps it while the recs list has not loaded the place", () => {
    expect(shouldClearPendingNav({ recId: "a", ts: NOW }, NOW, status({}))).toBe(false);
  });
});

describe("promotePendingNav", () => {
  const rows = ["a", "b", "c", "d"].map((id) => ({ rec: { id } }));
  const ids = (xs) => xs.map((x) => x.rec.id);
  it("without a highlight keeps distance order", () => {
    expect(ids(promotePendingNav(rows, null, 3))).toEqual(["a", "b", "c"]);
    expect(ids(promotePendingNav(rows, "zz", 3))).toEqual(["a", "b", "c"]);
  });
  it("moves the highlighted place first, rest keep order", () => {
    expect(ids(promotePendingNav(rows, "c", 3))).toEqual(["c", "a", "b"]);
    expect(ids(promotePendingNav(rows, "a", 3))).toEqual(["a", "b", "c"]);
  });
  it("surfaces a place just outside the top rows", () => {
    expect(ids(promotePendingNav(rows, "d", 3))).toEqual(["d", "a", "b"]);
  });
});
