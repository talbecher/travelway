import { queryOptions, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTripId } from "@/hooks/use-active-trip";
import { useActiveVersion } from "@/hooks/use-versions";
import { todayLocal } from "@/lib/format";
import type { GeoEntry } from "@/lib/day-suggest";

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
    staleTime: 5 * 60 * 1000,
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
export function useTripIsActive(): boolean {
  const { data: trip } = useTrip();
  if (!trip?.start_date || !trip?.end_date) return false;
  const today = todayLocal();
  return today >= trip.start_date && today <= trip.end_date;
}
export function useDays() {
  const tripId = useActiveTripId();
  const { version } = useActiveVersion(tripId);
  return useQuery(daysQuery(tripId, version?.id));
}
export function useRecs() { return useQuery(recsQuery(useActiveTripId())); }
export function useHotels() { return useQuery(hotelsQuery(useActiveTripId())); }
export function useExpenses() { return useQuery(expensesQuery(useActiveTripId())); }
export function useSettings() { return useQuery(settingsQuery(useActiveTripId())); }

export type RecSourcesData = {
  sources: { id: string; name: string }[];
  byRec: Record<string, string[]>; // recommendation_id -> source ids
};

/** All import sources of a trip + every rec↔source link, paged past the 1000-row API cap. */
export function recSourcesQuery(tripId: string) {
  return queryOptions({
    queryKey: ["rec-sources", tripId],
    enabled: !!tripId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<RecSourcesData> => {
      const { data: sources, error } = await supabase
        .from("import_sources")
        .select("id, name")
        .eq("trip_id", tripId)
        .order("created_at");
      if (error) throw error;
      const byRec: Record<string, string[]> = {};
      const ids = (sources ?? []).map((s) => s.id);
      if (ids.length === 0) return { sources: [], byRec };
      const PAGE = 1000;
      for (let from = 0; ; from += PAGE) {
        const { data, error: e2 } = await supabase
          .from("recommendation_sources")
          .select("recommendation_id, source_id")
          .in("source_id", ids)
          .order("recommendation_id")
          .order("source_id")
          .range(from, from + PAGE - 1);
        if (e2) throw e2;
        for (const l of data ?? []) (byRec[l.recommendation_id] ??= []).push(l.source_id);
        if (!data || data.length < PAGE) break;
      }
      return { sources: sources ?? [], byRec };
    },
  });
}
export function useRecSources() { return useQuery(recSourcesQuery(useActiveTripId())); }

/**
 * Located-stop summary for the active trip + version (day-suggestion in "add to day").
 * Key shares the ["day-entries-summary", tripId, versionId] prefix (siblings: "home", "itinerary") so every existing
 * itinerary invalidation refreshes it; paged past the 1000-row API cap.
 */
export function dayEntriesGeoQuery(tripId: string, versionId?: string | null) {
  return queryOptions({
    queryKey: ["day-entries-summary", tripId, versionId ?? null, "geo"],
    enabled: !!tripId && !!versionId,
    queryFn: async (): Promise<Record<string, GeoEntry[]>> => {
      const PAGE = 1000;
      const map: Record<string, GeoEntry[]> = {};
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from("day_entries")
          .select("id, day_id, title, latitude, longitude, linked_recommendation_id, display_order, created_at, itinerary_days!inner(trip_id, version_id)")
          .eq("itinerary_days.trip_id", tripId)
          .eq("itinerary_days.version_id", versionId!)
          .order("display_order")
          .order("created_at")
          .order("id")
          .range(from, from + PAGE - 1);
        if (error) throw error;
        const rows = (data ?? []) as unknown as GeoEntry[];
        for (const e of rows) (map[e.day_id] ||= []).push(e);
        if (rows.length < PAGE) break;
      }
      return map;
    },
  });
}
export function useDayEntriesGeo() {
  const tripId = useActiveTripId();
  const { version } = useActiveVersion(tripId);
  return useQuery(dayEntriesGeoQuery(tripId, version?.id));
}
