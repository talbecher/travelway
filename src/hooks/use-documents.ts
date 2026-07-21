import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { todayISO } from "@/lib/format";

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
  barcode_value: string | null;
  barcode_type: BarcodeType | null;
  notes: string | null;
  amount_ils: number | null;
  is_paid: boolean;
  valid_date: string | null;
  display_order: number;
  created_at: string;
};

export type DocumentInput = {
  title: string;
  type: DocumentType;
  file_url?: string | null;
  barcode_value?: string | null;
  barcode_type?: BarcodeType | null;
  notes?: string | null;
  amount_ils?: number | null;
  is_paid?: boolean;
  valid_date?: string | null;
  display_order?: number;
};

const EXPENSE_CATEGORY: Record<DocumentType, "food" | "attraction" | "transport" | "shopping" | "accommodation" | "other"> = {
  flight: "transport",
  transport: "transport",
  hotel: "accommodation",
  attraction: "attraction",
  insurance: "other",
  visa: "other",
  other: "other",
};

export function useDocuments(tripId: string | undefined) {
  return useQuery({
    queryKey: ["documents", tripId ?? "none"],
    enabled: !!tripId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents" as never)
        .select("*")
        .eq("trip_id", tripId!)
        .order("display_order")
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as unknown as TripDocument[];
    },
  });
}

async function maybeCreateExpense(tripId: string, doc: TripDocument) {
  if (!doc.is_paid || !doc.amount_ils || Number(doc.amount_ils) <= 0) return;
  const { error } = await supabase.from("expenses").insert({
    trip_id: tripId,
    amount_ils: Number(doc.amount_ils),
    category: EXPENSE_CATEGORY[doc.type],
    description: doc.title,
    expense_date: doc.valid_date ?? todayISO(),
  });
  if (error) throw error;
}

export function useAddDocument(tripId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: DocumentInput) => {
      if (!tripId) throw new Error("No trip");
      const { data, error } = await supabase
        .from("documents" as never)
        .insert({ ...input, trip_id: tripId })
        .select()
        .single();
      if (error) throw error;
      const doc = data as unknown as TripDocument;
      await maybeCreateExpense(tripId, doc);
      return doc;
    },
    onSuccess: (doc) => {
      qc.invalidateQueries({ queryKey: ["documents", tripId] });
      if (doc.is_paid && doc.amount_ils && Number(doc.amount_ils) > 0) {
        qc.invalidateQueries({ queryKey: ["expenses", tripId] });
        toast.success("✅ הוצאה נוספה לתקציב");
      } else {
        toast.success("המסמך נוסף");
      }
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "שגיאה בשמירת המסמך");
    },
  });
}

export function useUpdateDocument(tripId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch, prevIsPaid }: { id: string; patch: Partial<DocumentInput>; prevIsPaid: boolean }) => {
      const { data, error } = await supabase
        .from("documents" as never)
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      const doc = data as unknown as TripDocument;
      // If transition unpaid -> paid, auto-create expense
      if (!prevIsPaid && doc.is_paid && tripId) {
        await maybeCreateExpense(tripId, doc);
      }
      return { doc, transitionedToPaid: !prevIsPaid && doc.is_paid };
    },
    onSuccess: ({ transitionedToPaid, doc }) => {
      qc.invalidateQueries({ queryKey: ["documents", tripId] });
      if (transitionedToPaid && doc.amount_ils && Number(doc.amount_ils) > 0) {
        qc.invalidateQueries({ queryKey: ["expenses", tripId] });
        toast.success("✅ הוצאה נוספה לתקציב");
      } else {
        toast.success("המסמך עודכן");
      }
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
      const { error } = await supabase.from("documents" as never).delete().eq("id", id);
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
