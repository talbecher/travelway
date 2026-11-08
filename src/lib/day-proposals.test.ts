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
