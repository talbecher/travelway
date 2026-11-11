// @ts-nocheck -- run with `bun test`
import { beforeEach, expect, test } from "bun:test";
import {
  FX_FRESH_MS,
  FX_MAX_STALE_MS,
  FX_URL,
  getServerFx,
  parseFxTable,
  resetFxCache,
} from "./fx.server";

const TABLE = { base: "ILS", date: "2026-11-11", rates: { ILS: 1, JPY: 45.12, USD: 0.27 } };
const okFetch = (body = TABLE) => {
  const f = async (url) => {
    f.calls.push(url);
    return new Response(JSON.stringify(body), { status: 200 });
  };
  f.calls = [];
  return f;
};
const failFetch = () => {
  const f = async () => {
    f.calls.push(1);
    throw new Error("network down");
  };
  f.calls = [];
  return f;
};

beforeEach(() => resetFxCache());

test("parse: keeps only valid positive rates and the provider date", () => {
  const p = parseFxTable({
    ...TABLE,
    rates: { ...TABLE.rates, BAD: -1, XXX: "1", lower: 2, NAN: NaN },
  });
  expect(p).toEqual({
    base: "ILS",
    date: "2026-11-11",
    provider: "exchangerate-api.com",
    rates: { ILS: 1, JPY: 45.12, USD: 0.27 },
  });
});
test("parse: rejects malformed tables", () => {
  expect(parseFxTable(null)).toBeNull();
  expect(parseFxTable({ ...TABLE, base: "ils1" })).toBeNull();
  expect(parseFxTable({ ...TABLE, date: "11/11/2026" })).toBeNull();
  expect(parseFxTable({ ...TABLE, rates: [] })).toBeNull();
  expect(parseFxTable({ ...TABLE, rates: { JPY: 0 } })).toBeNull();
});
test("fetches the same provider URL as the browser helper", async () => {
  const f = okFetch();
  const r = await getServerFx({ fetchImpl: f, now: () => 0 });
  expect(f.calls).toEqual([FX_URL]);
  expect(FX_URL).toBe("https://api.exchangerate-api.com/v4/latest/ILS");
  expect(r.rates.JPY).toBe(45.12);
  expect(r.stale).toBe(false);
  expect(r.date).toBe("2026-11-11");
});
test("cache: fresh for 6 hours, no second request", async () => {
  const f = okFetch();
  await getServerFx({ fetchImpl: f, now: () => 0 });
  const r = await getServerFx({ fetchImpl: f, now: () => FX_FRESH_MS - 1 });
  expect(f.calls.length).toBe(1);
  expect(r.stale).toBe(false);
});
test("cache: after 6 hours asks the provider again", async () => {
  const f = okFetch();
  await getServerFx({ fetchImpl: f, now: () => 0 });
  await getServerFx({ fetchImpl: f, now: () => FX_FRESH_MS + 1 });
  expect(f.calls.length).toBe(2);
});
test("fallback: provider down within 24 hours -> cached table marked stale", async () => {
  await getServerFx({ fetchImpl: okFetch(), now: () => 0 });
  const r = await getServerFx({ fetchImpl: failFetch(), now: () => FX_MAX_STALE_MS - 1 });
  expect(r.stale).toBe(true);
  expect(r.rates.JPY).toBe(45.12);
});
test("fallback: provider answers with garbage -> stale cache, not garbage", async () => {
  await getServerFx({ fetchImpl: okFetch(), now: () => 0 });
  const r = await getServerFx({ fetchImpl: okFetch({ nope: true }), now: () => FX_FRESH_MS + 1 });
  expect(r.stale).toBe(true);
  expect(r.rates.JPY).toBe(45.12);
});
test("fallback: older than 24 hours -> no rate", async () => {
  await getServerFx({ fetchImpl: okFetch(), now: () => 0 });
  expect(await getServerFx({ fetchImpl: failFetch(), now: () => FX_MAX_STALE_MS + 1 })).toBeNull();
});
test("no cache and provider down -> no rate", async () => {
  expect(await getServerFx({ fetchImpl: failFetch(), now: () => 0 })).toBeNull();
  const bad = async () => new Response("err", { status: 503 });
  expect(await getServerFx({ fetchImpl: bad, now: () => 0 })).toBeNull();
});
