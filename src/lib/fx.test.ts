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
const { getPairRate, resolveConversion, conversionLabel } = await import("./currency");

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

describe("resolveConversion: a stale rate never counts as a usable rate", () => {
  // The three foreign-currency save gates (GlobalFab, EditExpenseForm) throw when
  // `!conv.rate || conv.rate <= 0`. This is that exact predicate.
  const blocksSave = (c: { rate: number | null }) => !c.rate || c.rate <= 0;
  const stalePair = { rate: 41.5, date: "2026-11-12", provider: "exchangerate-api.com", stale: true };
  const livePair = { rate: 42, date: "2026-11-18", provider: "exchangerate-api.com" };

  it("only a stale rate (no manual, no live): rate is null, so saving stays blocked; stale is kept for display", () => {
    const c = resolveConversion("ILS", "JPY", 0, stalePair);
    expect(c.rate).toBeNull();
    expect(c.source).toBeNull();
    expect(c.stale).toEqual({ rate: 41.5, date: "2026-11-12" });
    expect(blocksSave(c)).toBe(true);
    expect(conversionLabel(c)).toBe("1 ILS = 41.5 JPY (שער מ-12.11 · אין חיבור)");
  });

  it("nothing at all: rate null, no stale", () => {
    const c = resolveConversion("ILS", "JPY", 0, null);
    expect(c.rate).toBeNull();
    expect(c.stale).toBeNull();
    expect(blocksSave(c)).toBe(true);
    expect(conversionLabel(c)).toBe("");
  });

  it("manual rate wins over a stale rate and saving is allowed", () => {
    const c = resolveConversion("ILS", "JPY", 40, stalePair);
    expect(c.rate).toBe(40);
    expect(c.source).toBe("manual");
    expect(c.stale).toBeNull();
    expect(blocksSave(c)).toBe(false);
  });

  it("a live rate is used as live, never as stale", () => {
    const c = resolveConversion("ILS", "JPY", 0, livePair);
    expect(c.rate).toBe(42);
    expect(c.source).toBe("live");
    expect(c.stale).toBeNull();
    expect(blocksSave(c)).toBe(false);
  });

  it("same currency needs no rate", () => {
    const c = resolveConversion("ILS", "ILS", 0, null);
    expect(c.rate).toBe(1);
    expect(c.sameCurrency).toBe(true);
  });
});
