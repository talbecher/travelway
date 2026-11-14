// @ts-nocheck -- run with `bun test`; bun:test types are not installed for tsc
import { beforeEach, describe, expect, it, mock } from "bun:test";

let lookup: { data: unknown; error: unknown } | Error = { data: [], error: null };
const calls: Array<[string, unknown]> = [];
const chain = {
  select: (c: string) => {
    calls.push(["select", c]);
    return chain;
  },
  eq: (c: string, v: unknown) => {
    calls.push([`eq:${c}`, v]);
    return chain;
  },
  limit: async (n: number) => {
    calls.push(["limit", n]);
    if (lookup instanceof Error) throw lookup;
    return lookup;
  },
};
mock.module("@/integrations/supabase/client", () => ({
  supabase: {
    from: (t: string) => {
      calls.push(["from", t]);
      return chain;
    },
  },
}));

const {
  REC_DUPLICATE_MESSAGE,
  RecDuplicateError,
  findRecByPlaceId,
  isRecPlaceDuplicateError,
  recDuplicateMessage,
  rethrowRecDuplicate,
} = await import("./rec-duplicate");

const DUP = {
  code: "23505",
  message:
    'duplicate key value violates unique constraint "recommendations_trip_provider_place_uidx"',
  details: "Key (trip_id, provider, provider_place_id)=(t, google, ChIJ1) already exists.",
  hint: null,
};
const TRIP = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  lookup = { data: [], error: null };
  calls.length = 0;
});

describe("isRecPlaceDuplicateError", () => {
  it("matches the place unique index violation", () => {
    expect(isRecPlaceDuplicateError(DUP)).toBe(true);
  });
  it("matches when the index name is only in details", () => {
    expect(
      isRecPlaceDuplicateError({
        code: "23505",
        message: "duplicate key",
        details: "recommendations_trip_provider_place_uidx",
      }),
    ).toBe(true);
  });
  it("ignores other unique violations", () => {
    expect(
      isRecPlaceDuplicateError({
        code: "23505",
        message: 'violates unique constraint "hotels_pkey"',
      }),
    ).toBe(false);
  });
  it("ignores other codes with the same index name", () => {
    expect(isRecPlaceDuplicateError({ ...DUP, code: "23503" })).toBe(false);
  });
  it("ignores non-objects and plain errors", () => {
    for (const v of [
      null,
      undefined,
      "23505",
      23505,
      new Error("recommendations_trip_provider_place_uidx"),
    ]) {
      expect(isRecPlaceDuplicateError(v)).toBe(false);
    }
  });
});

describe("recDuplicateMessage", () => {
  it("is plain Hebrew without database text", () => {
    expect(recDuplicateMessage()).toBe(REC_DUPLICATE_MESSAGE);
    expect(recDuplicateMessage(null)).toBe("המקום כבר שמור בהמלצות");
  });
  it("names the saved recommendation", () => {
    expect(recDuplicateMessage({ name: "  Ichiran Shibuya " })).toBe(
      'המקום כבר שמור בהמלצות בשם "Ichiran Shibuya"',
    );
  });
  it("falls back when the name is blank", () => {
    expect(recDuplicateMessage({ name: "  " })).toBe(REC_DUPLICATE_MESSAGE);
  });
});

describe("findRecByPlaceId", () => {
  it("queries by trip and place id", async () => {
    lookup = { data: [{ id: "r1", name: "Ichiran" }], error: null };
    expect(await findRecByPlaceId(TRIP, "ChIJ1")).toEqual({ id: "r1", name: "Ichiran" });
    expect(calls).toContainEqual(["from", "recommendations"]);
    expect(calls).toContainEqual(["eq:trip_id", TRIP]);
    expect(calls).toContainEqual(["eq:provider_place_id", "ChIJ1"]);
  });
  it("returns null without a place id and makes no request", async () => {
    expect(await findRecByPlaceId(TRIP, null)).toBeNull();
    expect(calls.length).toBe(0);
  });
  it("returns null on error, empty result or thrown error", async () => {
    lookup = { data: null, error: { message: "boom" } };
    expect(await findRecByPlaceId(TRIP, "x")).toBeNull();
    lookup = { data: [], error: null };
    expect(await findRecByPlaceId(TRIP, "x")).toBeNull();
    lookup = new Error("offline");
    expect(await findRecByPlaceId(TRIP, "x")).toBeNull();
  });
});

describe("rethrowRecDuplicate", () => {
  it("turns the violation into a clear error carrying the saved rec", async () => {
    lookup = { data: [{ id: "r1", name: "Ichiran" }], error: null };
    const err = await rethrowRecDuplicate(DUP, TRIP, "ChIJ1").catch((e) => e);
    expect(err).toBeInstanceOf(RecDuplicateError);
    expect(err.message).toBe('המקום כבר שמור בהמלצות בשם "Ichiran"');
    expect(err.existing).toEqual({ id: "r1", name: "Ichiran" });
    expect(err.message).not.toContain("23505");
    expect(err.message).not.toContain("uidx");
  });
  it("still gives the clear message when the lookup fails", async () => {
    lookup = new Error("offline");
    const err = await rethrowRecDuplicate(DUP, TRIP, "ChIJ1").catch((e) => e);
    expect(err.message).toBe(REC_DUPLICATE_MESSAGE);
    expect(err.existing).toBeNull();
  });
  it("re-throws any other error unchanged", async () => {
    const other = { code: "42501", message: "permission denied" };
    expect(await rethrowRecDuplicate(other, TRIP, "x").catch((e) => e)).toBe(other);
    expect(calls.length).toBe(0);
  });
});
