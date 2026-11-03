// @ts-nocheck -- run with `bun test`; bun:test types are not installed (no new deps).
import { describe, expect, test } from "bun:test";
import { sortChecklistTasks, sortChecklistByPriority, taskUrgency } from "./checklist-sort";
import { displayCategory, isKnownCategory } from "./checklist-templates";

const T = "2026-11-10";
const t = (id, o = {}) => ({ id, is_done: false, priority: "normal", due_date: null, display_order: 0, created_at: "2026-01-01", ...o });

describe("taskUrgency", () => {
  test("overdue / today / open / done", () => {
    expect(taskUrgency(t("a", { due_date: "2026-11-09" }), T)).toBe("overdue");
    expect(taskUrgency(t("a", { due_date: T }), T)).toBe("today");
    expect(taskUrgency(t("a", { due_date: "2026-11-11" }), T)).toBe("open");
    expect(taskUrgency(t("a", { due_date: "2026-11-01", is_done: true }), T)).toBe("done");
  });
});

describe("sortChecklistTasks", () => {
  test("overdue, today, open, done", () => {
    const r = sortChecklistTasks(
      [t("done", { is_done: true }), t("open"), t("today", { due_date: T }), t("late", { due_date: "2026-11-01", priority: "low" })],
      T,
    );
    expect(r.map((x) => x.id)).toEqual(["late", "today", "open", "done"]);
  });
  test("priority then nearest due date, no date last", () => {
    const r = sortChecklistTasks(
      [t("n-none"), t("n-far", { due_date: "2026-12-30" }), t("n-near", { due_date: "2026-11-20" }), t("low", { priority: "low" }), t("high", { priority: "high" })],
      T,
    );
    expect(r.map((x) => x.id)).toEqual(["high", "n-near", "n-far", "n-none", "low"]);
  });
  test("ties: display_order, created_at, id", () => {
    const r = sortChecklistTasks(
      [t("c", { display_order: 1 }), t("b", { created_at: "2026-02-01" }), t("a2"), t("a1")],
      T,
    );
    expect(r.map((x) => x.id)).toEqual(["a1", "a2", "b", "c"]);
  });
  test("does not mutate input", () => {
    const input = [t("b", { display_order: 1 }), t("a")];
    sortChecklistTasks(input, T);
    expect(input.map((x) => x.id)).toEqual(["b", "a"]);
  });
});

describe("unknown category display", () => {
  test("shown under other, stored value untouched", () => {
    const item = { category: "visa_stuff" };
    expect(isKnownCategory(item.category)).toBe(false);
    expect(displayCategory(item.category)).toBe("other");
    expect(item.category).toBe("visa_stuff");
    expect(displayCategory("transport")).toBe("transport");
  });
});

describe("priority display mode", () => {
  test("high then normal then low across categories, separately for open and completed", () => {
    const items = [
      t("done-low", { is_done: true, priority: "low", category: "documents" }),
      t("open-low", { priority: "low", category: "documents", due_date: "2026-01-01" }),
      t("done-high", { is_done: true, priority: "high", category: "packing" }),
      t("open-normal", { category: "money" }),
      t("open-high", { priority: "high", category: "packing" }),
      t("done-normal", { is_done: true, category: "money" }),
    ];
    expect(sortChecklistByPriority(items).map((x) => x.id)).toEqual([
      "open-high", "open-normal", "open-low", "done-high", "done-normal", "done-low",
    ]);
  });
  test("ties preserve existing order and input is not mutated", () => {
    const items = [t("b"), t("a"), t("high", { priority: "high" })];
    expect(sortChecklistByPriority(items).map((x) => x.id)).toEqual(["high", "b", "a"]);
    expect(items.map((x) => x.id)).toEqual(["b", "a", "high"]);
  });
});
