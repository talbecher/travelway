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

type ExistingAccommodationExpense = {
  id: string;
  linked_hotel_id?: string | null;
  description: string | null;
  location_name: string | null;
  expense_date: string;
  amount_ils: number | string | null;
};

function compactUnique(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(values.map((v) => v?.trim()).filter((v): v is string => !!v)),
  );
}

function hotelSignature(value: string | null | undefined): string {
  if (!value) return "";
  const genericWords = new Set([
    "hotel",
    "hotels",
    "the",
    "מלון",
    "לינה",
  ]);
  return value
    .toLowerCase()
    .replace(/[׳'״"`’‘.,:;()\[\]{}\-_/\\|]+/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !genericWords.has(token))
    .sort()
    .join(" ");
}

function sameText(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();
}

function sameAmount(a: number | string | null | undefined, b: number): boolean {
  return Math.abs(Number(a ?? 0) - b) < 0.01;
}

/**
 * Sync a hotel's stay into the itinerary + expenses.
 * - Check-in day: "לינה: {name}" @ 20:00.
 * - Middle nights: "בוקר ב: {name}" @ 09:00 + "לינה: {name}" @ 20:00.
 * - Check-out day: "יציאה מ{name}" @ 09:00.
 * - Deletes prior entries for this hotel (by linked_hotel_id, plus title
 *   fallback covering the previous name when renamed / legacy rows).
 * - Rebuilds per-night expenses for this hotel.
 */
export async function syncHotelToItinerary(
  h: HotelSyncInput,
  days: ItineraryDay[],
  previousName?: string,
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

  const names = compactUnique([h.hotel_name, previousName]);
  const titleVariants = names.flatMap((n) => [
    `לינה: ${n}`,
    `יציאה מ${n}`,
    `בוקר ב: ${n}`,
    `בוקר ב${n}`, // legacy format (pre "בוקר ב: ")
  ]);

  // ── 1. Remove prior day_entries for this hotel across ALL trip days.
  const allDayIds = days.map((d) => d.id);
  if (allDayIds.length > 0) {
    // Canonical link by hotel id.
    const { error: delLinkErr } = await supabase
      .from("day_entries")
      .delete()
      .in("day_id", allDayIds)
      .eq("entry_type", "hotel_checkin")
      .eq("linked_hotel_id", h.id);
    if (delLinkErr) throw delLinkErr;

    // Fallback: legacy rows / renamed hotel — match by known titles.
    if (titleVariants.length > 0) {
      const { error: delTitleErr } = await supabase
        .from("day_entries")
        .delete()
        .in("day_id", allDayIds)
        .eq("entry_type", "hotel_checkin")
        .is("linked_hotel_id", null)
        .in("title", titleVariants);
      if (delTitleErr) throw delTitleErr;
    }
  }

  const stayTitle = `לינה: ${h.hotel_name}`;
  const leaveTitle = `יציאה מ${h.hotel_name}`;
  const morningTitle = `בוקר ב: ${h.hotel_name}`;

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
      linked_hotel_id: h.id,
    });
    if (error) throw error;
    addedEntries++;
  };

  const insertStartOfDay = async (dayId: string, title: string) => {
    const { data: existing } = await supabase
      .from("day_entries")
      .select("id, display_order")
      .eq("day_id", dayId)
      .order("display_order", { ascending: false });
    for (const row of existing ?? []) {
      const { error } = await supabase
        .from("day_entries")
        .update({ display_order: (row.display_order ?? 0) + 1 })
        .eq("id", row.id);
      if (error) throw error;
    }
    const { error } = await supabase.from("day_entries").insert({
      day_id: dayId,
      entry_type: "hotel_checkin",
      title,
      location_name: h.city,
      google_maps_url: h.google_maps_url ?? null,
      icon_emoji: "🏨",
      time_of_day: "09:00",
      display_order: 0,
      latitude: lat,
      longitude: lng,
      photo_url: h.photo_url ?? null,
      linked_hotel_id: h.id,
    });
    if (error) throw error;
    addedEntries++;
  };

  if (checkinDay) await insertEndOfDay(checkinDay.id, stayTitle);
  for (const d of middleNights) {
    await insertStartOfDay(d.id, morningTitle);
    await insertEndOfDay(d.id, stayTitle);
  }

  if (checkoutDay) {
    await insertStartOfDay(checkoutDay.id, leaveTitle);
  }

  // ── 2. Rebuild per-night expenses for this hotel.
  // Fetch-and-delete by ids instead of relying only on exact text equality:
  // legacy rows may have the same hotel words in a different order/casing
  // (for example "Hotel RIO Shinjuku" vs "rio hotel shinjuku").
  const tripId = getActiveTripId();
  const targetSignatures = new Set(names.map(hotelSignature).filter(Boolean));
  const targetDates = new Set(matchingDays.map((d) => d.date));
  const { data: existingExpenses, error: existingExpErr } = await supabase
    .from("expenses")
    .select("id, linked_hotel_id, description, location_name, expense_date, amount_ils")
    .eq("trip_id", tripId)
    .eq("category", "accommodation");
  if (existingExpErr) throw existingExpErr;

  const expenseIdsToDelete = ((existingExpenses ?? []) as ExistingAccommodationExpense[])
    .filter((expense) => {
      const description = expense.description ?? "";
      const exactNameMatch = names.some((name) => sameText(description, name));
      const signatureMatch = targetSignatures.has(hotelSignature(description));
      const locationSignatureMatch = targetSignatures.has(
        hotelSignature(expense.location_name),
      );
      const linkedHotelMatch = expense.linked_hotel_id === h.id;
      const sameStayLine =
        targetDates.has(expense.expense_date) &&
        sameAmount(expense.amount_ils, priceN) &&
        locationSignatureMatch;
      return linkedHotelMatch || exactNameMatch || signatureMatch || sameStayLine;
    })
    .map((expense) => expense.id);

  if (expenseIdsToDelete.length > 0) {
    const { error: delExpErr } = await supabase
      .from("expenses")
      .delete()
      .in("id", expenseIdsToDelete);
    if (delExpErr) throw delExpErr;
  }

  let addedExpenses = 0;
  if (priceN > 0) {
    for (const d of matchingDays) {
      const { error } = await supabase.from("expenses").insert({
        trip_id: tripId,
        category: "accommodation",
        amount_ils: priceN,
        description: h.hotel_name,
        location_name: h.city,
        linked_hotel_id: h.id,
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
    .eq("linked_hotel_id", hotelId);
  if (error) throw error;
  return (count ?? 0) > 0;
}
