import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Pencil, Settings, Trash2, ChevronDown } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTrip, useExpenses, useSettings } from "@/hooks/use-trip";
import { ils, hebDate } from "@/lib/format";
import { CATEGORY_LABELS, CATEGORY_COLORS, CATEGORY_ICONS } from "@/lib/constants";
import { BottomSheet } from "@/components/BottomSheet";
import { EmptyState } from "@/components/EmptyState";
import { toast } from "sonner";

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
      <header className="flex items-center justify-between">
        <h1>תקציב</h1>
        <button onClick={() => setSettingsOpen(true)} className="w-10 h-10 rounded-full border border-border flex items-center justify-center min-h-0">
          <Settings size={16} />
        </button>
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
            >{ils(remaining)}</motion.div>
            <div className="text-xs text-muted-foreground">נשאר</div>
          </div>
        </div>
        <div className="grid grid-cols-2 text-center gap-3 mt-2 text-sm">
          <div><div className="text-muted-foreground text-xs">תקציב</div><div>{ils(budget)}</div></div>
          <div><div className="text-muted-foreground text-xs">הוצאנו</div><div>{ils(totalSpent)}</div></div>
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
                    <span>{ils(amount)} · {Math.round(pct)}%</span>
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
                          <div className="tabular-nums text-sm">{ils(e.amount_ils)}</div>
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
        <EmptyState variant="expenses" title="אין הוצאות עדיין" hint="הוסיפו הוצאה מהירה מהכפתור הצף" />
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
  const { data: settings } = useSettings();
  const rate = Number(settings?.manual_exchange_rate ?? 1);
  const [amount, setAmount] = useState(String(expense.amount_foreign ?? expense.amount_ils));
  const [currency, setCurrency] = useState<"ILS" | "FX">(expense.amount_foreign ? "FX" : "ILS");
  const [category, setCategory] = useState(expense.category);
  const [description, setDescription] = useState(expense.description ?? "");
  const [location, setLocation] = useState(expense.location_name ?? "");
  const [date, setDate] = useState(expense.expense_date);

  const save = useMutation({
    mutationFn: async () => {
      const n = Number(amount);
      if (!n || n <= 0) throw new Error("סכום לא תקין");
      const amount_ils = currency === "ILS" ? n : n / rate;
      const amount_foreign = currency === "FX" ? n : null;
      const { error } = await supabase.from("expenses").update({
        amount_ils, amount_foreign,
        foreign_currency: currency === "FX" ? (expense.foreign_currency ?? "JPY") : null,
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
    <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-3 pt-2">
      <div>
        <label className="text-xs text-muted-foreground">סכום</label>
        <div className="flex gap-2 mt-1">
          <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)}
            className="flex-1 rounded-lg bg-background border border-input px-3 h-11" />
          <div className="flex rounded-lg border border-input overflow-hidden">
            <button type="button" onClick={() => setCurrency("ILS")}
              className={`px-3 ${currency === "ILS" ? "bg-[color:var(--accent)] text-white" : "bg-background"}`}>₪</button>
            <button type="button" onClick={() => setCurrency("FX")}
              className={`px-3 ${currency === "FX" ? "bg-[color:var(--accent)] text-white" : "bg-background"}`}>{expense.foreign_currency ?? "¥"}</button>
          </div>
        </div>
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
      <button type="submit" disabled={save.isPending}
        className="w-full h-12 rounded-lg bg-[color:var(--accent)] text-white font-medium disabled:opacity-50">
        {save.isPending ? "שומר..." : "שמור"}
      </button>
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
