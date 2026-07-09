import { queryOptions, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { TRIP_ID } from "@/lib/constants";

export const tripQuery = queryOptions({
  queryKey: ["trip"],
  queryFn: async () => {
    const { data, error } = await supabase.from("trips").select("*").eq("id", TRIP_ID).maybeSingle();
    if (error) throw error;
    return data;
  },
});

export const daysQuery = queryOptions({
  queryKey: ["days"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("itinerary_days")
      .select("*")
      .eq("trip_id", TRIP_ID)
      .order("day_number");
    if (error) throw error;
    return data ?? [];
  },
});

export const recsQuery = queryOptions({
  queryKey: ["recs"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("recommendations")
      .select("*")
      .eq("trip_id", TRIP_ID)
      .order("created_at");
    if (error) throw error;
    return data ?? [];
  },
});

export const hotelsQuery = queryOptions({
  queryKey: ["hotels"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("hotels")
      .select("*")
      .eq("trip_id", TRIP_ID)
      .order("checkin_date");
    if (error) throw error;
    return data ?? [];
  },
});

export const expensesQuery = queryOptions({
  queryKey: ["expenses"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("expenses")
      .select("*")
      .eq("trip_id", TRIP_ID)
      .order("expense_date", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  },
});

export const settingsQuery = queryOptions({
  queryKey: ["settings"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("settings")
      .select("*")
      .eq("trip_id", TRIP_ID)
      .maybeSingle();
    if (error) throw error;
    return data;
  },
});

export function dayEntriesQuery(dayId: string) {
  return queryOptions({
    queryKey: ["day-entries", dayId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("day_entries")
        .select("*, recommendations(id,name,city,google_maps_url)")
        .eq("day_id", dayId)
        .order("display_order")
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useTrip() { return useQuery(tripQuery); }
export function useDays() { return useQuery(daysQuery); }
export function useRecs() { return useQuery(recsQuery); }
export function useHotels() { return useQuery(hotelsQuery); }
export function useExpenses() { return useQuery(expensesQuery); }
export function useSettings() { return useQuery(settingsQuery); }
