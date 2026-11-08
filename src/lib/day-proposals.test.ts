// @ts-nocheck -- run with `bun test`; bun:test types are not installed (no new deps).
import { describe, expect, test } from "bun:test";
import { normalizeProposalEntries, proposalLocation } from "./day-proposals.server";

const base = { entry_type: "attraction", title: "Kaminarimon" };

describe("proposal locations", () => {
  test("complete in-range pair is kept", () => {
    expect(proposalLocation({ ...base, latitude: 35.71, longitude: 139.79 })).toEqual({ latitude: 35.71, longitude: 139.79 });
  });
  test("partial, non-numeric, out-of-range and 0,0 pairs reject the proposal", () => {
    for (const bad of [{ latitude: 35 }, { longitude: 139 }, { latitude: "35", longitude: 139 }, { latitude: 91, longitude: 0 }, { latitude: 10, longitude: 181 }, { latitude: 0, longitude: 0 }, { latitude: NaN, longitude: 1 }]) {
      expect(proposalLocation({ ...base, ...bad })).toBeNull();
      expect(normalizeProposalEntries([{ ...base, ...bad }]).entries).toEqual([]);
    }
  });
  test("explicit destination Maps URL is kept; viewport, short and foreign links are dropped", () => {
    const ok = "https://www.google.com/maps/search/?api=1&query=35.71,139.79";
    expect(proposalLocation({ ...base, google_maps_url: ok })).toEqual({ google_maps_url: ok });
    for (const u of ["https://www.google.com/maps/@35.7,139.8,15z", "https://maps.app.goo.gl/abc", "https://evil.com/maps?q=1,2", "http://www.google.com/maps/search/?api=1&query=35.71,139.79"]) {
      expect(proposalLocation({ ...base, google_maps_url: u })).toEqual({});
    }
  });
  test("no location stays missing (no invented coordinates)", () => {
    const [e] = normalizeProposalEntries([{ ...base }]).entries;
    expect(e.latitude).toBeUndefined();
    expect(e.google_maps_url).toBeUndefined();
  });
});

describe("saved place source id", () => {
  const id = "0f8fad5b-d9cb-469f-a165-70867728950e";
  test("valid id is passed through and supplied coordinates are dropped (server copies the saved location)", () => {
    const [e] = normalizeProposalEntries([{ ...base, title: "Renamed", source_saved_place_id: id, latitude: 1, longitude: 2, google_maps_url: "https://www.google.com/maps/search/?api=1&query=1,2" }]).entries;
    expect(e.source_saved_place_id).toBe(id);
    expect(e.latitude).toBeUndefined();
    expect(e.google_maps_url).toBeUndefined();
  });
  test("malformed id rejects the proposal instead of falling back to supplied coordinates", () => {
    for (const bad of ["nope", "", 5, null]) {
      expect(normalizeProposalEntries([{ ...base, source_saved_place_id: bad, latitude: 35.7, longitude: 139.8 }]).entries).toEqual([]);
    }
  });
  test("no id keeps the old behavior", () => {
    expect(proposalLocation({ ...base, latitude: 35.71, longitude: 139.79 })).toEqual({ latitude: 35.71, longitude: 139.79 });
  });
});
