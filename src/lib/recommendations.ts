import { supabase } from "@/integrations/supabase/client";
import { getActiveTripId } from "@/lib/constants";
import { resolveDayLocation } from "@/lib/day-location";
import { insertDayEntry } from "@/lib/day-entry-insert";

export type RecType = "food" | "attraction" | "hotel";

export function categoryToRecType(cat: string): RecType | null {
  if (cat === "food") return "food";
  if (cat === "attraction") return "attraction";
  if (cat === "accommodation") return "hotel";
  return null;
}

export function recTypeToEntryType(t: string): "food" | "attraction" | "hotel_checkin" {
  if (t === "food") return "food";
  if (t === "hotel") return "hotel_checkin";
  return "attraction";
}

export function recTypeIcon(t: string): string {
  if (t === "food") return "🍜";
  if (t === "hotel") return "🏨";
  return "⛩";
}

export async function saveRecommendation(input: {
  type: RecType;
  name: string;
  city?: string | null;
  address?: string | null;
  google_maps_url?: string | null;
  notes?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  provider?: string | null;
  provider_place_id?: string | null;
}): Promise<string> {
  const coords = resolveDayLocation(input);
  const { data, error } = await supabase
    .from("recommendations")
    .insert({
      trip_id: getActiveTripId(),
      type: input.type,
      name: input.name,
      city: input.city || null,
      address: input.address || null,
      google_maps_url: input.google_maps_url || null,
      notes: input.notes || null,
      latitude: coords?.lat ?? null,
      longitude: coords?.lng ?? null,
      provider: input.provider ?? null,
      provider_place_id: input.provider_place_id ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function addRecommendationToDay(rec: {
  id: string;
  type: string;
  name: string;
  city: string | null;
  address?: string | null;
  google_maps_url: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  photo_url?: string | null;
}, dayId: string): Promise<void> {
  const entryType = recTypeToEntryType(rec.type);
  const coords = resolveDayLocation(rec);
  // No time on a saved recommendation → appended at the end (insertDayEntry's rule).
  await insertDayEntry({
    day_id: dayId,
    entry_type: entryType,
    title: rec.name,
    location_name: rec.address || [rec.name, rec.city].filter(Boolean).join(", "),
    google_maps_url: rec.google_maps_url,
    icon_emoji: recTypeIcon(rec.type),
    linked_recommendation_id: rec.id,
    latitude: coords?.lat ?? null,
    longitude: coords?.lng ?? null,
    photo_url: rec.photo_url ?? null,
  });
}
