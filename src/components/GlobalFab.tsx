import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Check, FileText, Link as LinkIcon, MapPin, Utensils, X } from "lucide-react";

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
import { Button } from "@/components/ui/button";

export function GlobalFab() {
  const [open, setOpen] = useState(false);
  const tripId = useActiveTripId();
  useEffect(() => {
    const h = () => setOpen(true);
    window.addEventListener(OPEN_QUICK_EXPENSE_EVENT, h);
    return () => window.removeEventListener(OPEN_QUICK_EXPENSE_EVENT, h);
  }, []);
  return (
    <BottomSheet
      open={open}
      onOpenChange={setOpen}
      title="הוצאה מהירה"
      description="פרטי קבלה"
      contentClassName="sm:mx-auto sm:max-w-lg"
      bodyClassName="px-3 sm:px-4"
    >
      {/* Remount per trip and per opening so the currency never carries over. */}
      <QuickExpenseForm key={`${tripId}-${open}`} onDone={() => setOpen(false)} />
    </BottomSheet>
  );
}

type Category = "food" | "attraction" | "transport" | "shopping" | "accommodation" | "other";

function QuickExpenseForm({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const amountInputRef = useRef<HTMLInputElement>(null);
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
      const useTarget = currency === "TARGET" && !conv.sameCurrency;
      if (useTarget && (!conv.rate || conv.rate <= 0)) throw new Error(NO_RATE_MESSAGE);
      const amount_ils = useTarget ? n / conv.rate! : n;
      const amount_foreign = useTarget ? n : null;

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
        foreign_currency: useTarget ? target : null,
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
    <form
      id="quick-expense-form"
      onSubmit={(e) => { e.preventDefault(); if (!assertOnline()) return; mut.mutate(); }}
      className="min-w-0 max-w-full pb-1 [&_input]:text-base [&_select]:text-base [&_textarea]:text-base"
    >
      <div className="relative min-w-0 overflow-hidden rounded-xl border border-border bg-surface shadow-[var(--shadow-sm)]">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 border-b border-border px-4 pb-4 pt-2">
          <p className="min-w-0 text-sm text-muted-foreground">פרטי קבלה</p>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onDone}
            aria-label="סגור הוצאה מהירה"
            className="-ml-2 -mt-2 shrink-0 rounded-full focus-visible:ring-2"
          >
            <X aria-hidden="true" />
          </Button>
        </div>

        <div
          className="cursor-text border-b border-border px-4 py-5 text-center"
          onClick={() => amountInputRef.current?.focus()}
        >
          <label htmlFor="quick-expense-amount" className="block text-sm text-muted-foreground">סה״כ</label>
          <div dir="ltr" className="mt-2 flex min-w-0 items-center justify-center gap-2">
            <input
              ref={amountInputRef}
              id="quick-expense-amount"
              aria-label="סכום ההוצאה"
              type="number"
              step="0.01"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="h-16 min-w-0 max-w-[12rem] flex-1 border-0 bg-transparent px-0 text-center text-4xl font-semibold text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-0"
            />
            <span className="shrink-0 text-xl font-semibold text-primary" aria-hidden="true">
              {currency === "BASE" ? base : target}
            </span>
          </div>
        </div>

        <div className="border-b border-border px-4 py-4">
          <div className="grid min-h-12 grid-cols-2 overflow-hidden rounded-lg bg-secondary p-1" role="group" aria-label="בחירת מטבע">
            <Button
              type="button"
              variant={currency === "BASE" ? "default" : "ghost"}
              onClick={() => setCurrency("BASE")}
              aria-pressed={currency === "BASE"}
              className="h-11 min-w-0 rounded-md px-3 text-base"
            >
              <span className="truncate">{base}</span>
            </Button>
            {!conv.sameCurrency && (
              <Button
                type="button"
                variant={currency === "TARGET" ? "default" : "ghost"}
                onClick={() => setCurrency("TARGET")}
                aria-pressed={currency === "TARGET"}
                className="h-11 min-w-0 rounded-md px-3 text-base"
              >
                <span className="truncate">{target}</span>
              </Button>
            )}
          </div>
          {currency === "TARGET" && !conv.sameCurrency && (
            <p className="mt-2 break-words text-xs leading-5 text-muted-foreground">
              {conv.rate ? `יומר לפי ${conversionLabel(conv)}` : NO_RATE_MESSAGE}
            </p>
          )}
        </div>

        <div className="divide-y divide-border px-4">
          <div className="grid min-h-16 min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-3 py-2">
            <Utensils className="size-5 shrink-0 text-primary" aria-hidden="true" />
            <label className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-3">
              <span className="shrink-0 text-sm text-muted-foreground">קטגוריה</span>
              <select value={category} onChange={(e) => setCategory(e.target.value as Category)}
                className="h-11 min-w-0 w-full truncate border-0 bg-transparent px-0 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid min-h-16 min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-3 py-2">
            <FileText className="mt-3 size-5 shrink-0 text-primary" aria-hidden="true" />
            <label className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-3">
              <span className="pt-3 text-sm text-muted-foreground">תיאור</span>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
                placeholder="לא חובה"
                className="min-h-14 min-w-0 w-full resize-none border-0 bg-transparent px-0 py-2.5 text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring" />
            </label>
          </div>

          <div className="grid min-h-16 min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-3 py-2">
            <MapPin className="size-5 shrink-0 text-primary" aria-hidden="true" />
            <label className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-3">
              <span className="shrink-0 text-sm text-muted-foreground">מקום</span>
              <input value={locationName} onChange={(e) => setLocationName(e.target.value)}
                placeholder="לא חובה"
                className="h-11 min-w-0 w-full border-0 bg-transparent px-0 text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring" />
            </label>
          </div>

          <div className="min-w-0 py-2">
            <div className="grid min-h-16 min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-3">
              <LinkIcon className="size-5 shrink-0 text-primary" aria-hidden="true" />
              <label className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-3">
                <span className="shrink-0 text-sm text-muted-foreground">Google Maps</span>
                <input type="url" value={mapsUrl} onChange={(e) => setMapsUrl(e.target.value)} dir="ltr"
                  placeholder="https://maps.app.goo.gl/..."
                  className="h-11 min-w-0 w-full truncate border-0 bg-transparent px-0 text-left text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring" />
              </label>
            </div>
            {mapsUrl.trim() && (
              parseLatLngFromMapsUrl(mapsUrl)
                ? <div className="mr-8 break-words text-xs text-success">מיקום זוהה</div>
                : <div className="mr-8 break-words text-xs text-primary">לא זוהה מיקום — לא יופיע במפה</div>
            )}
          </div>

          <div className="grid min-h-16 min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-3 py-2">
            <CalendarDays className="size-5 shrink-0 text-primary" aria-hidden="true" />
            <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-3">
              <span className="shrink-0 text-sm text-muted-foreground">תאריך</span>
              <div className="min-w-0 max-w-full"><DateField value={date} onChange={setDate} /></div>
            </div>
          </div>
        </div>

        {recType && locationName.trim() && (
          <label className="mx-4 flex min-h-12 min-w-0 items-center gap-3 border-t border-border py-2 text-sm">
            <input type="checkbox" checked={saveToRecs} onChange={(e) => setSaveToRecs(e.target.checked)}
              className="size-5 shrink-0 accent-primary" />
            <span className="min-w-0 break-words">שמור גם בהמלצות</span>
          </label>
        )}
      </div>

      <BottomSheetFooter>
        <Button
          type="submit"
          form="quick-expense-form"
          size="lg"
          disabled={mut.isPending}
          className="h-12 w-full rounded-xl text-base"
        >
          <Check aria-hidden="true" />
          {mut.isPending ? "שומר..." : "שמור הוצאה"}
        </Button>
      </BottomSheetFooter>
    </form>
  );
}
