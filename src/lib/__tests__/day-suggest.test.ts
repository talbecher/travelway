import { describe, it, expect } from "vitest";
import { suggestDayForRec, type GeoEntry } from "../day-suggest";
const e = (id: string, day_id: string, lat: number | null, lng: number | null, rec: string | null = null): GeoEntry =>
  ({ id, day_id, title: id, latitude: lat, longitude: lng, linked_recommendation_id: rec, display_order: 0, created_at: "" });
const days = [{ id: "d1", day_number: 1, date: "2026-01-01" }, { id: "d2", day_number: 2, date: "2026-01-02" }];
const p = { lat: 35.69, lng: 139.70 };
describe("suggestDayForRec", () => {
  it("empty days / no coords → none", () => {
    expect(suggestDayForRec(p, "r", days, { d1: [e("a", "d1", null, null)] }).suggestion).toBeNull();
  });
  it("no rec point → none", () => {
    expect(suggestDayForRec(null, "r", days, { d1: [e("a", "d1", 35.69, 139.70)] }).suggestion).toBeNull();
  });
  it("picks nearest, ignores > 3.5km", () => {
    const r = suggestDayForRec(p, "r", days, { d1: [e("a", "d1", 35.0, 135.7)], d2: [e("b", "d2", 35.692, 139.70)] });
    expect(r.suggestion?.dayId).toBe("d2");
    expect(suggestDayForRec(p, "r", days, { d1: [e("a", "d1", 35.75, 139.70)] }).suggestion).toBeNull();
  });
  it("excludes day already holding rec", () => {
    const r = suggestDayForRec(p, "r", days, { d1: [e("a", "d1", 35.69, 139.70, "r")], d2: [e("b", "d2", 35.70, 139.70)] });
    expect(r.suggestion?.dayId).toBe("d2");
    expect(r.alreadyInDayIds.has("d1")).toBe(true);
  });
  it("tie → lower day number", () => {
    const r = suggestDayForRec(p, "r", days, { d2: [e("b", "d2", 35.691, 139.70)], d1: [e("a", "d1", 35.691, 139.70)] });
    expect(r.suggestion?.dayId).toBe("d1");
  });
});
