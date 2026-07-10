import { supabase } from "@/integrations/supabase/client";
import { TRIP_ID } from "@/lib/constants";
import { parseLatLngFromMapsUrl } from "@/lib/coords";

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
}): Promise<string> {
  const coords = parseLatLngFromMapsUrl(input.google_maps_url);
  const { data, error } = await supabase
    .from("recommendations")
    .insert({
      trip_id: TRIP_ID,
      type: input.type,
      name: input.name,
      city: input.city || null,
      address: input.address || null,
      google_maps_url: input.google_maps_url || null,
      notes: input.notes || null,
      latitude: coords?.lat ?? null,
      longitude: coords?.lng ?? null,
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
  google_maps_url: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
}, dayId: string): Promise<void> {
  const entryType = recTypeToEntryType(rec.type);
  const { count } = await supabase
    .from("day_entries")
    .select("id", { count: "exact", head: true })
    .eq("day_id", dayId);
  const coords = rec.latitude != null && rec.longitude != null
    ? { lat: Number(rec.latitude), lng: Number(rec.longitude) }
    : parseLatLngFromMapsUrl(rec.google_maps_url);
  const { error } = await supabase.from("day_entries").insert({
    day_id: dayId,
    entry_type: entryType,
    title: rec.name,
    location_name: rec.city,
    google_maps_url: rec.google_maps_url,
    icon_emoji: recTypeIcon(rec.type),
    linked_recommendation_id: rec.id,
    display_order: count ?? 0,
    latitude: coords?.lat ?? null,
    longitude: coords?.lng ?? null,
  });
  if (error) throw error;
}
