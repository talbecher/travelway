import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { motion } from "framer-motion";
import { Calendar, Wallet, Star } from "lucide-react";
import { useTrip, useExpenses, useDays } from "@/hooks/use-trip";
import { ils, todayISO, daysBetween } from "@/lib/format";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  const { data: trip, isLoading } = useTrip();
  const { data: expenses = [] } = useExpenses();
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


  if (isLoading) return <HomeSkeleton />;
  if (!trip) {
    return (
      <div className="pt-16 text-center space-y-4">
        <div className="text-5xl">🧭</div>
        <h1 className="text-2xl font-medium">אין טיול פעיל</h1>
        <p className="text-sm text-muted-foreground">בואו ניצור טיול חדש</p>
        <Link to="/onboarding"
          className="inline-block px-6 h-12 leading-[3rem] rounded-lg bg-[color:var(--terracotta)] text-white font-medium">
          צור טיול חדש
        </Link>
      </div>
    );
  }

  return (
    <div className="pt-4 space-y-6">
      <section className="space-y-1">
        <div className="text-3xl font-medium">{trip.title}</div>
        {stats && (
          <p className="text-sm text-muted-foreground">
            {stats.beforeTrip
              ? `עוד ${stats.daysToStart} ימים ליציאה`
              : `יום ${Math.min(stats.daysPassed, stats.daysTotal)} מתוך ${stats.daysTotal}`}
          </p>
        )}
      </section>


      {stats && (
        <section
          className="border border-border rounded-2xl p-5"
          style={{
            background:
              "linear-gradient(135deg, color-mix(in oklab, var(--accent) 14%, var(--card)) 0%, color-mix(in oklab, var(--accent-2) 8%, var(--card)) 100%)",
          }}
        >
          <div className="flex items-center gap-5">
            <BudgetRing pct={stats.pct} />
            <div className="flex-1">
              <div className="text-xs text-muted-foreground">נשאר</div>
              <motion.div
                key={stats.remaining}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-[28px] font-semibold tabular-nums leading-none mt-1"
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
                className="bg-card border border-border rounded-2xl p-3 border-r-4 border-r-[color:var(--accent-2)]"
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle size={16} className="text-[color:var(--accent-2)] mt-1 shrink-0" />
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
      <Icon size={26} strokeWidth={1.6} className="text-[color:var(--accent)]" />
      <div className="text-[15px]">{label}</div>
    </Link>
  );
}


function BudgetRing({ pct }: { pct: number }) {
  const r = 40;
  const c = 2 * Math.PI * r;
  const off = c - (pct / 100) * c;
  return (
    <svg width="96" height="96" viewBox="0 0 96 96">
      <circle cx="48" cy="48" r={r} stroke="var(--border)" strokeWidth="8" fill="none" />
      <motion.circle
        cx="48" cy="48" r={r} stroke="var(--accent)" strokeWidth="8" fill="none"
        strokeLinecap="round" transform="rotate(-90 48 48)"
        strokeDasharray={c}
        initial={{ strokeDashoffset: c }}
        animate={{ strokeDashoffset: off }}
        transition={{ duration: 0.9, ease: "easeOut" }}
      />
      <text x="48" y="53" textAnchor="middle" className="fill-foreground" style={{ fontSize: 15, fontWeight: 600 }}>
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
