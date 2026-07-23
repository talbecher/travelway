import { supabase } from "@/integrations/supabase/client";
import { getActiveTripId } from "@/lib/constants";

export type HotelSyncInput = {
  id: string;
  hotel_name: string;
  city: string | null;
  checkin_date: string | null;
  checkout_date: string | null;
  price_per_night_ils: number | string | null;
  total_cost_ils: number | string | null;
  google_maps_url?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  photo_url?: string | null;
};

export type ItineraryDay = { id: string; date: string };

export type HotelSyncResult = {
  addedEntries: number;
  addedExpenses: number;
  nights: number;
  total: number;
};

/**
 * Sync a hotel's stay into the itinerary + expenses.
 * - Check-in day + middle nights: "לינה: {name}" @ 20:00 (end of day).
 * - Check-out day: "יציאה מ-{name}" @ 09:00 (start of day, shift others down).
 * - Removes any prior entries tied to this hotel (by linked_recommendation_id
 *   or by title match on the affected days) so date changes stay consistent.
 * - Rebuilds per-night expenses for this hotel (delete + insert).
 */
export async function syncHotelToItinerary(
  h: HotelSyncInput,
  days: ItineraryDay[],
): Promise<HotelSyncResult> {
  if (!h.checkin_date || !h.checkout_date) {
    throw new Error("חסרים תאריכים");
  }
  const matchingDays = days.filter(
    (d) => d.date >= h.checkin_date! && d.date < h.checkout_date!,
  );
  const checkinDay = days.find((d) => d.date === h.checkin_date) ?? null;
  const checkoutDay = days.find((d) => d.date === h.checkout_date) ?? null;
  const middleNights = matchingDays.filter((d) => d.date !== h.checkin_date);

  const nights = matchingDays.length;
  const priceN =
    Number(h.price_per_night_ils) ||
    (nights > 0 ? Number(h.total_cost_ils ?? 0) / nights : 0);
  const lat = h.latitude != null ? Number(h.latitude) : null;
  const lng = h.longitude != null ? Number(h.longitude) : null;

  const stayTitle = `לינה: ${h.hotel_name}`;
  const leaveTitle = `יציאה מ${h.hotel_name}`;
  const morningTitle = `בוקר ב${h.hotel_name}`;

  // ── 1. Remove prior day_entries for this hotel across ALL trip days
  //       (handles date changes: entries on days no longer in range must go).
  const allDayIds = days.map((d) => d.id);
  if (allDayIds.length > 0) {
    // By linked_recommendation_id (canonical link)
    const { error: delLinkErr } = await supabase
      .from("day_entries")
      .delete()
      .in("day_id", allDayIds)
      .eq("entry_type", "hotel_checkin")
      .eq("linked_recommendation_id", h.id);
    if (delLinkErr) throw delLinkErr;

    // Fallback: legacy rows without linked_recommendation_id — match by title
    const { error: delTitleErr } = await supabase
      .from("day_entries")
      .delete()
      .in("day_id", allDayIds)
      .eq("entry_type", "hotel_checkin")
      .is("linked_recommendation_id", null)
      .or(`title.eq.${stayTitle},title.eq.${leaveTitle},title.eq.${morningTitle}`);
    if (delTitleErr) throw delTitleErr;
  }

  let addedEntries = 0;

  const insertEndOfDay = async (dayId: string, title: string) => {
    const { count } = await supabase
      .from("day_entries")
      .select("id", { count: "exact", head: true })
      .eq("day_id", dayId);
    const { error } = await supabase.from("day_entries").insert({
      day_id: dayId,
      entry_type: "hotel_checkin",
      title,
      location_name: h.city,
      google_maps_url: h.google_maps_url ?? null,
      icon_emoji: "🏨",
      time_of_day: "20:00",
      display_order: count ?? 0,
      latitude: lat,
      longitude: lng,
      photo_url: h.photo_url ?? null,
      linked_recommendation_id: h.id,
    });
    if (error) throw error;
    addedEntries++;
  };

  if (checkinDay) await insertEndOfDay(checkinDay.id, stayTitle);
  for (const d of middleNights) {
    await insertEndOfDay(d.id, stayTitle);
  }

  if (checkoutDay) {
    const { data: existing } = await supabase
      .from("day_entries")
      .select("id, display_order")
      .eq("day_id", checkoutDay.id)
      .order("display_order", { ascending: false });
    for (const row of existing ?? []) {
      const { error } = await supabase
        .from("day_entries")
        .update({ display_order: (row.display_order ?? 0) + 1 })
        .eq("id", row.id);
      if (error) throw error;
    }
    const { error } = await supabase.from("day_entries").insert({
      day_id: checkoutDay.id,
      entry_type: "hotel_checkin",
      title: leaveTitle,
      location_name: h.city,
      google_maps_url: h.google_maps_url ?? null,
      icon_emoji: "🏨",
      time_of_day: "09:00",
      display_order: 0,
      latitude: lat,
      longitude: lng,
      photo_url: h.photo_url ?? null,
      linked_recommendation_id: h.id,
    });
    if (error) throw error;
    addedEntries++;
  }

  // ── 2. Rebuild per-night expenses for this hotel
  const tripId = getActiveTripId();
  const { error: delExpErr } = await supabase
    .from("expenses")
    .delete()
    .eq("trip_id", tripId)
    .eq("category", "accommodation")
    .eq("description", h.hotel_name);
  if (delExpErr) throw delExpErr;

  let addedExpenses = 0;
  if (priceN > 0) {
    for (const d of matchingDays) {
      const { error } = await supabase.from("expenses").insert({
        trip_id: tripId,
        category: "accommodation",
        amount_ils: priceN,
        description: h.hotel_name,
        location_name: h.city,
        expense_date: d.date,
      });
      if (error) throw error;
      addedExpenses++;
    }
  }

  return { addedEntries, addedExpenses, nights, total: priceN * nights };
}

/** True if this hotel already has any linked day_entries in the itinerary. */
export async function hotelHasItineraryEntries(hotelId: string): Promise<boolean> {
  const { count, error } = await supabase
    .from("day_entries")
    .select("id", { count: "exact", head: true })
    .eq("entry_type", "hotel_checkin")
    .eq("linked_recommendation_id", hotelId);
  if (error) throw error;
  return (count ?? 0) > 0;
}
