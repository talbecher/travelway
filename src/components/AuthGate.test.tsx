// @ts-ignore -- matches the existing dependency-free bun test suite.
import { afterEach, describe, expect, it, mock } from "bun:test";

const effects: Array<() => void> = [];
const phases: string[] = [];
const clearCache = mock(() => {});
const clearTrip = mock(() => {});
const selectTrip = mock(() => {});
const signOut = mock(async () => ({}));
let result: { data: Array<{ id: string }> | null; error: unknown };
let thrown: Error | null = null;
const originalWindow = globalThis.window;
const actualReact = await import("react");

mock.module("react", () => ({
  ...actualReact,
  useEffect: (effect: () => void) => effects.push(effect),
  useRef: () => ({ current: null }),
  useState: (initial: string) => [initial, (phase: string) => phases.push(phase)],
}));
mock.module("@tanstack/react-query", () => ({ useQueryClient: () => ({ clear: clearCache }) }));
mock.module("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "traveler" }, loading: false }) }));
mock.module("@/components/SignInScreen", () => ({ SignInScreen: () => null }));
mock.module("@/components/TripPicker", () => ({ TripPicker: () => null }));
mock.module("@/lib/constants", () => ({
  ACTIVE_TRIP_KEY: "active_trip_id", setActiveTripId: selectTrip, clearActiveTripId: clearTrip,
  // Other test files sharing the module registry import this export.
  getActiveTripId: () => "trip",
}));
mock.module("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { signOut },
    from: () => ({ select: () => ({ order: async () => {
      if (thrown) throw thrown;
      return result;
    } }) }),
  },
}));

const { AuthGate } = await import("./AuthGate");

async function resolveGate() {
  // Only the stored selection is needed; no session or remote data is fabricated.
  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    localStorage: { getItem: () => "saved-trip" },
  } });
  AuthGate({ children: null });
  effects.splice(0).forEach((effect) => effect());
  await new Promise((resolve) => setTimeout(resolve, 0));
}

afterEach(() => {
  phases.length = 0;
  effects.length = 0;
  thrown = null;
  [clearCache, clearTrip, selectTrip, signOut].forEach((fn) => fn.mockClear());
  Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
});

describe("AuthGate trip-read failures", () => {
  for (const error of [
    { message: "TypeError: Failed to fetch", code: "" },
    { message: "Service temporarily unavailable", code: "503" },
    { message: "JWT expired", code: "PGRST301" },
  ]) {
    it(`keeps the session, selected trip and cache and leaves resolving on ${error.message}`, async () => {
      result = { data: null, error };
      await resolveGate();
      expect(phases.at(-1)).toBe("ready");
      expect(signOut).not.toHaveBeenCalled();
      expect(clearTrip).not.toHaveBeenCalled();
      expect(clearCache).not.toHaveBeenCalled();
      expect(selectTrip).not.toHaveBeenCalled();
    });
  }

  it("also preserves saved data when the request throws", async () => {
    thrown = new TypeError("Failed to fetch");
    await resolveGate();
    expect(phases.at(-1)).toBe("ready");
    expect(signOut).not.toHaveBeenCalled();
    expect(clearTrip).not.toHaveBeenCalled();
    expect(clearCache).not.toHaveBeenCalled();
  });

  it("still clears an inaccessible selected trip after a successful empty read", async () => {
    result = { data: [], error: null };
    await resolveGate();
    expect(phases.at(-1)).toBe("ready");
    expect(clearTrip).toHaveBeenCalledTimes(1);
    expect(clearCache).toHaveBeenCalledTimes(1);
    expect(signOut).not.toHaveBeenCalled();
  });
});