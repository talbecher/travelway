import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTripId } from "@/hooks/use-active-trip";

export type ItineraryVersion = {
  id: string;
  trip_id: string;
  name: string;
  source: string;
  ai_tool: string | null;
  is_active: boolean;
  created_at: string;
};

export function versionsQuery(tripId: string) {
  return queryOptions({
    queryKey: ["versions", tripId],
    enabled: !!tripId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("itinerary_versions")
        .select("*")
        .eq("trip_id", tripId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ItineraryVersion[];
    },
  });
}

export function useVersions(tripId?: string) {
  const active = useActiveTripId();
  return useQuery(versionsQuery(tripId ?? active));
}

/** Active version for a trip (falls back to the first one). */
export function useActiveVersion(tripId?: string) {
  const { data: versions = [], isLoading } = useVersions(tripId);
  const version = versions.find((v) => v.is_active) ?? versions[0] ?? null;
  return { version, versions, isLoading };
}

export function useSetActiveVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ tripId, versionId }: { tripId: string; versionId: string }) => {
      const { error: offErr } = await supabase
        .from("itinerary_versions")
        .update({ is_active: false })
        .eq("trip_id", tripId);
      if (offErr) throw offErr;
      const { error } = await supabase
        .from("itinerary_versions")
        .update({ is_active: true })
        .eq("id", versionId);
      if (error) throw error;
      return versionId;
    },
    onSuccess: (_id, vars) => {
      qc.invalidateQueries({ queryKey: ["versions", vars.tripId] });
      qc.invalidateQueries({ queryKey: ["days"] });
      qc.invalidateQueries({ queryKey: ["day-entries-summary"] });
    },
  });
}

export function useCreateVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      tripId,
      name,
      source,
      aiTool,
      cloneDaysFromVersionId,
    }: {
      tripId: string;
      name: string;
      source: "manual" | "ai";
      aiTool?: string | null;
      cloneDaysFromVersionId?: string | null;
    }) => {
      const { data: version, error } = await supabase
        .from("itinerary_versions")
        .insert({ trip_id: tripId, name, source, ai_tool: source === "ai" ? aiTool ?? null : null })
        .select()
        .single();
      if (error) throw error;

      if (cloneDaysFromVersionId) {
        const { data: srcDays, error: dErr } = await supabase
          .from("itinerary_days")
          .select("day_number, date, city_label")
          .eq("version_id", cloneDaysFromVersionId)
          .order("day_number");
        if (dErr) throw dErr;
        if (srcDays && srcDays.length > 0) {
          const { error: insErr } = await supabase.from("itinerary_days").insert(
            srcDays.map((d) => ({
              trip_id: tripId,
              version_id: version.id,
              day_number: d.day_number,
              date: d.date,
              city_label: d.city_label,
            }))
          );
          if (insErr) throw insErr;
        }
      }

      return version as ItineraryVersion;
    },
    onSuccess: (_v, vars) => {
      qc.invalidateQueries({ queryKey: ["versions", vars.tripId] });
    },
  });
}
