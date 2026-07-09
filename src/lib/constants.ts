const DEMO_TRIP_ID = "11111111-1111-1111-1111-111111111111";
export const ACTIVE_TRIP_KEY = "active_trip_id";
export const TRIP_ID: string =
  typeof window !== "undefined"
    ? window.localStorage.getItem(ACTIVE_TRIP_KEY) || DEMO_TRIP_ID
    : DEMO_TRIP_ID;

export function setActiveTripId(id: string) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(ACTIVE_TRIP_KEY, id);
  }
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
