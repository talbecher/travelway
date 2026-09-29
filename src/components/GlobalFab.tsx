import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, FileText, Link as LinkIcon, MapPin, Utensils, X } from "lucide-react";
import { Drawer } from "vaul";

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
      description="פרטי ההוצאה"
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
        // the recommendation now exists even if the expense insert below fails
        qc.invalidateQueries({ queryKey: ["recs"] });
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

  const shownCurrency = currency === "BASE" ? base : target;
  const categoryLabel = (CATEGORY_LABELS as Record<string, string>)[category] ?? category;
  const rowLabel = "block text-xs text-muted-foreground";
  const rowInput =
    "h-9 min-w-0 w-full border-0 bg-transparent px-0 text-base text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring rounded-sm";

  return (
    <form
      id="quick-expense-form"
      onSubmit={(e) => { e.preventDefault(); if (!assertOnline()) return; mut.mutate(); }}
      className="min-w-0 max-w-full space-y-2.5 pb-3 [&_select]:text-base [&_textarea]:text-base"
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0">
          <Drawer.Title className="text-xl font-bold leading-tight text-foreground">הוצאה מהירה</Drawer.Title>
          <p className="mt-1 text-sm text-muted-foreground">שמירה מהירה בזמן הטיול</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onDone}
          aria-label="סגור הוצאה מהירה"
          className="size-11 shrink-0 rounded-full p-0"
        >
          <span className="flex size-8 items-center justify-center rounded-full border border-border bg-surface">
            <X className="size-4" aria-hidden="true" />
          </span>
        </Button>
      </div>

      <div>
        <div
          className="cursor-text rounded-2xl bg-primary p-3 text-primary-foreground shadow-[var(--shadow-sm)]"
          onClick={() => amountInputRef.current?.focus()}
        >
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
            <label htmlFor="quick-expense-amount" className="text-sm font-medium">סכום ההוצאה</label>
            <div
              className="flex shrink-0 gap-1 rounded-xl bg-foreground/15 p-0.5"
              role="group"
              aria-label="בחירת מטבע"
              onClick={(e) => e.stopPropagation()}
            >
              {[{ k: "BASE" as const, v: base }, ...(!conv.sameCurrency ? [{ k: "TARGET" as const, v: target }] : [])].map((o) => (
                <button
                  key={o.k}
                  type="button"
                  onClick={() => setCurrency(o.k)}
                  aria-pressed={currency === o.k}
                  className={`min-h-11 min-w-14 rounded-lg px-2 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground ${
                    currency === o.k ? "bg-surface text-primary" : "text-primary-foreground"
                  }`}
                >
                  {o.v}
                </button>
              ))}
            </div>
          </div>
          <div dir="ltr" className="mt-1 flex min-w-0 items-baseline justify-center gap-1.5 overflow-hidden">
            <input
              ref={amountInputRef}
              id="quick-expense-amount"
              aria-label="סכום ההוצאה"
              type="number"
              step="0.01"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              className={`no-number-spin [field-sizing:content] w-auto min-w-[2ch] max-w-full rounded-md border-0 bg-transparent px-0 text-center font-bold leading-none text-primary-foreground outline-none placeholder:text-primary-foreground/60 focus-visible:ring-2 focus-visible:ring-primary-foreground ${amount.length > 13 ? "text-2xl" : amount.length > 9 ? "text-3xl" : amount.length > 6 ? "text-4xl" : "text-6xl"}`}
            />
          </div>
        </div>
        {currency === "TARGET" && !conv.sameCurrency && (
          <p className="mt-2 break-words px-1 text-xs leading-5 text-muted-foreground">
            {conv.rate ? `יומר לפי ${conversionLabel(conv)}` : NO_RATE_MESSAGE}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-2.5 min-[390px]:grid-cols-2">
        <label className="block min-w-0 rounded-2xl border border-border bg-surface px-3 py-2.5">
          <span className={rowLabel}>קטגוריה</span>
          <span className="mt-1 flex min-w-0 items-center gap-2">
            <Utensils className="size-5 shrink-0 text-primary" aria-hidden="true" />
            <select value={category} onChange={(e) => setCategory(e.target.value as Category)}
              className="h-11 min-w-0 w-full border-0 bg-transparent px-0 font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm">
              {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </span>
        </label>
        <div className="min-w-0 rounded-2xl border border-border bg-surface px-3 py-2.5">
          <span className={rowLabel}>תאריך</span>
          <div className="mt-1 min-w-0">
            <DateField value={date} onChange={setDate} labelFormat="dd.MM.yyyy" className="!px-1.5 !text-sm [&>span]:!gap-1 [&>span>span]:!text-clip [&>span>span]:!overflow-visible" />
          </div>
        </div>
      </div>

      <div className="divide-y divide-border rounded-2xl border border-border bg-surface">
        <label className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-2.5 px-3 py-2">
          <FileText className="mt-1 size-5 shrink-0 text-primary" aria-hidden="true" />
          <span className="min-w-0">
            <span className={rowLabel}>תיאור</span>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={1}
              placeholder="לא חובה"
              className="mt-1 min-h-8 max-h-28 min-w-0 w-full resize-none overflow-y-auto break-words rounded-sm border-0 bg-transparent px-0 py-1 text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring" />
          </span>
        </label>
        <label className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-2.5 px-3 py-2">
          <MapPin className="size-5 shrink-0 text-primary" aria-hidden="true" />
          <span className="min-w-0">
            <span className={rowLabel}>מקום</span>
            <input value={locationName} onChange={(e) => setLocationName(e.target.value)}
              placeholder="לא חובה" className={`mt-1 ${rowInput} min-h-11`} />
          </span>
        </label>
        <div className="px-3 py-2">
          <label className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-2.5">
            <LinkIcon className="size-5 shrink-0 text-primary" aria-hidden="true" />
            <span className="min-w-0">
              <span className={rowLabel}>Google Maps</span>
              <input type="url" value={mapsUrl} onChange={(e) => setMapsUrl(e.target.value)} dir="ltr"
                placeholder="https://maps.app.goo.gl/..."
                className={`mt-1 ${rowInput} min-h-11 text-left`} />
            </span>
          </label>
          {mapsUrl.trim() && (
            parseLatLngFromMapsUrl(mapsUrl)
              ? <div className="mr-8 mt-1 break-words text-xs text-success">מיקום זוהה</div>
              : <div className="mr-8 mt-1 break-words text-xs text-primary">לא זוהה מיקום — לא יופיע במפה</div>
          )}
        </div>
      </div>

      <p className="mt-3 break-words px-1 text-xs leading-5 text-muted-foreground">
        אפשר לשמור עכשיו ולהשלים פרטים אחר כך
      </p>

      {recType && locationName.trim() && (
        <label className="flex min-h-12 min-w-0 items-center gap-3 px-1 text-sm">
          <input type="checkbox" checked={saveToRecs} onChange={(e) => setSaveToRecs(e.target.checked)}
            className="size-5 shrink-0 accent-primary" />
          <span className="min-w-0 break-words">שמור גם בהמלצות</span>
        </label>
      )}

      <BottomSheetFooter>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="submit"
            form="quick-expense-form"
            size="lg"
            disabled={mut.isPending}
            className="h-12 min-w-[12rem] flex-1 rounded-xl text-base"
          >
            <Check aria-hidden="true" />
            {mut.isPending ? "שומר..." : "שמור הוצאה"}
          </Button>
          <div className="min-w-0 shrink-0 text-left" aria-live="polite">
            <div dir="ltr" className="break-all text-lg font-bold text-foreground">
              {amount ? `${amount} ${shownCurrency}` : `— ${shownCurrency}`}
            </div>
            <div className="text-xs text-muted-foreground">{categoryLabel}</div>
          </div>
        </div>
      </BottomSheetFooter>
    </form>
  );
}
