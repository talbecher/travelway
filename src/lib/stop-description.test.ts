// @ts-nocheck -- bun:test types are not installed; no new dependency needed.
import { describe, expect, test } from "bun:test";
import { stopDescription } from "./stop-description";

describe("stopDescription", () => {
  test("the stop's own description wins", () => {
    expect(stopDescription({ description: "Own text" }, { notes: "Rec text" })).toBe("Own text");
  });

  test("falls back to the linked recommendation's notes", () => {
    expect(stopDescription({ description: null }, { notes: "Rec text" })).toBe("Rec text");
    expect(stopDescription({}, { notes: "Rec text" })).toBe("Rec text");
  });

  test("whitespace-only description counts as missing", () => {
    expect(stopDescription({ description: "  \n " }, { notes: " Rec " })).toBe("Rec");
  });

  test("nothing to show → null", () => {
    expect(stopDescription({ description: "" }, null)).toBeNull();
    expect(stopDescription({ description: null }, { notes: "   " })).toBeNull();
    expect(stopDescription(null, undefined)).toBeNull();
  });

  test("trims surrounding whitespace but keeps inner line breaks", () => {
    expect(stopDescription({ description: "\n line 1\nline 2 \n" }, null)).toBe("line 1\nline 2");
  });
});
