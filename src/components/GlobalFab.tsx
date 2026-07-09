import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { TRIP_ID, CATEGORY_LABELS } from "@/lib/constants";
import { todayISO } from "@/lib/format";
import { useSettings } from "@/hooks/use-trip";
import { BottomSheet } from "./BottomSheet";
import { toast } from "sonner";

export function GlobalFab() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <motion.button
        whileTap={{ scale: 0.94 }}
        onClick={() => setOpen(true)}
        aria-label="הוסף הוצאה מהירה"
        className="fixed bottom-[84px] left-4 z-40 w-14 h-14 rounded-full bg-[color:var(--terracotta)] text-white flex items-center justify-center border border-[color:var(--terracotta)]"
      >
        <Plus size={26} strokeWidth={1.8} />
      </motion.button>
      <BottomSheet open={open} onOpenChange={setOpen} title="הוסף הוצאה מהירה">
        <QuickExpenseForm onDone={() => setOpen(false)} />
      </BottomSheet>
    </>
  );
}

function QuickExpenseForm({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const { data: settings } = useSettings();
  const rate = Number(settings?.manual_exchange_rate ?? 38);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<"ILS" | "JPY">("JPY");
  const [category, setCategory] = useState<"food"|"attraction"|"transport"|"shopping"|"accommodation"|"other">("food");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [date, setDate] = useState(todayISO());

  const mut = useMutation({
    mutationFn: async () => {
      const n = Number(amount);
      if (!n || n <= 0) throw new Error("סכום לא תקין");
      const amount_ils = currency === "ILS" ? n : n / rate;
      const amount_foreign = currency === "JPY" ? n : null;
      const { error } = await supabase.from("expenses").insert({
        trip_id: TRIP_ID,
        amount_ils,
        amount_foreign,
        foreign_currency: currency === "JPY" ? "JPY" : null,
        category,
        description: description.trim() || null,
        location_name: location || null,
        expense_date: date,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
      toast.success("נשמר");
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); mut.mutate(); }}
      className="space-y-4 pt-2"
    >
      <div>
        <label className="text-sm text-muted-foreground">סכום</label>
        <div className="flex gap-2 mt-1">
          <input
            type="number"
            step="0.01"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="flex-1 rounded-lg bg-background border border-input px-3 text-lg"
            placeholder="0"
            autoFocus
          />
          <div className="flex rounded-lg border border-input overflow-hidden">
            <button type="button" onClick={() => setCurrency("ILS")}
              className={`px-4 text-lg ${currency === "ILS" ? "bg-[color:var(--terracotta)] text-white" : "bg-background"}`}>₪</button>
            <button type="button" onClick={() => setCurrency("JPY")}
              className={`px-4 text-lg ${currency === "JPY" ? "bg-[color:var(--terracotta)] text-white" : "bg-background"}`}>¥</button>
          </div>
        </div>
      </div>
      <div>
        <label className="text-sm text-muted-foreground">קטגוריה</label>
        <select value={category} onChange={(e) => setCategory(e.target.value as typeof category)}
          className="w-full mt-1 rounded-lg bg-background border border-input px-3">
          {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="text-sm text-muted-foreground">מיקום (לא חובה)</label>
        <input value={location} onChange={(e) => setLocation(e.target.value)}
          className="w-full mt-1 rounded-lg bg-background border border-input px-3" />
      </div>
      <div>
        <label className="text-sm text-muted-foreground">תאריך</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
          className="w-full mt-1 rounded-lg bg-background border border-input px-3" />
      </div>
      <button
        type="submit"
        disabled={mut.isPending}
        className="w-full h-12 rounded-lg bg-[color:var(--terracotta)] text-white font-medium disabled:opacity-50"
      >
        {mut.isPending ? "שומר..." : "שמור הוצאה"}
      </button>
    </form>
  );
}
