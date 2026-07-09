import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ChevronDown, ChevronUp, Settings, Trash2 } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTrip, useExpenses, useHotels, useSettings } from "@/hooks/use-trip";
import { ils, hebDate } from "@/lib/format";
import { CATEGORY_LABELS, CATEGORY_COLORS, CATEGORY_ICONS } from "@/lib/constants";
import { BottomSheet } from "@/components/BottomSheet";
import { EmptyState } from "@/components/EmptyState";
import { toast } from "sonner";


export const Route = createFileRoute("/budget")({
  component: Budget,
});

function Budget() {
  const { data: trip } = useTrip();
  const { data: expenses = [], isLoading } = useExpenses();
  const { data: hotels = [] } = useHotels();
  const [filter, setFilter] = useState<string | null>(null);
  const [showHotels, setShowHotels] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const qc = useQueryClient();

  const byCat = useMemo(() => {
    const map: Record<string, number> = {};
    for (const e of expenses) map[e.category] = (map[e.category] ?? 0) + Number(e.amount_ils);
    return map;
  }, [expenses]);

  const totalSpent = expenses.reduce((s, e) => s + Number(e.amount_ils), 0);
  const budget = Number(trip?.total_budget_ils ?? 0);
  const remaining = budget - totalSpent;

  const pieData = Object.entries(byCat).map(([k, v]) => ({ name: k, value: v }));
  const hotelsCost = hotels.reduce((s, h) => s + Number(h.total_cost_ils ?? 0), 0);

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("expenses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["expenses"] }); toast.success("נמחק"); },
  });

  const filtered = filter ? expenses.filter((e) => e.category === filter) : expenses;

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
          const active = filter === k;
          return (
            <button
              key={k}
              onClick={() => setFilter(active ? null : k)}
              className={`w-full text-right bg-card border rounded-2xl p-3 transition-colors ${active ? "border-[color:var(--accent)]" : "border-border"}`}
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
                <div className="tabular-nums">{ils(amount)} · {Math.round(pct)}%</div>
              </div>
              <div className="h-1.5 bg-muted rounded-full mt-2 overflow-hidden">
                <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, background: CATEGORY_COLORS[k] }} />
              </div>
            </button>
          );

        })}
      </section>

      <section>
        <h2 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
          {filter ? `הוצאות · ${CATEGORY_LABELS[filter]}` : "כל ההוצאות"}
        </h2>
        {filtered.length === 0 ? (
          <EmptyState variant="expenses" title="אין הוצאות עדיין" hint="הוסיפו הוצאה מהירה מהכפתור הצף" />
        ) : (


          <div className="space-y-2">
            {filtered.map((e) => (
              <div key={e.id} className="bg-card border border-border rounded-lg p-3 flex items-start gap-3">
                <span className="text-xl">{CATEGORY_ICONS[e.category]}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm">{e.description || CATEGORY_LABELS[e.category]}</div>
                  <div className="text-xs text-muted-foreground">
                    {hebDate(e.expense_date)} {e.location_name ? `· ${e.location_name}` : ""}
                  </div>
                </div>
                <div className="text-right">
                  <div className="tabular-nums text-sm">{ils(e.amount_ils)}</div>
                  {e.amount_foreign && <div className="text-xs text-muted-foreground tabular-nums">¥{Number(e.amount_foreign).toLocaleString()}</div>}
                  <button onClick={() => { if (confirm("למחוק?")) del.mutate(e.id); }} className="text-muted-foreground mt-1 min-h-0 h-auto p-0">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="bg-card border border-border rounded-lg">
        <button onClick={() => setShowHotels((v) => !v)} className="w-full flex items-center justify-between p-3 min-h-0 h-auto">
          <span className="text-sm">מלונות · {ils(hotelsCost)}</span>
          {showHotels ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        {showHotels && (
          <div className="border-t border-border divide-y divide-border">
            {hotels.map((h) => (
              <div key={h.id} className="p-3 text-sm flex justify-between">
                <div>
                  <div>{h.hotel_name}</div>
                  <div className="text-xs text-muted-foreground" dir="ltr">{h.city}</div>
                </div>
                <div className="text-right tabular-nums">
                  <div>{ils(h.total_cost_ils)}</div>
                  <div className="text-xs text-muted-foreground">{ils(h.price_per_night_ils)}/לילה</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <BottomSheet open={settingsOpen} onOpenChange={setSettingsOpen} title="הגדרות תקציב">
        <BudgetSettings onDone={() => setSettingsOpen(false)} />
      </BottomSheet>
    </div>
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
          className="w-full mt-1 rounded-lg bg-background border border-input px-3" />
      </div>
      <div>
        <label className="text-xs text-muted-foreground">שער ידני ₪ → ¥</label>
        <input type="number" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)}
          className="w-full mt-1 rounded-lg bg-background border border-input px-3" />
      </div>
      <button onClick={save} className="w-full h-12 rounded-lg bg-[color:var(--terracotta)] text-white font-medium">שמור</button>
    </div>
  );
}
