// @ts-nocheck -- run with `bun test`
// Request flow of POST /api/public/expense-proposals around the live exchange rate.
// The database is replaced by a fake RPC; the SQL itself is covered by the pending migration's SQL tests.
import { afterAll, beforeEach, expect, mock, test } from "bun:test";

const rpcCalls = [];
let rpcImpl = async () => ({ data: { status: "ok", id: "p1", expires_at: "x" }, error: null });
mock.module("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    rpc: (fn, args) => {
      rpcCalls.push({ fn, args });
      return rpcImpl(fn, args);
    },
  },
}));

const { handleCreateExpenseProposal } = await import("./item-proposals.server");
const { resetFxCache } = await import("./fx.server");

const TOKEN = "twpat_" + "a".repeat(43);
const RID = "11111111-1111-4111-8111-111111111111";
const TABLE = { base: "ILS", date: "2026-11-11", rates: { ILS: 1, JPY: 45.12 } };
const realFetch = globalThis.fetch;
let fxCalls = 0;
let fxUp = true;

beforeEach(() => {
  rpcCalls.length = 0;
  fxCalls = 0;
  fxUp = true;
  resetFxCache();
  globalThis.fetch = async () => {
    fxCalls++;
    if (!fxUp) throw new Error("down");
    return new Response(JSON.stringify(TABLE), { status: 200 });
  };
});
afterAll(() => {
  globalThis.fetch = realFetch;
});

const post = (body) =>
  handleCreateExpenseProposal(
    new Request("https://travelway.test/api/public/expense-proposals", {
      method: "POST",
      headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
const add = (amount, currency, extra = {}) => ({
  request_id: RID,
  operations: [{ op: "add", date: "2026-11-11", category: "food", amount, currency, ...extra }],
});
const ok = { data: { status: "ok", id: "p1", expires_at: "x" }, error: null };
const noRate = { data: { status: "no_valid_rate", reason: "JPY" }, error: null };

test("¥1 without manual rate: server fetches the live table and retries once with it", async () => {
  rpcImpl = async (_fn, a) => (a._live_fx ? ok : noRate);
  const res = await post(add(1, "jpy"));
  expect(res.status).toBe(201);
  expect(fxCalls).toBe(1);
  expect(rpcCalls.length).toBe(2);
  expect(rpcCalls[0].args._live_fx).toBeUndefined();
  expect(rpcCalls[1].fn).toBe("api_create_expense_proposal");
  expect(rpcCalls[1].args._live_fx).toEqual({
    ...TABLE,
    provider: "exchangerate-api.com",
    stale: false,
  });
  // Everything else is passed unchanged, so the payload hash / idempotency key is identical.
  const { _live_fx, ...rest } = rpcCalls[1].args;
  expect(rest).toEqual(rpcCalls[0].args);
  expect(rest._ops).toEqual([
    { op: "add", date: "2026-11-11", category: "food", amount: 1, currency: "JPY" },
  ]);
});

test("ILS / manual rate: decided by the RPC in one call, no external request", async () => {
  rpcImpl = async () => ok;
  expect((await post(add(100, "ILS"))).status).toBe(201);
  expect((await post(add(100, "JPY"))).status).toBe(201); // manual rate case: RPC answers ok directly
  expect(fxCalls).toBe(0);
  expect(rpcCalls.length).toBe(2);
  expect(rpcCalls.every((c) => c.args._live_fx === undefined)).toBe(true);
});

test("rate service down and nothing cached: clear 422, no retry", async () => {
  fxUp = false;
  rpcImpl = async () => noRate;
  const res = await post(add(1, "JPY"));
  expect(res.status).toBe(422);
  expect(await res.json()).toEqual({ error: "no_valid_exchange_rate", reason: "JPY" });
  expect(rpcCalls.length).toBe(1);
});

test("unsupported currency: RPC still answers no_valid_rate -> 422", async () => {
  rpcImpl = async () => ({ data: { status: "no_valid_rate", reason: "XXX" }, error: null });
  const res = await post(add(1, "XXX"));
  expect(res.status).toBe(422);
  expect(await res.json()).toEqual({ error: "no_valid_exchange_rate", reason: "XXX" });
  expect(rpcCalls.length).toBe(2);
});

test("database function not migrated yet: retry error keeps the old 422 answer (no 500)", async () => {
  rpcImpl = async (_fn, a) =>
    a._live_fx ? { data: null, error: { message: "function not found" } } : noRate;
  const res = await post(add(1, "JPY"));
  expect(res.status).toBe(422);
});

test("replay with the same request_id: RPC answers replayed, no rate lookup", async () => {
  rpcImpl = async () => ({
    data: { status: "ok", id: "p1", expires_at: "x", replayed: true },
    error: null,
  });
  const res = await post(add(1, "JPY"));
  expect(res.status).toBe(200);
  expect((await res.json()).replayed).toBe(true);
  expect(fxCalls).toBe(0);
});

test("caller cannot inject a rate: extra fields are rejected before any database call", async () => {
  rpcImpl = async () => ok;
  for (const extra of [
    { rate: 1000 },
    { rate_source: "manual" },
    { amount_ils: 1 },
    { _live_fx: TABLE },
  ]) {
    const res = await post(add(1, "JPY", extra));
    expect(res.status).toBe(400);
  }
  const top = await post({ ...add(1, "JPY"), _live_fx: TABLE });
  expect(top.status).toBe(400);
  expect(rpcCalls.length).toBe(0);
  expect(fxCalls).toBe(0);
});

test("itinerary proposals never trigger a rate lookup", async () => {
  const { handleCreateItineraryProposal } = await import("./item-proposals.server");
  rpcImpl = async () => noRate;
  const res = await handleCreateItineraryProposal(
    new Request("https://travelway.test/x", {
      method: "POST",
      headers: { authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({
        request_id: RID,
        operations: [{ op: "add", date: "2026-11-11", entry_type: "food", title: "L" }],
      }),
    }),
  );
  expect(res.status).toBe(422);
  expect(fxCalls).toBe(0);
  expect(rpcCalls.length).toBe(1);
});
