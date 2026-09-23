import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Pencil, Plus, Settings, Trash2, ChevronDown } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTrip, useExpenses, useSettings } from "@/hooks/use-trip";
import { hebDate } from "@/lib/format";
import {
  formatMoney,
  useBaseCurrency,
  useTargetCurrency,
  useConversion,
  conversionLabel,
  NO_RATE_MESSAGE,
} from "@/lib/currency";
import { CATEGORY_LABELS, CATEGORY_COLORS, CATEGORY_ICONS } from "@/lib/constants";
import { BottomSheet, BottomSheetFooter } from "@/components/BottomSheet";
import { DateField } from "@/components/DateField";
import { EmptyState } from "@/components/EmptyState";
import { toast } from "sonner";
import { assertOnline } from "@/hooks/use-online";
import { openQuickExpense } from "@/components/GlobalFab";

export const Route = createFileRoute("/budget")({
  component: Budget,
});

type Expense = {
  id: string;
  category: string;
  description: string | null;
  location_name: string | null;
  amount_ils: number;
  amount_foreign: number | null;
  foreign_currency: string | null;
  expense_date: string;
};

function Budget() {
  const { data: trip } = useTrip();
  const { data: expenses = [], isLoading } = useExpenses();
  const base = useBaseCurrency();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editExpense, setEditExpense] = useState<Expense | null>(null);
  const qc = useQueryClient();

  const byCat = useMemo(() => {
    const map: Record<string, number> = {};
    for (const e of expenses) map[e.category] = (map[e.category] ?? 0) + Number(e.amount_ils);
    return map;
  }, [expenses]);

  const expensesByCat = useMemo(() => {
    const map: Record<string, Expense[]> = {};
    for (const e of expenses) (map[e.category] ||= []).push(e as Expense);
    return map;
  }, [expenses]);

  const totalSpent = expenses.reduce((s, e) => s + Number(e.amount_ils), 0);
  const budget = Number(trip?.total_budget_ils ?? 0);
  const remaining = budget - totalSpent;

  const pieData = Object.entries(byCat).map(([k, v]) => ({ name: k, value: v }));

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("expenses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["expenses"] }); toast.success("נמחק"); },
  });

  if (isLoading) return <div className="pt-6 animate-pulse space-y-3">
    <div className="h-52 rounded-2xl bg-card border border-border" />
    <div className="h-32 rounded-2xl bg-card border border-border" />
  </div>;

  return (
    <div className="pt-2 space-y-5">
      <header className="flex items-center justify-between gap-2">
        <h1>תקציב</h1>
        <div className="flex items-center gap-2">
          {expenses.length > 0 && (
            <button
              onClick={() => openQuickExpense()}
              className="h-10 min-h-0 rounded-full bg-[color:var(--accent)] px-3.5 text-sm font-medium text-white inline-flex items-center gap-1.5"
            >
              <Plus size={16} />
              הוספת הוצאה
            </button>
          )}
          <button onClick={() => setSettingsOpen(true)} aria-label="הגדרות תקציב" className="w-10 h-10 rounded-full border border-border flex items-center justify-center min-h-0">
            <Settings size={16} />
          </button>
        </div>
      </header>

      <div className="bg-card border border-border rounded-2xl p-4">
        <div className="relative h-52">
          <ResponsiveContainer>
            <PieChart>
              <Pie data={pieData.length ? pieData : [{ name: "empty", value: 1 }]} dataKey="value" innerRadius={60} outerRadius={90} paddingAngle={2} stroke="none">
                {(pieData.length ? pieData : [{ name: "empty", value: 1 }]).map((d, i) => (
                  <Cell key={i} fill={pieData.length ? CATEGORY_COLORS[d.name] : "var(--border)"} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <motion.div
              key={remaining}
              initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
              className="text-3xl font-medium tabular-nums"
            >{formatMoney(remaining, base)}</motion.div>
            <div className="text-xs text-muted-foreground">נשאר</div>
          </div>
        </div>
        <div className="grid grid-cols-2 text-center gap-3 mt-2 text-sm">
          <div><div className="text-muted-foreground text-xs">תקציב</div><div>{formatMoney(budget, base)}</div></div>
          <div><div className="text-muted-foreground text-xs">הוצאנו</div><div>{formatMoney(totalSpent, base)}</div></div>
        </div>
      </div>

      <section className="space-y-2">
        {Object.keys(CATEGORY_LABELS).map((k) => {
          const amount = byCat[k] ?? 0;
          const pct = totalSpent > 0 ? (amount / totalSpent) * 100 : 0;
          const active = expanded === k;
          const items = expensesByCat[k] ?? [];
          return (
            <div key={k} className={`bg-card border rounded-2xl transition-colors ${active ? "border-[color:var(--accent)]" : "border-border"}`}>
              <button
                onClick={() => setExpanded(active ? null : k)}
                className="w-full text-right p-3"
              >
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-7 h-7 rounded-full flex items-center justify-center text-[13px]"
                      style={{
                        background: `color-mix(in oklab, ${CATEGORY_COLORS[k]} 22%, transparent)`,
                        color: CATEGORY_COLORS[k],
                      }}
                    >{CATEGORY_ICONS[k]}</span>
                    <span>{CATEGORY_LABELS[k]}</span>
                  </div>
                  <div className="flex items-center gap-2 tabular-nums">
                    <span>{formatMoney(amount, base)} · {Math.round(pct)}%</span>
                    <ChevronDown size={14} className={`transition-transform ${active ? "rotate-180" : ""}`} />
                  </div>
                </div>
                <div className="h-1.5 bg-muted rounded-full mt-2 overflow-hidden">
                  <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, background: CATEGORY_COLORS[k] }} />
                </div>
              </button>
              <AnimatePresence initial={false}>
                {active && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="border-t border-border divide-y divide-border">
                      {items.length === 0 ? (
                        <div className="p-3 text-xs text-muted-foreground">אין הוצאות</div>
                      ) : items.map((e) => (
                        <div key={e.id} className="p-3 flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="text-sm truncate">{e.description || CATEGORY_LABELS[e.category]}</div>
                            <div className="text-xs text-muted-foreground">
                              {hebDate(e.expense_date)}{e.location_name ? ` · ${e.location_name}` : ""}
                            </div>
                          </div>
                          <div className="tabular-nums text-sm">{formatMoney(e.amount_ils, base)}</div>
                          <div className="flex gap-1">
                            <button onClick={() => setEditExpense(e)} aria-label="ערוך"
                              className="w-8 h-8 rounded-full border border-border flex items-center justify-center min-h-0">
                              <Pencil size={13} />
                            </button>
                            <button onClick={() => { if (confirm("למחוק הוצאה?")) del.mutate(e.id); }} aria-label="מחק"
                              className="w-8 h-8 rounded-full border border-border flex items-center justify-center min-h-0 text-[color:var(--accent-2)]">
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </section>

      {expenses.length === 0 && (
        <EmptyState
          variant="expenses"
          title="אין הוצאות עדיין"
          hint="הוסיפו את ההוצאה הראשונה של הטיול"
          cta={
            <button
              onClick={() => openQuickExpense()}
              className="h-11 min-h-0 rounded-full bg-[color:var(--accent)] px-5 text-sm font-medium text-white inline-flex items-center gap-1.5"
            >
              <Plus size={16} />
              הוספת הוצאה
            </button>
          }
        />
      )}

      <BottomSheet open={settingsOpen} onOpenChange={setSettingsOpen} title="הגדרות תקציב">
        <BudgetSettings onDone={() => setSettingsOpen(false)} />
      </BottomSheet>

      <BottomSheet open={!!editExpense} onOpenChange={(o) => !o && setEditExpense(null)} title="ערוך הוצאה">
        {editExpense && <EditExpenseForm expense={editExpense} onDone={() => setEditExpense(null)} />}
      </BottomSheet>
    </div>
  );
}

function EditExpenseForm({ expense, onDone }: { expense: Expense; onDone: () => void }) {
  const qc = useQueryClient();
  const base = useBaseCurrency();
  const tripTarget = useTargetCurrency();
  // Open with the expense's own currency, not the trip default.
  const fxCurrency = (expense.foreign_currency || tripTarget).toUpperCase();
  const conv = useConversion(fxCurrency);
  const initialAmount = String(expense.amount_foreign ?? expense.amount_ils);
  const initialCurrency: "ILS" | "FX" = expense.amount_foreign ? "FX" : "ILS";
  const [amount, setAmount] = useState(initialAmount);
  const [currency, setCurrency] = useState<"ILS" | "FX">(initialCurrency);
  const [category, setCategory] = useState(expense.category);
  const [description, setDescription] = useState(expense.description ?? "");
  const [location, setLocation] = useState(expense.location_name ?? "");
  const [date, setDate] = useState(expense.expense_date);

  const moneyChanged = amount !== initialAmount || currency !== initialCurrency;

  const save = useMutation({
    mutationFn: async () => {
      const n = Number(amount);
      if (!n || n <= 0) throw new Error("סכום לא תקין");
      // Non-money edits must never recalculate the stored base amount.
      let amount_ils = Number(expense.amount_ils);
      if (moneyChanged) {
        if (currency === "ILS" || conv.sameCurrency) {
          amount_ils = n;
        } else {
          if (!conv.rate || conv.rate <= 0) throw new Error(NO_RATE_MESSAGE);
          amount_ils = n / conv.rate;
        }
      }
      const amount_foreign = currency === "FX" && !conv.sameCurrency ? n : null;
      const { error } = await supabase.from("expenses").update({
        amount_ils, amount_foreign,
        foreign_currency: amount_foreign != null ? fxCurrency : null,
        category: category as "food" | "attraction" | "transport" | "shopping" | "accommodation" | "other",
        description: description || null,
        location_name: location || null, expense_date: date,
      }).eq("id", expense.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["expenses"] }); toast.success("נשמר"); onDone(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <form id="edit-expense-form" onSubmit={(e) => { e.preventDefault(); if (!assertOnline()) return; save.mutate(); }} className="min-w-0 max-w-full space-y-3 pt-2 [&_input]:text-base [&_select]:text-base [&_textarea]:text-base">
      <div>
        <label className="text-xs text-muted-foreground">סכום</label>
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2 mt-1">
          <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)}
            className="min-w-0 w-full rounded-lg bg-background border border-input px-3 h-11" />
          <div className="flex rounded-lg border border-input overflow-hidden">
            <button type="button" onClick={() => setCurrency("ILS")}
              className={`px-3 ${currency === "ILS" ? "bg-[color:var(--accent)] text-white" : "bg-background"}`}>{base}</button>
            {!conv.sameCurrency && (
              <button type="button" onClick={() => setCurrency("FX")}
                className={`px-3 ${currency === "FX" ? "bg-[color:var(--accent)] text-white" : "bg-background"}`}>{fxCurrency}</button>
            )}
          </div>
        </div>
        {currency === "FX" && !conv.sameCurrency && (
          <p className="mt-1 text-[11px] text-muted-foreground">
            {conv.rate ? `יומר לפי ${conversionLabel(conv)}` : NO_RATE_MESSAGE}
          </p>
        )}
      </div>
      <div>
        <label className="text-xs text-muted-foreground">קטגוריה</label>
        <select value={category} onChange={(e) => setCategory(e.target.value)}
          className="w-full mt-1 rounded-lg bg-background border border-input px-3 h-11">
          {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <div>
        <label className="text-xs text-muted-foreground">תיאור</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
          className="w-full mt-1 rounded-lg bg-background border border-input px-3 py-2" />
      </div>
      <div>
        <label className="text-xs text-muted-foreground">מיקום</label>
        <input value={location} onChange={(e) => setLocation(e.target.value)}
          className="w-full mt-1 rounded-lg bg-background border border-input px-3 h-11" />
      </div>
      <div>
        <label className="text-xs text-muted-foreground">תאריך</label>
        <div className="mt-1"><DateField value={date} onChange={setDate} /></div>
      </div>
      <BottomSheetFooter>
        <button type="submit" form="edit-expense-form" disabled={save.isPending}
          className="w-full h-12 rounded-lg bg-[color:var(--accent)] text-white font-medium disabled:opacity-50">
          {save.isPending ? "שומר..." : "שמור"}
        </button>
      </BottomSheetFooter>
    </form>
  );
}

function BudgetSettings({ onDone }: { onDone: () => void }) {
  const { data: trip } = useTrip();
  const { data: settings } = useSettings();
  const qc = useQueryClient();
  const [budget, setBudget] = useState(String(trip?.total_budget_ils ?? 0));
  const [rate, setRate] = useState(String(settings?.manual_exchange_rate ?? 38));

  async function save() {
    if (trip) await supabase.from("trips").update({ total_budget_ils: Number(budget) }).eq("id", trip.id);
    if (settings) await supabase.from("settings").update({ manual_exchange_rate: Number(rate) }).eq("id", settings.id);
    qc.invalidateQueries({ queryKey: ["trip"] });
    qc.invalidateQueries({ queryKey: ["settings"] });
    toast.success("נשמר");
    onDone();
  }

  return (
    <div className="space-y-3 pt-2">
      <div>
        <label className="text-xs text-muted-foreground">תקציב כולל (₪)</label>
        <input type="number" value={budget} onChange={(e) => setBudget(e.target.value)}
          className="w-full mt-1 rounded-lg bg-background border border-input px-3 h-11" />
      </div>
      <div>
        <label className="text-xs text-muted-foreground">שער ידני ₪ → מטבע יעד</label>
        <input type="number" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)}
          className="w-full mt-1 rounded-lg bg-background border border-input px-3 h-11" />
      </div>
      <button onClick={save} className="w-full h-12 rounded-lg bg-[color:var(--accent)] text-white font-medium">שמור</button>
    </div>
  );
}
