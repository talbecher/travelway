// @ts-nocheck -- run with `bun test`; bun:test types are not installed (no new deps).
import { describe, expect, test } from "bun:test";
import { normalizeChecklistOps } from "./checklist-proposals.server";

describe("normalizeChecklistOps", () => {
  test("mark_done becomes an update with is_done true", () => {
    expect(normalizeChecklistOps([{ op: "mark_done", id: "00000000-0000-0000-0000-000000000001" }]))
      .toEqual([{ op: "update", id: "00000000-0000-0000-0000-000000000001", is_done: true }]);
  });
  test("known category aliases are mapped, others kept for server validation", () => {
    const [a, b] = normalizeChecklistOps([
      { op: "add", title: "x", category: "Booking" },
      { op: "add", title: "y", category: "bogus" },
    ]);
    expect(a.category).toBe("bookings");
    expect(b.category).toBe("bogus");
  });
  test("omitted fields are not sent (untouched on update)", () => {
    const [u] = normalizeChecklistOps([{ op: "update", id: "00000000-0000-0000-0000-000000000002", priority: "low" }]);
    expect(Object.keys(u).sort()).toEqual(["id", "op", "priority"]);
  });
});
