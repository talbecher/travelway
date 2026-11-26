import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert } from "@/integrations/supabase/types";
import { compareDayEntryOrder, planDayInsert, type DayOrderEntry } from "@/lib/day-insert-order";

/**
 * Single insert path for a new stop on a day: reads the day's current order fresh,
 * places the stop by its time (see planDayInsert), shifts only the rows after the
 * insertion point, then inserts. Callers invalidate queries once afterwards, so the
 * list re-renders a single time with the final order.
 */
export async function insertDayEntry(
  row: Omit<TablesInsert<"day_entries">, "display_order">,
): Promise<void> {
  const { data, error: readErr } = await supabase
    .from("day_entries")
    .select(
      "id, entry_type, time_of_day, display_order, recommendations!day_entries_linked_recommendation_id_fkey(booking_status)",
    )
    .eq("day_id", row.day_id)
    .order("display_order")
    .order("created_at");
  if (readErr) throw readErr;

  const existing: DayOrderEntry[] = (data ?? [])
    .map((d) => ({
      id: d.id,
      entry_type: d.entry_type,
      time_of_day: d.time_of_day,
      display_order: d.display_order,
      booking_status:
        (d.recommendations as { booking_status?: string | null } | null)?.booking_status ?? null,
    }))
    .sort(compareDayEntryOrder);

  const plan = planDayInsert(existing, {
    entry_type: row.entry_type,
    time_of_day: row.time_of_day ?? null,
  });

  // Shift from the end backwards, one row at a time: if a write fails midway the
  // existing rows still keep their relative order (a gap, never a tie).
  for (const u of [...plan.updates].sort((a, b) => b.display_order - a.display_order)) {
    const { error } = await supabase
      .from("day_entries")
      .update({ display_order: u.display_order })
      .eq("id", u.id);
    if (error) throw error;
  }

  const { error } = await supabase
    .from("day_entries")
    .insert({ ...row, display_order: plan.display_order });
  if (error) throw error;
}
