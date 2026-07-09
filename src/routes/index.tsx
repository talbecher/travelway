import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, Calendar, Wallet, Star, Hotel } from "lucide-react";
import { useTrip, useExpenses, useHotels, useDays } from "@/hooks/use-trip";
import { ils, hebDate, todayISO, daysBetween } from "@/lib/format";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  const { data: trip, isLoading } = useTrip();
  const { data: expenses = [] } = useExpenses();
  const { data: hotels = [] } = useHotels();
  const { data: days = [] } = useDays();

  const stats = useMemo(() => {
    if (!trip) return null;
    const spent = expenses.reduce((s, e) => s + Number(e.amount_ils), 0);
    const budget = Number(trip.total_budget_ils);
    const remaining = budget - spent;
    const pct = budget > 0 ? Math.min(100, (spent / budget) * 100) : 0;
    const today = todayISO();
    const daysTotal = days.length;
    const daysPassed = days.filter((d) => d.date <= today).length;
    const daysLeft = Math.max(1, daysTotal - daysPassed + 1);
    const daily = remaining / daysLeft;
    const beforeTrip = today < trip.start_date;
    const daysToStart = daysBetween(today, trip.start_date);
    return { spent, budget, remaining, pct, daysTotal, daysPassed, daily, beforeTrip, daysToStart };
  }, [trip, expenses, days]);

  const urgentHotels = useMemo(() => {
    const today = todayISO();
    return hotels.filter((h) => {
      if (!h.cancellation_deadline) return false;
      const dd = daysBetween(today, h.cancellation_deadline);
      return dd >= 0 && dd <= 7;
    });
  }, [hotels]);

  if (isLoading) return <HomeSkeleton />;
  if (!trip) return <div className="pt-8 text-center text-muted-foreground">אין טיול פעיל</div>;

  return (
    <div className="pt-4 space-y-6">
      <section className="space-y-1">
        <div className="text-3xl font-medium">{trip.title} 🇯🇵</div>
        {stats && (
          <p className="text-sm text-muted-foreground">
            {stats.beforeTrip
              ? `עוד ${stats.daysToStart} ימים לטיסה`
              : `יום ${Math.min(stats.daysPassed, stats.daysTotal)} מתוך ${stats.daysTotal}`}
          </p>
        )}
      </section>

      {stats && (
        <section className="bg-card border border-border rounded-2xl p-5">
          <div className="flex items-center gap-5">
            <BudgetRing pct={stats.pct} />
            <div className="flex-1">
              <div className="text-xs text-muted-foreground">נשאר</div>
              <motion.div
                key={stats.remaining}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-3xl font-medium tabular-nums"
              >
                {ils(stats.remaining)}
              </motion.div>
              <div className="grid grid-cols-2 gap-3 mt-3 text-xs">
                <div>
                  <div className="text-muted-foreground">הוצאנו</div>
                  <div className="font-medium">{ils(stats.spent)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">ליום</div>
                  <div className="font-medium">{ils(stats.daily)}</div>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {urgentHotels.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs uppercase tracking-wider text-muted-foreground">התראות ביטול</h2>
          {urgentHotels.map((h) => {
            const dd = daysBetween(todayISO(), h.cancellation_deadline!);
            return (
              <div
                key={h.id}
                className="bg-card border border-border rounded-lg p-3 border-r-4 border-r-[color:var(--danger)]"
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle size={16} className="text-[color:var(--danger)] mt-1 shrink-0" />
                  <div className="flex-1">
                    <div className="font-medium">{h.hotel_name}</div>
                    <div className="text-xs text-muted-foreground">{h.city}</div>
                    <div className="text-xs mt-1">
                      ביטול עד {hebDate(h.cancellation_deadline!)} · נותרו {dd} ימים
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </section>
      )}

      <section className="grid grid-cols-2 gap-3">
        <Tile to="/itinerary" icon={Calendar} label="מסלול הטיול" />
        <Tile to="/budget" icon={Wallet} label="תקציב" />
        <Tile to="/recommendations" icon={Star} label="המלצות" />
        <Tile to="/recommendations" search={{ tab: "hotels" }} icon={Hotel} label="מלונות" />
      </section>
    </div>
  );
}

function Tile({ to, icon: Icon, label, search }: { to: string; icon: typeof Calendar; label: string; search?: Record<string, string> }) {
  return (
    <Link
      to={to}
      search={search as never}
      className="bg-card border border-border rounded-2xl p-4 flex flex-col items-center justify-center gap-2 min-h-[110px]"
    >
      <Icon size={26} strokeWidth={1.5} className="text-[color:var(--terracotta)]" />
      <div className="text-sm">{label}</div>
    </Link>
  );
}

function BudgetRing({ pct }: { pct: number }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const off = c - (pct / 100) * c;
  return (
    <svg width="80" height="80" viewBox="0 0 80 80">
      <circle cx="40" cy="40" r={r} stroke="var(--border)" strokeWidth="6" fill="none" />
      <motion.circle
        cx="40" cy="40" r={r} stroke="var(--terracotta)" strokeWidth="6" fill="none"
        strokeLinecap="round" transform="rotate(-90 40 40)"
        strokeDasharray={c}
        initial={{ strokeDashoffset: c }}
        animate={{ strokeDashoffset: off }}
        transition={{ duration: 0.8, ease: "easeOut" }}
      />
      <text x="40" y="45" textAnchor="middle" className="fill-foreground text-sm font-medium">
        {Math.round(pct)}%
      </text>
    </svg>
  );
}

function HomeSkeleton() {
  return (
    <div className="pt-4 space-y-6 animate-pulse">
      <div className="h-8 bg-muted rounded w-2/3" />
      <div className="h-40 bg-card border border-border rounded-2xl" />
      <div className="grid grid-cols-2 gap-3">
        {[0,1,2,3].map(i => <div key={i} className="h-28 bg-card border border-border rounded-2xl" />)}
      </div>
    </div>
  );
}
