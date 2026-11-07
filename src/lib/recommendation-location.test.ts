// @ts-nocheck -- bun:test is supplied by the test runner.
import { expect, test, mock } from "bun:test";
const writes: any[] = [];
mock.module("@/integrations/supabase/client", () => ({ supabase: { from: () => ({
  select: () => ({ eq: async () => ({ count: 3 }) }),
  insert: (row: any) => { writes.push(row); return { error: null, select: () => ({ single: async () => ({ data: { id: "rec" }, error: null }) }) }; },
}) } }));
mock.module("@/lib/constants", () => ({ getActiveTripId: () => "trip" }));
const { addRecommendationToDay, saveRecommendation } = await import("./recommendations");
test("selected place added to day retains coords and source association without Place ID", async () => {
  await addRecommendationToDay({ id: "source", type: "attraction", name: "Gate", city: "Tokyo", address: "Asakusa", latitude: 35.711, longitude: 139.796, google_maps_url: null }, "day");
  expect(writes.at(-1)).toMatchObject({ latitude: 35.711, longitude: 139.796, linked_recommendation_id: "source", location_name: "Asakusa", day_id: "day" });
});
test("invalid pair falls back to trusted explicit destination, never viewport", async () => {
  await addRecommendationToDay({ id: "pin", type: "food", name: "Cafe", city: "Tokyo", latitude: 91, longitude: null, google_maps_url: "https://www.google.com/maps/search/?api=1&query=35,139" }, "day");
  expect(writes.at(-1)).toMatchObject({ latitude: 35, longitude: 139 });
  await addRecommendationToDay({ id: "text", type: "food", name: "Cafe", city: "Tokyo", latitude: null, longitude: null, google_maps_url: "https://www.google.com/maps/@35,139,15z" }, "day");
  expect(writes.at(-1)).toMatchObject({ latitude: null, longitude: null, location_name: "Cafe, Tokyo" });
});
test("manual Google selection saves its actual coordinates and identity together", async () => {
  await saveRecommendation({ name: "Selected", type: "food", latitude: 0, longitude: 139, provider: "google", provider_place_id: "selected-id" });
  expect(writes.at(-1)).toMatchObject({ latitude: 0, longitude: 139, provider_place_id: "selected-id", trip_id: "trip" });
});