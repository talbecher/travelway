import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type SnapshotReason = "ai_import" | "pre_restore" | "manual";

export type DaySnapshot = {
  id: string;
  day_id: string;
  trip_id: string;
  name: string;
  reason: string;
  entries: unknown;
  entry_count: number;
  created_at: string;
};

const MAX_SNAPSHOTS = 10;

/** Columns copied into a snapshot — everything except identity/derived fields. */
const ENTRY_FIELDS = [
  "entry_type",
  "title",
  "description",
  "time_of_day",
  "location_name",
  "google_maps_url",
  "icon_emoji",
  "display_order",
  "linked_recommendation_id",
  "linked_hotel_id",
  "latitude",
  "longitude",
  "photo_url",
] as const;

export function daySnapshotsQuery(dayId: string) {
  return queryOptions({
    queryKey: ["day-snapshots", dayId],
    enabled: !!dayId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("day_snapshots")
        .select("*")
        .eq("day_id", dayId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as DaySnapshot[];
    },
  });
}

export function useDaySnapshots(dayId: string) {
  return useQuery(daySnapshotsQuery(dayId));
}

function stamp(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function defaultSnapshotName(reason: SnapshotReason) {
  const prefix =
    reason === "ai_import" ? "לפני ייבוא AI" : reason === "pre_restore" ? "לפני שחזור" : "נקודת שמירה";
  return `${prefix} · ${stamp()}`;
}

/**
 * Captures the current state of a day's entries as a restore point.
 * Safe to call before destructive operations (AI import, restore).
 */
export async function createDaySnapshot(opts: {
  dayId: string;
  tripId: string;
  reason: SnapshotReason;
  name?: string;
}): Promise<DaySnapshot | null> {
  const { data: rows, error } = await supabase
    .from("day_entries")
    .select("*")
    .eq("day_id", opts.dayId)
    .order("display_order")
    .order("created_at");
  if (error) throw error;

  const entries = (rows ?? []).map((r) => {
    const out: Record<string, unknown> = {};
    for (const f of ENTRY_FIELDS) out[f] = (r as Record<string, unknown>)[f] ?? null;
    return out;
  });

  const { data, error: insErr } = await supabase
    .from("day_snapshots")
    .insert({
      day_id: opts.dayId,
      trip_id: opts.tripId,
      reason: opts.reason,
      name: opts.name ?? defaultSnapshotName(opts.reason),
      entries: entries as never,
      entry_count: entries.length,
    })
    .select()
    .single();
  if (insErr) throw insErr;

  await pruneSnapshots(opts.dayId);
  return data as DaySnapshot;
}

async function pruneSnapshots(dayId: string) {
  const { data } = await supabase
    .from("day_snapshots")
    .select("id")
    .eq("day_id", dayId)
    .order("created_at", { ascending: false });
  const extra = (data ?? []).slice(MAX_SNAPSHOTS).map((s) => s.id);
  if (extra.length) await supabase.from("day_snapshots").delete().in("id", extra);
}

export function useCreateDaySnapshot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createDaySnapshot,
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ["day-snapshots", v.dayId] }),
  });
}

export function useRestoreDaySnapshot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ snapshot }: { snapshot: DaySnapshot }) => {
      // Keep an undo point of the current state before overwriting it.
      await createDaySnapshot({
        dayId: snapshot.day_id,
        tripId: snapshot.trip_id,
        reason: "pre_restore",
      });

      const { error: delErr } = await supabase
        .from("day_entries")
        .delete()
        .eq("day_id", snapshot.day_id);
      if (delErr) throw delErr;

      const rows = Array.isArray(snapshot.entries) ? (snapshot.entries as Record<string, unknown>[]) : [];
      if (rows.length) {
        const payload = rows.map((r, i) => ({ ...r, day_id: snapshot.day_id, display_order: i }));
        const { error } = await supabase.from("day_entries").insert(payload as never);
        if (error) throw error;
      }
      return rows.length;
    },
    onSuccess: (_n, v) => {
      qc.invalidateQueries({ queryKey: ["day-entries", v.snapshot.day_id] });
      qc.invalidateQueries({ queryKey: ["day-entries-summary"] });
      qc.invalidateQueries({ queryKey: ["day-snapshots", v.snapshot.day_id] });
    },
  });
}

export function useRenameDaySnapshot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string; dayId: string }) => {
      const { error } = await supabase.from("day_snapshots").update({ name }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ["day-snapshots", v.dayId] }),
  });
}

export function useDeleteDaySnapshot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; dayId: string }) => {
      const { error } = await supabase.from("day_snapshots").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ["day-snapshots", v.dayId] }),
  });
}
