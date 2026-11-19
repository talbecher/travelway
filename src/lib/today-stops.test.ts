// @ts-nocheck -- bun:test types are not installed; no new dependency needed.
import { describe, expect, test } from "bun:test";
import { todayStopsTimeline } from "./today-stops";

const e = (id: string, display_order: number, time_of_day: string | null = null) => ({
  id,
  display_order,
  time_of_day,
});

describe("todayStopsTimeline", () => {
  test("keeps itinerary order (display_order), not time order", () => {
    const out = todayStopsTimeline([e("c", 3, "08:00"), e("a", 1, "12:00"), e("b", 2)], "07:00");
    expect(out.map((s) => s.entry.id)).toEqual(["a", "b", "c"]);
    expect(out.map((s) => s.position)).toEqual([0, 1, 2]);
  });

  test("ties on display_order keep the loaded order", () => {
    const out = todayStopsTimeline([e("x", 1), e("y", 1), e("z", 0)], "10:00");
    expect(out.map((s) => s.entry.id)).toEqual(["z", "x", "y"]);
  });

  test("past stops stay in the list and are marked; the current one is not past", () => {
    const out = todayStopsTimeline(
      [e("breakfast", 0, "08:00"), e("temple", 1, "10:00"), e("note", 2), e("lunch", 3, "13:00")],
      "11:30",
    );
    expect(out.map((s) => [s.entry.id, s.past])).toEqual([
      ["breakfast", true],
      ["temple", false],
      ["note", false],
      ["lunch", false],
    ]);
  });

  test("a stop whose time equals now is current; later in the evening everything before is past", () => {
    expect(
      todayStopsTimeline([e("a", 0, "09:00"), e("b", 1, "10:00:00")], "10:00").map((s) => s.past),
    ).toEqual([true, false]);
    expect(
      todayStopsTimeline([e("a", 0, "09:00"), e("b", 1, "10:00")], "23:59").map((s) => s.past),
    ).toEqual([true, false]);
  });

  test("nothing past before the first time; untimed stops never past", () => {
    expect(todayStopsTimeline([e("a", 0, "09:00"), e("b", 1)], "06:00").map((s) => s.past)).toEqual(
      [false, false],
    );
    expect(todayStopsTimeline([e("a", 0), e("b", 1)], "23:00").map((s) => s.past)).toEqual([
      false,
      false,
    ]);
  });

  test("display order independent of time: a late-ordered early stop is still past", () => {
    const out = todayStopsTimeline(
      [e("dinner", 0, "19:00"), e("museum", 1, "09:00"), e("cafe", 2, "11:00")],
      "12:00",
    );
    expect(out.map((s) => [s.entry.id, s.past])).toEqual([
      ["dinner", false],
      ["museum", true],
      ["cafe", false],
    ]);
  });
});
