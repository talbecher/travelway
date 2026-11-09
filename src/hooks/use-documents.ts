import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export type DocumentType =
  | "flight"
  | "hotel"
  | "attraction"
  | "insurance"
  | "visa"
  | "transport"
  | "other";

export type BarcodeType = "qr" | "barcode128";

export type TripDocument = {
  id: string;
  trip_id: string;
  title: string;
  type: DocumentType;
  file_url: string | null;
  file_path: string | null;
  file_mime: string | null;
  file_size: number | null;
  external_url: string | null;
  barcode_value: string | null;
  barcode_type: BarcodeType | null;
  notes: string | null;
  amount_ils: number | null;
  is_paid: boolean;
  valid_date: string | null;
  display_order: number;
  linked_recommendation_id?: string | null;
  created_at: string;
};

export type DocumentInput = {
  title: string;
  type: DocumentType;
  file_url?: string | null;
  external_url?: string | null;
  barcode_value?: string | null;
  barcode_type?: BarcodeType | null;
  notes?: string | null;
  amount_ils?: number | null;
  is_paid?: boolean;
  valid_date?: string | null;
  display_order?: number;
};

export function useDocuments(tripId: string | undefined) {
  return useQuery({
    queryKey: ["documents", tripId ?? "none"],
    enabled: !!tripId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents")
        .select("*")
        .eq("trip_id", tripId!)
        .order("display_order")
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as unknown as TripDocument[];
    },
  });
}

export function useAddDocument(tripId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: DocumentInput) => {
      if (!tripId) throw new Error("No trip");
      const { data, error } = await supabase
        .from("documents")
        .insert({ ...input, trip_id: tripId })
        .select()
        .single();
      if (error) throw error;
      const doc = data as unknown as TripDocument;
      return doc;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["documents", tripId] });
      toast.success("המסמך נוסף");
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "שגיאה בשמירת המסמך");
    },
  });
}

export function useUpdateDocument(tripId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<DocumentInput>; prevIsPaid: boolean }) => {
      const { data, error } = await supabase
        .from("documents")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      const doc = data as unknown as TripDocument;
      return { doc };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["documents", tripId] });
      toast.success("המסמך עודכן");
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "שגיאה בעדכון");
    },
  });
}

export function useDeleteDocument(tripId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("documents").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["documents", tripId] });
      toast.success("המסמך נמחק");
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "שגיאה במחיקה");
    },
  });
}

export const DOC_TYPE_META: Record<DocumentType, { emoji: string; label: string }> = {
  flight: { emoji: "✈️", label: "טיסות" },
  hotel: { emoji: "🏨", label: "מלונות" },
  attraction: { emoji: "🎭", label: "אטרקציות" },
  insurance: { emoji: "🛡", label: "ביטוח" },
  visa: { emoji: "📋", label: "ויזה" },
  transport: { emoji: "🚆", label: "תחבורה" },
  other: { emoji: "📄", label: "אחר" },
};
