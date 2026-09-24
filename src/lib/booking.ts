import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export type BookingDetails = {
  booking_time?: string | null;
  booking_url?: string | null;
  booking_note?: string | null;
};

/**
 * Single source of truth for marking a recommendation as booked.
 * Calls the transactional RPC which updates the recommendation AND upserts
 * its one linked document atomically — either both succeed or neither does.
 */
export async function markRecommendationBooked(recId: string, d: BookingDetails): Promise<string> {
  const { data, error } = await supabase.rpc("mark_recommendation_booked", {
    _rec_id: recId,
    _booking_time: d.booking_time?.trim() || "",
    _booking_url: d.booking_url?.trim() || "",
    _booking_note: d.booking_note?.trim() || "",
  });
  if (error) throw error;
  return data as string;
}

export function invalidateBookingQueries(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ["recs"] });
  qc.invalidateQueries({ queryKey: ["documents"] });
}

export function useMarkBooked(onDone?: () => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ recId, details }: { recId: string; details: BookingDetails }) =>
      markRecommendationBooked(recId, details),
    onSuccess: () => {
      invalidateBookingQueries(qc);
      toast.success("✅ סומן כהוזמן ונשמר במסמכים");
      onDone?.();
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "שגיאה בסימון ההזמנה");
    },
  });
}
