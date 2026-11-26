// @ts-nocheck -- bun:test types are not installed; no new dependency needed.
import { describe, expect, test } from "bun:test";
import { insertIndexByTime, planDayInsert, timeToMinutes } from "./day-insert-order";

let n = 0;
const e = (time: string | null, o = {}) => ({
  id: o.id ?? `e${n++}`,
  entry_type: "attraction",
  time_of_day: time,
  display_order: o.display_order,
  booking_status: null,
  ...o,
});
const ids = (list) => list.map((x) => x.id);
const withOrder = (list) => list.map((x, i) => ({ ...x, display_order: i }));

describe("insertIndexByTime", () => {
  test("empty list → 0", () => {
    expect(insertIndexByTime([], "10:00")).toBe(0);
    expect(insertIndexByTime([], null)).toBe(0);
  });

  test("new stop without a time goes to the end", () => {
    const list = [e("09:00"), e("12:00"), e(null)];
    expect(insertIndexByTime(list, null)).toBe(3);
    expect(insertIndexByTime(list, "")).toBe(3);
    expect(insertIndexByTime(list, "not a time")).toBe(3);
  });

  test("existing list without times → end", () => {
    expect(insertIndexByTime([e(null), e(null)], "10:00")).toBe(2);
  });

  test("mixed timed/untimed: lands right after the last earlier stop", () => {
    const list = [e("09:00"), e(null), e("12:00"), e(null), e("18:00")];
    expect(insertIndexByTime(list, "10:00")).toBe(1);
    expect(insertIndexByTime(list, "13:00")).toBe(3);
    expect(insertIndexByTime(list, "19:00")).toBe(5);
  });

  test("earlier than every timed stop → before the first timed stop (leading untimed stay first)", () => {
    expect(insertIndexByTime([e(null), e("09:00"), e("12:00")], "07:00")).toBe(1);
  });

  test("ties go after the existing stops with the same time", () => {
    const list = [e("09:00"), e("10:00"), e("10:00"), e("11:00")];
    expect(insertIndexByTime(list, "10:00")).toBe(3);
  });

  test("seconds are accepted on both sides", () => {
    expect(insertIndexByTime([e("09:00:00"), e("12:00:00")], "10:30")).toBe(1);
    expect(timeToMinutes("9:05")).toBe(545);
    expect(timeToMinutes("24:00")).toBe(null);
  });

  test("manually unsorted list: after the last stop with time ≤ new, nothing else reordered", () => {
    // 15:45, 20:00, 09:45, 13:30, 13:15 (the reported bug order)
    const list = [e("15:45"), e("20:00"), e("09:45"), e("13:30"), e("13:15")];
    expect(insertIndexByTime(list, "14:00")).toBe(5); // after 13:15 (last ≤ 14:00)
    expect(insertIndexByTime(list, "16:00")).toBe(5);
    expect(insertIndexByTime(list, "09:50")).toBe(3); // after 09:45
    expect(insertIndexByTime(list, "08:00")).toBe(0); // before the first timed stop
  });

  test("hotel check-in and booked stops are ignored as anchors", () => {
    const list = [
      e("09:00", { entry_type: "hotel_checkin" }),
      e("10:00"),
      e("11:00", { booking_status: "booked" }),
      e("12:00"),
      e("20:00", { entry_type: "hotel_checkin" }),
    ];
    expect(insertIndexByTime(list, "11:30")).toBe(2); // after 10:00, the booked 11:00 does not count
    expect(insertIndexByTime(list, "21:00")).toBe(4); // after 12:00 → before the 20:00 hotel
    expect(insertIndexByTime(list, "08:00")).toBe(1); // hotel 09:00 is not an anchor
  });

  test("00:00 is a real time (not 'no time'); a hotel at 00:00 is ignored", () => {
    expect(insertIndexByTime([e("08:00"), e("12:00")], "00:00")).toBe(0);
    expect(insertIndexByTime([e("00:00"), e("08:00")], "00:00")).toBe(1);
    const hotel00 = [e("00:00", { entry_type: "hotel_checkin" }), e("08:00")];
    expect(insertIndexByTime(hotel00, "07:00")).toBe(1);
    expect(insertIndexByTime(hotel00, "00:00")).toBe(1);
  });
});

describe("planDayInsert", () => {
  test("shifts only the rows after the insertion point", () => {
    const list = withOrder([
      e("09:00", { id: "a" }),
      e("12:00", { id: "b" }),
      e("18:00", { id: "c" }),
    ]);
    const plan = planDayInsert(list, { entry_type: "food", time_of_day: "13:00" });
    expect(plan.display_order).toBe(2);
    expect(plan.updates).toEqual([{ id: "c", display_order: 3 }]);
  });

  test("no time → appended, nothing shifted", () => {
    const list = withOrder([e("09:00"), e(null)]);
    expect(planDayInsert(list, { entry_type: "food", time_of_day: null })).toEqual({
      display_order: 2,
      updates: [],
    });
  });

  test("new hotel check-in keeps append-at-end", () => {
    const list = withOrder([e("09:00"), e("12:00")]);
    expect(
      planDayInsert(list, { entry_type: "hotel_checkin", time_of_day: "08:00" }).display_order,
    ).toBe(2);
  });

  test("non-contiguous stored orders are normalized without changing relative order", () => {
    const list = [
      e("09:00", { id: "a", display_order: 0 }),
      e("12:00", { id: "b", display_order: 4 }),
    ];
    const plan = planDayInsert(list, { entry_type: "food", time_of_day: "10:00" });
    expect(plan.display_order).toBe(1);
    expect(plan.updates).toEqual([{ id: "b", display_order: 2 }]);
  });
});
