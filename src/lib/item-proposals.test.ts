// @ts-nocheck -- run with `bun test`
import { expect, test } from "bun:test";
import { expenseBody, itineraryBody } from "./item-proposals.server";

const RID = "11111111-1111-4111-8111-111111111111";
const ID = "22222222-2222-4222-8222-222222222222";
const ok = (s, b) => expect(s.safeParse(b).success).toBe(true);
const bad = (s, b) => expect(s.safeParse(b).success).toBe(false);

test("itinerary: request_id is required", () => {
  bad(itineraryBody, { operations: [{ op: "update", id: ID, description: "x" }] });
  ok(itineraryBody, { request_id: RID, operations: [{ op: "update", id: ID, description: "x" }] });
});
test("itinerary: at most 10 operations, at least 1", () => {
  const op = { op: "update", id: ID, description: "x" };
  ok(itineraryBody, { request_id: RID, operations: Array(10).fill(op) });
  bad(itineraryBody, { request_id: RID, operations: Array(11).fill(op) });
  bad(itineraryBody, { request_id: RID, operations: [] });
});
test("itinerary: no delete, and hotel_checkin cannot be added", () => {
  bad(itineraryBody, { request_id: RID, operations: [{ op: "delete", id: ID }] });
  bad(itineraryBody, { request_id: RID, operations: [{ op: "add", date: "2031-01-01", entry_type: "hotel_checkin", title: "H" }] });
});
test("itinerary: add needs date, title and type; update needs id and cannot move days", () => {
  bad(itineraryBody, { request_id: RID, operations: [{ op: "add", entry_type: "food", title: "L" }] });
  ok(itineraryBody, { request_id: RID, operations: [{ op: "add", date: "2031-01-01", entry_type: "food", title: "L" }] });
  bad(itineraryBody, { request_id: RID, operations: [{ op: "update", description: "x" }] });
  bad(itineraryBody, { request_id: RID, operations: [{ op: "update", id: ID, date: "2031-01-02" }] });
});
test("itinerary: unknown fields rejected; source_saved_place_id must be a UUID", () => {
  bad(itineraryBody, { request_id: RID, operations: [{ op: "update", id: ID, linked_recommendation_id: ID }] });
  bad(itineraryBody, { request_id: RID, operations: [{ op: "update", id: ID, source_saved_place_id: "abc" }] });
  ok(itineraryBody, { request_id: RID, operations: [{ op: "update", id: ID, title: "T", source_saved_place_id: ID }] });
});
test("itinerary: location_decision only keep/clear and only on update", () => {
  ok(itineraryBody, { request_id: RID, operations: [{ op: "update", id: ID, title: "T", location_decision: "keep" }] });
  bad(itineraryBody, { request_id: RID, operations: [{ op: "update", id: ID, title: "T", location_decision: "guess" }] });
  bad(itineraryBody, { request_id: RID, operations: [{ op: "add", date: "2031-01-01", entry_type: "food", title: "L", location_decision: "keep" }] });
});
test("expenses: add needs date, category, amount and currency", () => {
  ok(expenseBody, { request_id: RID, operations: [{ op: "add", date: "2031-01-01", category: "food", amount: 2000, currency: "JPY" }] });
  bad(expenseBody, { request_id: RID, operations: [{ op: "add", date: "2031-01-01", category: "food", amount: 2000 }] });
  bad(expenseBody, { request_id: RID, operations: [{ op: "add", date: "2031-01-01", category: "bogus", amount: 1, currency: "JPY" }] });
});
test("expenses: no client-supplied conversion or base amounts, no delete", () => {
  bad(expenseBody, { request_id: RID, operations: [{ op: "update", id: ID, amount_ils: 100 }] });
  bad(expenseBody, { request_id: RID, operations: [{ op: "update", id: ID, rate: 40 }] });
  bad(expenseBody, { request_id: RID, operations: [{ op: "delete", id: ID }] });
  bad(expenseBody, { request_id: RID, operations: [{ op: "add", date: "2031-01-01", category: "food", amount: -5, currency: "JPY" }] });
});
test("expenses: description-only update is valid without money", () => {
  ok(expenseBody, { request_id: RID, operations: [{ op: "update", id: ID, description: "Ramen night" }] });
});
