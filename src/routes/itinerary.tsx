import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useDays, useTrip } from "@/hooks/use-trip";
import { hebDate } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { TRIP_ID } from "@/lib/constants";

export const Route = createFileRoute("/itinerary")({
  component: Itinerary,
});

function Itinerary() {
  const { data: trip } = useTrip();
  const { data: days = [], isLoading } = useDays();

  // per-day entry types for icon strip
  const { data: entriesByDay = {} } = useQuery({
    queryKey: ["day-entries-summary"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("day_entries")
        .select("day_id, entry_type, icon_emoji, itinerary_days!inner(trip_id)")
        .eq("itinerary_days.trip_id", TRIP_ID);
      if (error) throw error;
      const map: Record<string, string[]> = {};
      for (const e of data ?? []) {
        (map[e.day_id] ||= []).push(e.icon_emoji || iconFor(e.entry_type));
      }
      return map;
    },
  });

  const grouped = useMemo(() => {
    const groups: { city: string; days: typeof days }[] = [];
    for (const d of days) {
      const label = d.city_label ?? "";
      const last = groups[groups.length - 1];
      if (last && last.city === label) last.days.push(d);
      else groups.push({ city: label, days: [d] });
    }
    return groups;
  }, [days]);

  if (isLoading) return <ListSkeleton />;

  return (
    <div className="pt-2 space-y-6">
      <header>
        <h1 className="text-2xl font-medium">מסלול</h1>
        <p className="text-sm text-muted-foreground">{trip?.destination_country} · {days.length} ימים</p>
      </header>

      {grouped.map((g) => (
        <section key={g.city + g.days[0].day_number}>
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2" dir="ltr">
            {g.city}
          </div>
          <div className="space-y-2">
            {g.days.map((d) => {
              const icons = entriesByDay[d.id] ?? [];
              return (
                <Link
                  key={d.id}
                  to="/itinerary/$dayId"
                  params={{ dayId: d.id }}
                  className="flex items-center gap-3 bg-card border border-border rounded-lg px-4 py-3"
                >
                  <div className="w-8 text-center">
                    <div className="text-lg font-medium tabular-nums">{d.day_number}</div>
                  </div>
                  <div className="flex-1">
                    <div className="text-sm">{hebDate(d.date)}</div>
                    <div className="text-xs text-muted-foreground" dir="ltr">{d.city_label}</div>
                  </div>
                  <div className="flex gap-1 text-lg">{icons.slice(0, 4).map((ic, i) => <span key={i}>{ic}</span>)}</div>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function iconFor(t: string) {
  const m: Record<string, string> = { flight: "✈️", hotel_checkin: "🏨", attraction: "⛩", food: "🍜", transport: "🚆", note: "📝" };
  return m[t] ?? "•";
}

function ListSkeleton() {
  return (
    <div className="pt-2 space-y-3 animate-pulse">
      {[0,1,2,3,4,5,6].map(i => <div key={i} className="h-14 bg-card border border-border rounded-lg" />)}
    </div>
  );
}
