import { queryOptions, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTripId } from "@/hooks/use-active-trip";
import { useActiveVersion } from "@/hooks/use-versions";

/**
 * All trip-scoped query keys MUST include the active tripId so cached data
 * from another trip/user cannot bleed through when the active trip changes.
 */

export function tripQuery(tripId: string) {
  return queryOptions({
    queryKey: ["trip", tripId],
    queryFn: async () => {
      const { data, error } = await supabase.from("trips").select("*").eq("id", tripId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function daysQuery(tripId: string, versionId?: string | null) {
  return queryOptions({
    queryKey: ["days", tripId, versionId ?? null],
    enabled: !!tripId && !!versionId,
    queryFn: async () => {
      let q = supabase.from("itinerary_days").select("*").eq("trip_id", tripId);
      if (versionId) q = q.eq("version_id", versionId);
      const { data, error } = await q.order("day_number");
      if (error) throw error;
      return data ?? [];
    },
  });
}


export function recsQuery(tripId: string) {
  return queryOptions({
    queryKey: ["recs", tripId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recommendations")
        .select("*")
        .eq("trip_id", tripId)
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function hotelsQuery(tripId: string) {
  return queryOptions({
    queryKey: ["hotels", tripId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hotels")
        .select("*")
        .eq("trip_id", tripId)
        .order("checkin_date");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function expensesQuery(tripId: string) {
  return queryOptions({
    queryKey: ["expenses", tripId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("*")
        .eq("trip_id", tripId)
        .order("expense_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function settingsQuery(tripId: string) {
  return queryOptions({
    queryKey: ["settings", tripId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("settings")
        .select("*")
        .eq("trip_id", tripId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function dayEntriesQuery(dayId: string) {
  return queryOptions({
    queryKey: ["day-entries", dayId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("day_entries")
        .select("*, latitude, longitude, recommendations(id,name,city,google_maps_url)")
        .eq("day_id", dayId)
        .order("display_order")
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useTrip() { return useQuery(tripQuery(useActiveTripId())); }
export function useDays() {
  const tripId = useActiveTripId();
  const { version } = useActiveVersion(tripId);
  return useQuery(daysQuery(tripId, version?.id));
}
export function useRecs() { return useQuery(recsQuery(useActiveTripId())); }
export function useHotels() { return useQuery(hotelsQuery(useActiveTripId())); }
export function useExpenses() { return useQuery(expensesQuery(useActiveTripId())); }
export function useSettings() { return useQuery(settingsQuery(useActiveTripId())); }
