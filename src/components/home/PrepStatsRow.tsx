import { Link } from "@tanstack/react-router";

/** "מצב ההכנות" — compact counters from data already loaded on the home screen. */
export function PrepStatsRow({
  saved,
  planned,
  empty,
}: {
  saved: number;
  planned: number;
  empty: number;
}) {
  const rows: Array<{ value: number; label: string; to: string }> = [
    { value: saved, label: "מקומות שמורים", to: "/recommendations" },
    { value: planned, label: "ימי מסלול עם פעילויות", to: "/itinerary" },
    { value: empty, label: "ימי מסלול ללא פעילויות", to: "/itinerary" },
  ];

  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold">מצב ההכנות</h2>
      <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
        {rows.map((r) => (
          <Link
            key={r.label}
            to={r.to}
            className="flex min-h-11 items-center justify-between gap-3 px-4 py-2.5"
          >
            <span className="text-[13px] text-foreground">{r.label}</span>
            <span className="text-[15px] font-semibold tabular-nums">{r.value}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
