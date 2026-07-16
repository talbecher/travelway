const DEMO_TRIP_ID = "11111111-1111-1111-1111-111111111111";
export const ACTIVE_TRIP_KEY = "active_trip_id";
export const ACTIVE_TRIP_EVENT = "active-trip-changed";

/**
 * Read the currently-active trip id at call time.
 * IMPORTANT: never cache this at module scope — the active trip can change
 * when the user signs in/out or joins a shared trip. Callers (queryFn,
 * insert payloads, etc.) MUST resolve it fresh on each call.
 */
export function getActiveTripId(): string {
  if (typeof window === "undefined") return DEMO_TRIP_ID;
  return window.localStorage.getItem(ACTIVE_TRIP_KEY) || DEMO_TRIP_ID;
}

export function setActiveTripId(id: string) {
  if (typeof window === "undefined") return;
  const prev = window.localStorage.getItem(ACTIVE_TRIP_KEY);
  window.localStorage.setItem(ACTIVE_TRIP_KEY, id);
  if (prev !== id) {
    window.dispatchEvent(new CustomEvent(ACTIVE_TRIP_EVENT, { detail: id }));
  }
}

export function clearActiveTripId() {
  if (typeof window === "undefined") return;
  const had = window.localStorage.getItem(ACTIVE_TRIP_KEY);
  window.localStorage.removeItem(ACTIVE_TRIP_KEY);
  if (had) window.dispatchEvent(new CustomEvent(ACTIVE_TRIP_EVENT, { detail: null }));
}

export const CITIES = [
  "Tokyo",
  "Kanazawa",
  "Kyoto",
  "Hiroshima",
  "Miyajima",
  "Osaka",
] as const;

export const CATEGORY_LABELS: Record<string, string> = {
  food: "אוכל",
  attraction: "אטרקציה",
  transport: "תחבורה",
  shopping: "קניות",
  accommodation: "לינה",
  other: "אחר",
};

export const CATEGORY_COLORS: Record<string, string> = {
  food: "var(--chart-1)",
  attraction: "var(--chart-2)",
  transport: "var(--chart-3)",
  shopping: "var(--chart-4)",
  accommodation: "var(--chart-5)",
  other: "var(--chart-6)",
};

export const CATEGORY_ICONS: Record<string, string> = {
  food: "🍜",
  attraction: "⛩",
  transport: "🚆",
  shopping: "🛍",
  accommodation: "🏨",
  other: "•",
};

export const ENTRY_TYPES = [
  { type: "flight", label: "טיסה", icon: "✈️" },
  { type: "hotel_checkin", label: "לינה", icon: "🏨" },
  { type: "attraction", label: "אטרקציה", icon: "⛩" },
  { type: "food", label: "אוכל", icon: "🍜" },
  { type: "transport", label: "תחבורה", icon: "🚆" },
  { type: "note", label: "הערה", icon: "📝" },
] as const;
