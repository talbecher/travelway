import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export const OPEN_QUICK_EXPENSE_EVENT = "open-quick-expense";
export function openQuickExpense() {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(OPEN_QUICK_EXPENSE_EVENT));
}
import { supabase } from "@/integrations/supabase/client";
import { getActiveTripId, CATEGORY_LABELS } from "@/lib/constants";
import { todayISO } from "@/lib/format";
import { useActiveTripId } from "@/hooks/use-active-trip";
import {
  useBaseCurrency,
  useTargetCurrency,
  useConversion,
  conversionLabel,
  NO_RATE_MESSAGE,
} from "@/lib/currency";
import { BottomSheet, BottomSheetFooter } from "./BottomSheet";
import { DateField } from "./DateField";
import { categoryToRecType, saveRecommendation } from "@/lib/recommendations";
import { parseLatLngFromMapsUrl } from "@/lib/coords";
import { toast } from "sonner";
import { assertOnline } from "@/hooks/use-online";

export function GlobalFab() {
  const [open, setOpen] = useState(false);
  const tripId = useActiveTripId();
  useEffect(() => {
    const h = () => setOpen(true);
    window.addEventListener(OPEN_QUICK_EXPENSE_EVENT, h);
    return () => window.removeEventListener(OPEN_QUICK_EXPENSE_EVENT, h);
  }, []);
  return (
    <BottomSheet open={open} onOpenChange={setOpen} title="הוסף הוצאה מהירה">
      {/* Remount per trip and per opening so the currency never carries over. */}
      <QuickExpenseForm key={`${tripId}-${open}`} onDone={() => setOpen(false)} />
    </BottomSheet>
  );
}

type Category = "food" | "attraction" | "transport" | "shopping" | "accommodation" | "other";

function QuickExpenseForm({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const base = useBaseCurrency();
  const target = useTargetCurrency();
  const conv = useConversion();
  const [amount, setAmount] = useState("");
  // Default to the target currency when it differs from the base currency.
  const [currency, setCurrency] = useState<"BASE" | "TARGET">(conv.sameCurrency ? "BASE" : "TARGET");
  const [category, setCategory] = useState<Category>("food");
  const [description, setDescription] = useState("");
  const [locationName, setLocationName] = useState("");
  const [mapsUrl, setMapsUrl] = useState("");
  const [saveToRecs, setSaveToRecs] = useState(false);
  const [date, setDate] = useState(todayISO());

  const recType = categoryToRecType(category);

  const mut = useMutation({
    mutationFn: async () => {
      const n = Number(amount);
      if (!n || n <= 0) throw new Error("סכום לא תקין");
      const amount_ils = currency === "ILS" ? n : n / rate;
      const amount_foreign = currency === "JPY" ? n : null;

      let linkedId: string | null = null;
      if (saveToRecs && recType && locationName.trim()) {
        linkedId = await saveRecommendation({
          type: recType,
          name: locationName.trim(),
          google_maps_url: mapsUrl || null,
        });
      }

      const { error } = await supabase.from("expenses").insert({
        trip_id: getActiveTripId(),
        amount_ils,
        amount_foreign,
        foreign_currency: currency === "JPY" ? "JPY" : null,
        category,
        description: description.trim() || null,
        location_name: locationName.trim() || null,
        expense_date: date,
        linked_recommendation_id: linkedId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["recs"] });
      toast.success("נשמר");
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <form id="quick-expense-form" onSubmit={(e) => { e.preventDefault(); if (!assertOnline()) return; mut.mutate(); }} className="min-w-0 max-w-full space-y-4 pt-2 [&_input]:text-base [&_select]:text-base [&_textarea]:text-base">
      <div>
        <label className="text-sm text-muted-foreground">סכום</label>
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2 mt-1">
          <input
            type="number" step="0.01" inputMode="decimal" value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="min-w-0 w-full rounded-lg bg-background border border-input px-3 text-lg h-12"
            placeholder="0"
          />
          <div className="flex rounded-lg border border-input overflow-hidden">
            <button type="button" onClick={() => setCurrency("ILS")}
              className={`px-4 text-lg ${currency === "ILS" ? "bg-[color:var(--accent-2)] text-white" : "bg-background"}`}>₪</button>
            <button type="button" onClick={() => setCurrency("JPY")}
              className={`px-4 text-lg ${currency === "JPY" ? "bg-[color:var(--accent-2)] text-white" : "bg-background"}`}>¥</button>
          </div>
        </div>
      </div>
      <div>
        <label className="text-sm text-muted-foreground">קטגוריה</label>
        <select value={category} onChange={(e) => setCategory(e.target.value as Category)}
          className="w-full mt-1 rounded-lg bg-background border border-input px-3 h-11">
          {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="text-sm text-muted-foreground">תיאור (לא חובה)</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
          className="w-full mt-1 rounded-lg bg-background border border-input px-3 py-2 resize-none" />
      </div>
      <div>
        <label className="text-sm text-muted-foreground">שם המקום (לא חובה)</label>
        <input value={locationName} onChange={(e) => setLocationName(e.target.value)}
          placeholder="למשל: Ichiran Ramen Shinjuku"
          className="w-full mt-1 rounded-lg bg-background border border-input px-3 h-11" />
      </div>
      <div>
        <label className="text-sm text-muted-foreground">לינק גוגל מפות (לא חובה)</label>
        <input type="url" value={mapsUrl} onChange={(e) => setMapsUrl(e.target.value)} dir="ltr"
          placeholder="https://maps.app.goo.gl/..."
          className="w-full mt-1 rounded-lg bg-background border border-input px-3 h-11" />
        {mapsUrl.trim() && (
          parseLatLngFromMapsUrl(mapsUrl)
            ? <div className="text-[11px] text-[color:var(--accent-3)] mt-1">✅ מיקום זוהה</div>
            : <div className="text-[11px] text-[color:var(--accent-2)] mt-1">⚠️ לא זוהה מיקום — לא יופיע במפה</div>
        )}
      </div>
      {recType && locationName.trim() && (
        <label className="flex items-center gap-2 py-1 text-sm">
          <input type="checkbox" checked={saveToRecs} onChange={(e) => setSaveToRecs(e.target.checked)}
            className="w-4 h-4 accent-[color:var(--accent)]" />
          <span>שמור גם בהמלצות</span>
        </label>
      )}
      <div>
        <label className="text-sm text-muted-foreground">תאריך</label>
        <div className="mt-1"><DateField value={date} onChange={setDate} /></div>
      </div>
      <BottomSheetFooter>
        <button type="submit" form="quick-expense-form" disabled={mut.isPending}
          className="w-full h-12 rounded-xl bg-[color:var(--accent-2)] text-white font-medium disabled:opacity-50">
          {mut.isPending ? "שומר..." : "שמור הוצאה"}
        </button>
      </BottomSheetFooter>
    </form>
  );
}
