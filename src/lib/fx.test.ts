// @ts-ignore -- matches the existing dependency-free bun test suite.
import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";

// currency.ts imports React hooks and the trip hooks; only the pure getPairRate is tested here.
mock.module("@/hooks/use-trip", () => ({ useSettings: () => ({}), useTrip: () => ({}) }));

function memoryStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
  };
}

const g = globalThis as Record<string, unknown>;
const KEYS = ["window", "sessionStorage", "localStorage", "fetch"] as const;
const saved = KEYS.map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)] as const);
const setGlobal = (k: string, value: unknown) =>
  Object.defineProperty(globalThis, k, { value, writable: true, configurable: true });
const session = memoryStorage();
const local = memoryStorage();
setGlobal("window", globalThis);
setGlobal("sessionStorage", session);
setGlobal("localStorage", local);

let mode: "ok" | "fail" = "ok";
let liveJpy = 41.5;
let liveDate = "2026-11-12";
const liveFetch = async () => {
  if (mode === "fail") throw new TypeError("Failed to fetch");
  return new Response(
    JSON.stringify({ base: "ILS", date: liveDate, rates: { ILS: 1, JPY: liveJpy, USD: 0.27 } }),
  );
};
setGlobal("fetch", liveFetch);

const { getRates, convert, staleRateLabel } = await import("./fx");
const { getPairRate } = await import("./currency");

/** Simulates the app being closed and reopened: sessionStorage is gone, localStorage stays. */
function restartApp() {
  session.clear();
}

beforeEach(() => {
  session.clear();
  local.clear();
  mode = "ok";
  liveJpy = 41.5;
  liveDate = "2026-11-12";
  g.fetch = liveFetch;
});

afterAll(() => {
  for (const [k, d] of saved) {
    if (d) Object.defineProperty(globalThis, k, d);
    else delete g[k];
  }
});

describe("getRates", () => {
  it("success: returns the live table and stores it as the last good table", async () => {
    const r = await getRates();
    expect(r?.rates.JPY).toBe(41.5);
    expect(r?.stale).toBeUndefined();
    expect(local.getItem("fx-last-good-ils-v1")).not.toBeNull();
  });

  it("failure with a saved table: returns it marked stale with its date", async () => {
    await getRates();
    restartApp();
    mode = "fail";
    const r = await getRates();
    expect(r).not.toBeNull();
    expect(r!.stale).toBe(true);
    expect(r!.date).toBe("2026-11-12");
    expect(convert(100, "ILS", "JPY", r)).toBeCloseTo(4150);
    // the stale table is never written to the 6-hour cache
    expect(session.getItem("fx-rates-ils-v1")).toBeNull();
  });

  it("failure without a saved table: returns null (converter shows 0 and asks for a manual rate)", async () => {
    mode = "fail";
    expect(await getRates()).toBeNull();
    expect(convert(100, "ILS", "JPY", null)).toBe(0);
  });

  it("failure then success: returns the live table, not the stale one", async () => {
    await getRates();
    restartApp();
    mode = "fail";
    expect((await getRates())?.stale).toBe(true);
    mode = "ok";
    liveJpy = 42;
    liveDate = "2026-11-18";
    const r = await getRates();
    expect(r?.stale).toBeUndefined();
    expect(r?.rates.JPY).toBe(42);
    expect(r?.date).toBe("2026-11-18");
  });

  it("a non-ok response falls back to the stale table", async () => {
    await getRates();
    restartApp();
    g.fetch = async () => new Response("nope", { status: 503 });
    expect((await getRates())?.stale).toBe(true);
  });

  it("corrupt saved table is ignored", async () => {
    local.setItem("fx-last-good-ils-v1", "{not json");
    mode = "fail";
    expect(await getRates()).toBeNull();
  });
});

describe("getPairRate", () => {
  it("stale pair is returned marked stale and is not cached; the live pair wins once back online", async () => {
    await getPairRate("ILS", "JPY");
    restartApp();
    mode = "fail";
    const stale = await getPairRate("ILS", "JPY");
    expect(stale?.stale).toBe(true);
    expect(stale?.rate).toBeCloseTo(41.5);
    expect(session.getItem("fx-pair-v1:ILS>JPY")).toBeNull();

    mode = "ok";
    liveJpy = 42;
    const live = await getPairRate("ILS", "JPY");
    expect(live?.stale).toBeUndefined();
    expect(live?.rate).toBeCloseTo(42);
  });

  it("no network and nothing saved: null", async () => {
    mode = "fail";
    expect(await getPairRate("ILS", "JPY")).toBeNull();
  });
});

describe("staleRateLabel", () => {
  it("formats DD.MM", () => {
    expect(staleRateLabel("2026-11-12")).toBe("שער מ-12.11 · אין חיבור");
  });
});
