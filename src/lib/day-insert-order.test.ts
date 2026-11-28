// @ts-nocheck -- bun:test types are not installed; no new dependency needed.
import { describe, expect, test } from "bun:test";
import {
  insertIndexByTime,
  planDayInsert,
  renumberUpdates,
  sortByTimeKeepingFixed,
  timeToMinutes,
} from "./day-insert-order";

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

  test("hotel check-in and booked stops are time anchors like any other stop", () => {
    const list = [
      e("09:00", { entry_type: "hotel_checkin" }),
      e("10:00"),
      e("11:00", { booking_status: "booked" }),
      e("12:00"),
      e("20:00", { entry_type: "hotel_checkin" }),
    ];
    expect(insertIndexByTime(list, "11:30")).toBe(3); // after the booked 11:00
    expect(insertIndexByTime(list, "21:00")).toBe(5); // after the 20:00 hotel
    expect(insertIndexByTime(list, "08:00")).toBe(0); // before the 09:00 hotel
  });

  test("day 12: new 23:00 stop goes after the 22:00 return-to-hotel", () => {
    const list = [
      e("18:00"),
      e("19:45"),
      e("20:15", { entry_type: "food" }),
      e("22:00", { entry_type: "hotel_checkin" }),
    ];
    expect(insertIndexByTime(list, "23:00")).toBe(4);
    expect(insertIndexByTime(list, "21:00")).toBe(3);
  });

  test("00:00 is a real time (not 'no time'), for hotels too", () => {
    expect(insertIndexByTime([e("08:00"), e("12:00")], "00:00")).toBe(0);
    expect(insertIndexByTime([e("00:00"), e("08:00")], "00:00")).toBe(1);
    const hotel00 = [e("00:00", { entry_type: "hotel_checkin" }), e("08:00")];
    expect(insertIndexByTime(hotel00, "07:00")).toBe(1);
    expect(insertIndexByTime(hotel00, "00:00")).toBe(1);
  });

  test("untimed hotel is not an anchor", () => {
    const list = [e(null, { entry_type: "hotel_checkin" }), e("08:00")];
    expect(insertIndexByTime(list, "07:00")).toBe(1);
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

  test("new timed hotel check-in goes by its time; untimed one is appended", () => {
    const list = withOrder([e("09:00"), e("12:00")]);
    expect(
      planDayInsert(list, { entry_type: "hotel_checkin", time_of_day: "08:00" }).display_order,
    ).toBe(0);
    expect(
      planDayInsert(list, { entry_type: "hotel_checkin", time_of_day: null }).display_order,
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

describe("sortByTimeKeepingFixed", () => {
  test("day 12 (28.11) bug: the 22:00 return-to-hotel moves after 19:45 and 20:15", () => {
    // stops 13–16 as stored; Postgres returns time as HH:MM:SS
    const list = withOrder([
      e("18:00:00", { id: "s13" }),
      e("22:00:00", { id: "s14-hotel", entry_type: "hotel_checkin", title: "חזרה ל-Kyoto Shijo Muromachi" }),
      e("19:45:00", { id: "s15" }),
      e("20:15:00", { id: "s16", entry_type: "food" }),
    ]);
    const sorted = sortByTimeKeepingFixed(list);
    expect(sorted).not.toBe(list); // not "already sorted"
    expect(ids(sorted)).toEqual(["s13", "s15", "s16", "s14-hotel"]);
    expect(renumberUpdates(sorted)).toEqual([
      { id: "s15", display_order: 1 },
      { id: "s16", display_order: 2 },
      { id: "s14-hotel", display_order: 3 },
    ]);
    // a booked stop is sorted by its time as well
    const booked = [e("22:00", { id: "b", booking_status: "booked" }), e("19:45", { id: "c" })];
    expect(ids(sortByTimeKeepingFixed(booked))).toEqual(["c", "b"]);
  });

  test("sorts every timed stop (hotel and booked included); only untimed stay put", () => {
    const list = [
      e("15:45", { id: "a" }),
      e(null, { id: "note", entry_type: "note" }),
      e("20:00", { id: "b" }),
      e("11:00", { id: "booked", booking_status: "booked" }),
      e("09:45", { id: "c" }),
      e("13:30", { id: "d" }),
      e("22:00", { id: "hotel", entry_type: "hotel_checkin" }),
      e(null, { id: "hotel-untimed", entry_type: "hotel_checkin" }),
      e("13:15", { id: "e" }),
    ];
    expect(ids(sortByTimeKeepingFixed(list))).toEqual([
      "c",
      "note",
      "booked",
      "e",
      "d",
      "a",
      "b",
      "hotel-untimed",
      "hotel",
    ]);
  });

  test("morning check-out sorts to the morning by its own time", () => {
    const list = [e("10:00", { id: "x" }), e("08:00", { id: "out", entry_type: "hotel_checkin" })];
    expect(ids(sortByTimeKeepingFixed(list))).toEqual(["out", "x"]);
  });

  test("already sorted → same array (no-op)", () => {
    const list = [e("09:00"), e(null), e("10:00"), e("10:00")];
    expect(sortByTimeKeepingFixed(list)).toBe(list);
  });

  test("ties keep their current relative order", () => {
    const list = [e("12:00", { id: "x" }), e("10:00", { id: "y" }), e("10:00", { id: "z" })];
    expect(ids(sortByTimeKeepingFixed(list))).toEqual(["y", "z", "x"]);
  });
});
