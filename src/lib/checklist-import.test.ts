import { describe, expect, test } from "bun:test";
import {
  classifyChecklistDuplicates,
  defaultChecklistSelection,
  parseChecklistImport,
} from "./checklist-import";

const wrap = (items: unknown[]) => JSON.stringify({ version: 1, checklist: items });

describe("parseChecklistImport", () => {
  test("valid item with defaults", () => {
    const r = parseChecklistImport(wrap([{ title: " מתאם " }]));
    expect(r.rows[0]).toMatchObject({ title: "מתאם", category: "other", priority: "normal", due_date: null, errors: [] });
  });
  test("fenced JSON with all fields", () => {
    const r = parseChecklistImport("text\n```json\n" + wrap([{ title: "eSIM", category: "tech", priority: "high", due_date: "2026-11-20", notes: "n" }]) + "\n```");
    expect(r.rows[0]).toMatchObject({ category: "tech", priority: "high", due_date: "2026-11-20", notes: "n", errors: [] });
  });
  test("missing title is invalid", () => {
    expect(parseChecklistImport(wrap([{ category: "tech" }])).rows[0].errors).toContain("חסרה כותרת");
  });
  test("unknown category / priority are invalid, not coerced", () => {
    const row = parseChecklistImport(wrap([{ title: "x", category: "food", priority: "urgent" }])).rows[0];
    expect(row.errors.length).toBe(2);
  });
  test("impossible date is invalid", () => {
    expect(parseChecklistImport(wrap([{ title: "x", due_date: "2026-02-30" }])).rows[0].errors.length).toBe(1);
    expect(parseChecklistImport(wrap([{ title: "x", due_date: "20/11/2026" }])).rows[0].errors.length).toBe(1);
  });
  test("bad JSON / missing checklist", () => {
    expect(parseChecklistImport("hello").error).toBeTruthy();
    expect(parseChecklistImport('{"version":1}').error).toBeTruthy();
  });
});

describe("duplicates", () => {
  test("existing (done included) not preselected; in-import keeps first only", () => {
    const { rows } = parseChecklistImport(
      wrap([{ title: "Passport  Copy" }, { title: "ביטוח" }, { title: " ביטוח " }, { title: "new" }]),
    );
    const dups = classifyChecklistDuplicates(rows, ["passport copy"]);
    expect(dups).toEqual(["existing", null, "in_import", null]);
    expect([...defaultChecklistSelection(rows, dups)]).toEqual([1, 3]);
  });
  test("first in-import copy that already exists is not selected", () => {
    const { rows } = parseChecklistImport(wrap([{ title: "A" }, { title: "a" }]));
    const dups = classifyChecklistDuplicates(rows, ["A"]);
    expect(dups).toEqual(["existing", "existing"]);
    expect(defaultChecklistSelection(rows, dups).size).toBe(0);
  });
});
