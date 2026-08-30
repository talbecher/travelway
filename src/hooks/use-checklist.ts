import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTripId } from "@/hooks/use-active-trip";
import type { ChecklistPriority } from "@/lib/checklist-templates";

export type ChecklistItem = {
  id: string;
  trip_id: string;
  title: string;
  category: string;
  notes: string | null;
  due_date: string | null;
  priority: ChecklistPriority;
  is_done: boolean;
  done_at: string | null;
  display_order: number;
  created_at: string;
};

export type NewChecklistItem = {
  title: string;
  category: string;
  priority?: ChecklistPriority;
  notes?: string | null;
  due_date?: string | null;
  display_order?: number;
};

export function useChecklistItems() {
  const tripId = useActiveTripId();
  return useQuery({
    queryKey: ["checklist", tripId],
    enabled: !!tripId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("checklist_items")
        .select("*")
        .eq("trip_id", tripId)
        .order("category")
        .order("display_order")
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as ChecklistItem[];
    },
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  const tripId = useActiveTripId();
  return () => qc.invalidateQueries({ queryKey: ["checklist", tripId] });
}

export function useAddChecklistItem() {
  const tripId = useActiveTripId();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (item: NewChecklistItem) => {
      const { error } = await supabase.from("checklist_items").insert({
        trip_id: tripId,
        title: item.title,
        category: item.category,
        priority: item.priority ?? "normal",
        notes: item.notes ?? null,
        due_date: item.due_date ?? null,
        display_order: item.display_order ?? 0,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useUpdateChecklistItem() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<NewChecklistItem> }) => {
      const { error } = await supabase.from("checklist_items").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useToggleChecklistItem() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ id, done }: { id: string; done: boolean }) => {
      const { error } = await supabase
        .from("checklist_items")
        .update({ is_done: done, done_at: done ? new Date().toISOString() : null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useDeleteChecklistItem() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("checklist_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useBulkAddItems() {
  const tripId = useActiveTripId();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (items: NewChecklistItem[]) => {
      if (items.length === 0) return;
      const rows = items.map((item, i) => ({
        trip_id: tripId,
        title: item.title,
        category: item.category,
        priority: item.priority ?? "normal",
        notes: item.notes ?? null,
        due_date: item.due_date ?? null,
        display_order: item.display_order ?? i,
      }));
      const { error } = await supabase.from("checklist_items").insert(rows);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

/** Shared celebration helper — lazy-loads confetti so it never blocks render. */
export async function celebrate(kind: "small" | "category" | "all") {
  if (typeof window === "undefined") return;
  const confetti = (await import("canvas-confetti")).default;
  if (kind === "small") {
    confetti({ particleCount: 20, spread: 40, origin: { y: 0.7 }, ticks: 60 });
    return;
  }
  if (kind === "category") {
    confetti({ particleCount: 60, spread: 70, origin: { y: 0.65 } });
    return;
  }
  confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
  setTimeout(() => confetti({ particleCount: 100, spread: 100, origin: { y: 0.4 } }), 400);
  setTimeout(() => confetti({ particleCount: 120, spread: 120, origin: { y: 0.5 } }), 900);
}
