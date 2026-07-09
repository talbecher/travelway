import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Pencil, Trash2, Check, X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useDays, useTrip } from "@/hooks/use-trip";
import { hebDate } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import { TRIP_ID } from "@/lib/constants";
import { EmptyState } from "@/components/EmptyState";
import { toast } from "sonner";

export const Route = createFileRoute("/itinerary")({
  component: Itinerary,
});

type EntryChip = { icon: string; type: string };

const TYPE_COLOR: Record<string, string> = {
  food: "var(--chart-1)",
  attraction: "var(--chart-2)",
  transport: "var(--chart-3)",
  shopping: "var(--chart-4)",
  hotel_checkin: "var(--chart-5)",
  accommodation: "var(--chart-5)",
  flight: "var(--accent)",
  note: "var(--chart-6)",
};

// Stable, deterministic city → accent color pick
const CITY_PALETTE = [
  "var(--accent)",
  "var(--accent-3)",
  "var(--accent-2)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
];
function cityColor(city: string) {
  if (!city) return "var(--border)";
  let h = 0;
  for (let i = 0; i < city.length; i++) h = (h * 31 + city.charCodeAt(i)) >>> 0;
  return CITY_PALETTE[h % CITY_PALETTE.length];
}

function iconFor(t: string) {
  const m: Record<string, string> = { flight: "✈️", hotel_checkin: "🏨", attraction: "⛩", food: "🍜", transport: "🚆", note: "📝" };
  return m[t] ?? "•";
}

function Itinerary() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: trip } = useTrip();
  const { data: days = [], isLoading } = useDays();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const saveCity = useMutation({
    mutationFn: async ({ id, city }: { id: string; city: string }) => {
      const { error } = await supabase.from("itinerary_days").update({ city_label: city }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["days"] });
      qc.invalidateQueries({ queryKey: ["day-entries-summary"] });
      setEditingId(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delDay = useMutation({
    mutationFn: async (id: string) => {
      const { count } = await supabase
        .from("day_entries").select("id", { count: "exact", head: true }).eq("day_id", id);
      if ((count ?? 0) > 0) throw new Error("יש פריטים ביום זה — מחקו אותם קודם");
      const { error } = await supabase.from("itinerary_days").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["days"] });
      toast.success("היום נמחק");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const { data: entriesByDay = {} } = useQuery({
    queryKey: ["day-entries-summary"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("day_entries")
        .select("day_id, entry_type, icon_emoji, itinerary_days!inner(trip_id)")
        .eq("itinerary_days.trip_id", TRIP_ID);
      if (error) throw error;
      const map: Record<string, EntryChip[]> = {};
      for (const e of data ?? []) {
        (map[e.day_id] ||= []).push({ icon: e.icon_emoji || iconFor(e.entry_type), type: e.entry_type });
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

  if (days.length === 0) {
    return (
      <div className="pt-6">
        <EmptyState variant="trip" title="עדיין אין ימים" hint="הימים ייווצרו אוטומטית לפי תאריכי הטיול" />
      </div>
    );
  }

  return (
    <div className="pt-2 space-y-6">
      <header>
        <h1>מסלול</h1>
        <p className="text-sm text-muted-foreground mt-1">{trip?.destination_country} · {days.length} ימים</p>
      </header>

      {grouped.map((g) => {
        const color = cityColor(g.city);
        return (
          <section key={g.city + g.days[0].day_number}>
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-block w-2 h-2 rounded-full" style={{ background: color }} />
              <div className="text-xs uppercase tracking-wider text-muted-foreground" dir="ltr">
                {g.city}
              </div>
            </div>
            <div className="space-y-2">
              {g.days.map((d) => {
                const chips = entriesByDay[d.id] ?? [];
                const isEditing = editingId === d.id;
                const isEmpty = chips.length === 0;
                return (
                  <div
                    key={d.id}
                    className="flex items-center gap-2 bg-card border border-border rounded-2xl px-3 py-2 border-r-4"
                    style={{ borderRightColor: color }}
                  >
                    <button
                      type="button"
                      onClick={() => !isEditing && navigate({ to: "/itinerary/$dayId", params: { dayId: d.id } })}
                      className="flex-1 min-w-0 text-right flex items-center gap-3 min-h-0 h-auto py-1"
                    >
                      <div className="w-9 text-center shrink-0">
                        <div className="text-[20px] font-semibold tabular-nums leading-none">{d.day_number}</div>
                        <div className="text-[10px] text-muted-foreground mt-1">יום</div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[15px] font-medium">{hebDate(d.date)}</div>
                        {isEditing ? (
                          <div className="flex items-center gap-1 mt-1" onClick={(e) => e.stopPropagation()}>
                            <input
                              autoFocus
                              value={editValue}
                              dir="ltr"
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveCity.mutate({ id: d.id, city: editValue });
                                if (e.key === "Escape") setEditingId(null);
                              }}
                              className="flex-1 text-xs bg-background border border-input rounded px-2 py-1 outline-none focus:border-[color:var(--accent)]"
                              placeholder="עיר / איזור"
                            />
                            <button type="button" onClick={(e) => { e.stopPropagation(); saveCity.mutate({ id: d.id, city: editValue }); }}
                              className="w-6 h-6 rounded flex items-center justify-center text-[color:var(--accent-3)] min-h-0">
                              <Check size={14} />
                            </button>
                            <button type="button" onClick={(e) => { e.stopPropagation(); setEditingId(null); }}
                              className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground min-h-0">
                              <X size={14} />
                            </button>
                          </div>
                        ) : isEmpty ? (
                          <div className="text-xs text-muted-foreground">לא תוכנן עדיין — לחץ להוספה</div>
                        ) : (
                          <div className="text-xs text-muted-foreground" dir="ltr">{d.city_label}</div>
                        )}
                      </div>
                      {!isEditing && (
                        <div className="flex gap-1 shrink-0">
                          {chips.slice(0, 4).map((c, i) => {
                            const tint = TYPE_COLOR[c.type] ?? "var(--chart-6)";
                            return (
                              <span
                                key={i}
                                className="w-6 h-6 rounded-full flex items-center justify-center text-[11px]"
                                style={{ background: `color-mix(in oklab, ${tint} 22%, transparent)`, color: tint }}
                              >
                                {c.icon}
                              </span>
                            );
                          })}
                          {chips.length > 4 && (
                            <span className="w-6 h-6 rounded-full bg-muted text-muted-foreground text-[10px] flex items-center justify-center">
                              +{chips.length - 4}
                            </span>
                          )}
                        </div>
                      )}
                    </button>
                    {!isEditing && (
                      <div className="flex flex-col gap-1 shrink-0">
                        <button
                          type="button"
                          aria-label="ערוך שם עיר"
                          onClick={(e) => { e.stopPropagation(); setEditValue(d.city_label ?? ""); setEditingId(d.id); }}
                          className="w-7 h-7 rounded-full border border-border flex items-center justify-center text-muted-foreground min-h-0"
                        >
                          <Pencil size={12} />
                        </button>
                        <button
                          type="button"
                          aria-label="מחק יום"
                          onClick={(e) => { e.stopPropagation(); if (confirm(`למחוק את יום ${d.day_number}?`)) delDay.mutate(d.id); }}
                          className="w-7 h-7 rounded-full border border-border flex items-center justify-center text-[color:var(--accent-2)] min-h-0"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="pt-2 space-y-3 animate-pulse">
      {[0,1,2,3,4,5,6].map(i => <div key={i} className="h-14 bg-card border border-border rounded-2xl" />)}
    </div>
  );
}
