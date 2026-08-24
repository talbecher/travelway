import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { BottomSheet } from "@/components/BottomSheet";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTripId } from "@/hooks/use-active-trip";
import { useActiveVersion } from "@/hooks/use-versions";
import { useDays, useRecs, useExpenses } from "@/hooks/use-trip";
import { useDocuments } from "@/hooks/use-documents";
import { hebDate, ils } from "@/lib/format";

type Hit = {
  id: string;
  group: "recs" | "itinerary" | "documents" | "expenses";
  icon: string;
  title: string;
  subtitle: string;
  go: () => void;
};

const GROUP_LABEL: Record<Hit["group"], string> = {
  itinerary: "מסלול",
  recs: "מקומות שמורים",
  documents: "מסמכים",
  expenses: "הוצאות",
};

type EntryHit = {
  id: string;
  day_id: string;
  entry_type: string;
  title: string;
  location_name: string | null;
  time_of_day: string | null;
};

export function GlobalSearch({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [q, setQ] = useState("");
  const navigate = useNavigate();
  const tripId = useActiveTripId();
  const { version } = useActiveVersion(tripId);
  const { data: days = [] } = useDays();
  const { data: recs = [] } = useRecs();
  const { data: expenses = [] } = useExpenses();
  const { data: documents = [] } = useDocuments(tripId);

  const { data: entries = [] } = useQuery<EntryHit[]>({
    queryKey: ["global-search-entries", tripId, version?.id ?? null],
    enabled: !!tripId && !!version?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("day_entries")
        .select("id, day_id, entry_type, title, location_name, time_of_day, itinerary_days!inner(trip_id, version_id)")
        .eq("itinerary_days.trip_id", tripId)
        .eq("itinerary_days.version_id", version!.id);
      if (error) throw error;
      return (data ?? []) as unknown as EntryHit[];
    },
  });

  const term = q.trim().toLowerCase();

  const hits = useMemo<Hit[]>(() => {
    if (term.length < 2) return [];
    const has = (...vals: Array<string | null | undefined>) =>
      vals.some((v) => (v ?? "").toLowerCase().includes(term));
    const out: Hit[] = [];

    for (const e of entries) {
      if (!has(e.title, e.location_name)) continue;
      const day = days.find((d) => d.id === e.day_id);
      out.push({
        id: `e-${e.id}`,
        group: "itinerary",
        icon: "🗓",
        title: e.title,
        subtitle: [day ? `יום ${day.day_number}` : null, day ? hebDate(day.date) : null, e.time_of_day?.slice(0, 5)]
          .filter(Boolean)
          .join(" · "),
        go: () => {
          onOpenChange(false);
          if (day) navigate({ to: "/itinerary/$dayId", params: { dayId: day.id } });
        },
      });
    }

    for (const r of recs as Array<Record<string, string | null>>) {
      if (!has(r["name"], r["city"], r["notes"])) continue;
      out.push({
        id: `r-${r["id"]}`,
        group: "recs",
        icon: r["type"] === "food" ? "🍜" : r["type"] === "hotel" ? "🏨" : "⛩",
        title: r["name"] ?? "",
        subtitle: r["city"] ?? "",
        go: () => {
          onOpenChange(false);
          navigate({ to: "/recommendations" });
        },
      });
    }

    for (const d of documents) {
      if (!has(d.title, d.notes)) continue;
      out.push({
        id: `d-${d.id}`,
        group: "documents",
        icon: "📄",
        title: d.title,
        subtitle: d.valid_date ? hebDate(d.valid_date) : "",
        go: () => {
          onOpenChange(false);
          navigate({ to: "/documents" });
        },
      });
    }

    for (const x of expenses as Array<Record<string, string | number | null>>) {
      if (!has(String(x["title"] ?? ""), String(x["category"] ?? ""))) continue;
      out.push({
        id: `x-${x["id"]}`,
        group: "expenses",
        icon: "💸",
        title: String(x["title"] ?? ""),
        subtitle: ils(Number(x["amount_ils"] ?? 0)),
        go: () => {
          onOpenChange(false);
          navigate({ to: "/budget" });
        },
      });
    }

    return out;
  }, [term, entries, days, recs, documents, expenses, navigate, onOpenChange]);

  const groups = (["itinerary", "recs", "documents", "expenses"] as const)
    .map((g) => ({ key: g, items: hits.filter((h) => h.group === g).slice(0, 8) }))
    .filter((g) => g.items.length > 0);

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title="חיפוש">
      <div className="relative">
        <Search size={15} className="absolute top-1/2 -translate-y-1/2 right-3 text-muted-foreground" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="חפש מקום, פריט במסלול, מסמך או הוצאה"
          className="w-full h-11 rounded-xl bg-[color:var(--surface-2)] border border-border pr-9 pl-3 text-sm outline-none focus:border-[color:var(--accent)]"
        />
      </div>

      <div className="mt-3 space-y-4 pb-2">
        {term.length < 2 ? (
          <p className="text-[12px] text-muted-foreground text-center py-6">הקלד לפחות 2 תווים</p>
        ) : groups.length === 0 ? (
          <p className="text-[12px] text-muted-foreground text-center py-6">לא נמצאו תוצאות</p>
        ) : (
          groups.map((g) => (
            <div key={g.key}>
              <div className="text-[11px] text-muted-foreground mb-1.5">{GROUP_LABEL[g.key]}</div>
              <div className="space-y-1.5">
                {g.items.map((h) => (
                  <button
                    key={h.id}
                    onClick={h.go}
                    className="w-full text-right flex items-center gap-2.5 rounded-xl border border-border bg-background p-2.5"
                  >
                    <span className="text-lg shrink-0">{h.icon}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-medium truncate">{h.title}</span>
                      {h.subtitle && (
                        <span className="block text-[11px] text-muted-foreground truncate">{h.subtitle}</span>
                      )}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </BottomSheet>
  );
}
