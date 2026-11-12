// @ts-ignore -- matches the existing dependency-free bun test suite.
import { afterAll, afterEach, beforeAll, describe, expect, it, jest } from "bun:test";
import { subscribeTodayKey } from "./use-today-key";

// Midnight is checked in Asia/Tokyo; the instants below are written in UTC.
const originalTz = process.env.TZ;
beforeAll(() => {
  process.env.TZ = "Asia/Tokyo";
});
afterAll(() => {
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
});
const JST_2359 = new Date("2026-11-17T14:59:00Z"); // 17.11 23:59 JST
const JST_0001 = new Date("2026-11-17T15:01:00Z"); // 18.11 00:01 JST

type Listener = () => void;
function fakeDocument() {
  const listeners = new Set<Listener>();
  const doc = {
    visibilityState: "visible" as "visible" | "hidden",
    addEventListener: (_: string, l: Listener) => void listeners.add(l),
    removeEventListener: (_: string, l: Listener) => void listeners.delete(l),
    fire: () => listeners.forEach((l) => l()),
    count: () => listeners.size,
  };
  (globalThis as Record<string, unknown>).document = doc;
  return doc;
}

afterEach(() => {
  jest.useRealTimers();
  delete (globalThis as Record<string, unknown>).document;
});

describe("subscribeTodayKey", () => {
  it("runs in Asia/Tokyo", () => {
    expect(new Date("2026-11-18T00:00:00Z").getTimezoneOffset()).toBe(-540);
  });

  it("emits the new date after crossing midnight, on the minute tick", () => {
    fakeDocument();
    jest.useFakeTimers({ now: JST_2359 });
    const seen: string[] = [];
    const stop = subscribeTodayKey("2026-11-17", (k) => seen.push(k));
    expect(seen).toEqual([]);
    jest.advanceTimersByTime(60_000); // 00:00
    expect(seen).toEqual(["2026-11-18"]);
    jest.advanceTimersByTime(5 * 60_000);
    expect(seen).toEqual(["2026-11-18"]); // no repeat within the same day
    stop();
  });

  it("emits when the app becomes visible again after midnight", () => {
    const doc = fakeDocument();
    jest.useFakeTimers({ now: JST_2359 });
    const seen: string[] = [];
    const stop = subscribeTodayKey("2026-11-17", (k) => seen.push(k));
    doc.visibilityState = "hidden";
    jest.setSystemTime(JST_0001); // phone slept; the interval did not get to run
    doc.fire();
    expect(seen).toEqual([]); // hidden: nothing yet
    doc.visibilityState = "visible";
    doc.fire();
    expect(seen).toEqual(["2026-11-18"]);
    stop();
  });

  it("corrects a stale initial key right away", () => {
    fakeDocument();
    jest.useFakeTimers({ now: JST_0001 });
    const seen: string[] = [];
    const stop = subscribeTodayKey("2026-11-17", (k) => seen.push(k));
    expect(seen).toEqual(["2026-11-18"]);
    stop();
  });

  it("cleanup stops the interval and removes the listener", () => {
    const doc = fakeDocument();
    jest.useFakeTimers({ now: JST_2359 });
    const seen: string[] = [];
    const stop = subscribeTodayKey("2026-11-17", (k) => seen.push(k));
    expect(doc.count()).toBe(1);
    stop();
    expect(doc.count()).toBe(0);
    jest.advanceTimersByTime(10 * 60_000);
    expect(seen).toEqual([]);
  });
});
