import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { motion } from "framer-motion";
import { ChevronRight, ExternalLink, Pencil, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDays, dayEntriesQuery, useRecs } from "@/hooks/use-trip";
import { hebDateLong } from "@/lib/format";
import { ENTRY_TYPES } from "@/lib/constants";
import { BottomSheet } from "@/components/BottomSheet";
import { toast } from "sonner";

export const Route = createFileRoute("/itinerary/$dayId")({
  component: DayDetail,
});

type EntryType = "flight" | "hotel_checkin" | "attraction" | "food" | "transport" | "note";
type EntryRow = {
  id: string;
  entry_type: string;
  title: string;
  description: string | null;
  time_of_day: string | null;
  icon_emoji: string | null;
  google_maps_url: string | null;
  location_name: string | null;
  linked_recommendation_id: string | null;
  display_order: number;
  recommendations: { google_maps_url: string | null } | null;
};

function DayDetail() {
  const { dayId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: days = [] } = useDays();
  const day = days.find((d) => d.id === dayId);
  const { data: entries = [], isLoading } = useQuery(dayEntriesQuery(dayId));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [entryType, setEntryType] = useState<EntryType | null>(null);
  const [editEntry, setEditEntry] = useState<EntryRow | null>(null);
  const [cityLabel, setCityLabel] = useState(day?.city_label ?? "");

  async function saveCity() {
    if (!day || cityLabel === day.city_label) return;
    await supabase.from("itinerary_days").update({ city_label: cityLabel }).eq("id", day.id);
    qc.invalidateQueries({ queryKey: ["days"] });
    qc.invalidateQueries({ queryKey: ["day-entries-summary"] });
  }

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("day_entries").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["day-entries", dayId] });
      qc.invalidateQueries({ queryKey: ["day-entries-summary"] });
      toast.success("נמחק");
    },
  });

  const reorder = useMutation({
    mutationFn: async ({ id, order }: { id: string; order: number }) => {
      const { error } = await supabase.from("day_entries").update({ display_order: order }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["day-entries", dayId] }),
  });

  function move(idx: number, dir: -1 | 1) {
    const swap = idx + dir;
    if (swap < 0 || swap >= entries.length) return;
    const a = entries[idx], b = entries[swap];
    reorder.mutate({ id: a.id, order: swap });
    reorder.mutate({ id: b.id, order: idx });
  }

  if (!day) return <div className="pt-6 text-center text-muted-foreground">יום לא נמצא</div>;

  return (
    <div className="pt-2 space-y-4">
      <button onClick={() => navigate({ to: "/itinerary" })} className="flex items-center gap-1 text-sm text-muted-foreground min-h-0 h-auto py-1">
        <ChevronRight size={16} /> חזרה למסלול
      </button>
      <header className="space-y-1">
        <div className="text-xs text-muted-foreground">יום {day.day_number}</div>
        <h1>{hebDateLong(day.date)}</h1>
        <input
          value={cityLabel}
          onChange={(e) => setCityLabel(e.target.value)}
          onBlur={saveCity}
          dir="ltr"
          className="text-sm bg-transparent border-b border-border w-full pb-1 outline-none focus:border-[color:var(--accent)]"
        />
      </header>


      {isLoading ? (
        <div className="space-y-2 animate-pulse">
          {[0,1,2].map(i => <div key={i} className="h-20 bg-card border border-border rounded-lg" />)}
        </div>
      ) : entries.length === 0 ? (
        <EmptyDay />
      ) : (
        <div className="space-y-2">
          {entries.map((e, idx) => (
            <EntryCard
              key={e.id}
              entry={e as EntryRow}
              canMoveUp={idx > 0}
              canMoveDown={idx < entries.length - 1}
              onMoveUp={() => move(idx, -1)}
              onMoveDown={() => move(idx, 1)}
              onEdit={() => setEditEntry(e as EntryRow)}
              onDelete={() => { if (confirm("למחוק פריט?")) del.mutate(e.id); }}
            />
          ))}
        </div>
      )}

      <button
        onClick={() => setPickerOpen(true)}
        className="w-full h-12 rounded-lg border border-dashed border-border text-sm text-muted-foreground"
      >
        + הוסף לאותו יום
      </button>

      <BottomSheet open={pickerOpen} onOpenChange={setPickerOpen} title="הוסף פריט">
        {!entryType ? (
          <div className="grid grid-cols-3 gap-3 pt-2 pb-4">
            {ENTRY_TYPES.map((t) => (
              <button
                key={t.type}
                onClick={() => setEntryType(t.type as EntryType)}
                className="flex flex-col items-center gap-2 py-4 rounded-lg border border-border bg-background"
              >
                <span className="text-3xl">{t.icon}</span>
                <span className="text-xs">{t.label}</span>
              </button>
            ))}
          </div>
        ) : (
          <EntryForm
            dayId={day.id}
            city={day.city_label ?? ""}
            entryType={entryType}
            onDone={() => { setEntryType(null); setPickerOpen(false); }}
            onBack={() => setEntryType(null)}
          />
        )}
      </BottomSheet>

      <BottomSheet open={!!editEntry} onOpenChange={(o) => !o && setEditEntry(null)} title="ערוך פריט">
        {editEntry && <EditEntryForm entry={editEntry} onDone={() => setEditEntry(null)} />}
      </BottomSheet>
    </div>
  );
}

function EntryCard({ entry, onDelete, onEdit, canMoveUp, canMoveDown, onMoveUp, onMoveDown }: {
  entry: EntryRow;
  onDelete: () => void;
  onEdit: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const url = entry.google_maps_url ?? entry.recommendations?.google_maps_url ?? null;
  const typeColors: Record<string, string> = {
    food: "var(--chart-1)",
    attraction: "var(--chart-2)",
    transport: "var(--chart-3)",
    hotel_checkin: "var(--chart-5)",
    flight: "var(--accent)",
    note: "var(--chart-6)",
  };
  const tint = typeColors[entry.entry_type] ?? "var(--chart-6)";
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card border border-border rounded-2xl p-3"
    >
      <div className="flex items-start gap-3">
        <div className="flex flex-col gap-1 shrink-0">
          <button aria-label="הזז למעלה" disabled={!canMoveUp} onClick={onMoveUp}
            className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground disabled:opacity-30 min-h-0">
            <ArrowUp size={12} />
          </button>
          <button aria-label="הזז למטה" disabled={!canMoveDown} onClick={onMoveDown}
            className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground disabled:opacity-30 min-h-0">
            <ArrowDown size={12} />
          </button>
        </div>
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center text-[16px] shrink-0"
          style={{ background: `color-mix(in oklab, ${tint} 22%, transparent)`, color: tint }}
        >
          {entry.icon_emoji || "•"}
        </div>
        <div className="flex-1 min-w-0">
          {entry.time_of_day && (
            <div className="text-xs text-muted-foreground tabular-nums">{entry.time_of_day}</div>
          )}
          <div className="font-medium text-[15px]">{entry.title}</div>
          {entry.description && (
            <div className="text-sm text-muted-foreground mt-0.5">{entry.description}</div>
          )}
          {url && (
            <a href={url} target="_blank" rel="noreferrer" className="text-xs text-[color:var(--accent)] inline-flex items-center gap-1 mt-2">
              <ExternalLink size={12} /> מפה
            </a>
          )}
        </div>
        <div className="flex flex-col gap-1 shrink-0">
          <button onClick={onEdit} aria-label="ערוך"
            className="w-8 h-8 rounded-full border border-border flex items-center justify-center text-muted-foreground min-h-0">
            <Pencil size={13} />
          </button>
          <button onClick={onDelete} aria-label="מחק"
            className="w-8 h-8 rounded-full border border-border flex items-center justify-center text-[color:var(--accent-2)] min-h-0">
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function EditEntryForm({ entry, onDone }: { entry: EntryRow; onDone: () => void }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState(entry.title);
  const [description, setDescription] = useState(entry.description ?? "");
  const [time, setTime] = useState(entry.time_of_day ?? "");
  const [location, setLocation] = useState(entry.location_name ?? "");
  const [mapsUrl, setMapsUrl] = useState(entry.google_maps_url ?? "");

  const save = useMutation({
    mutationFn: async () => {
      if (!title.trim()) throw new Error("חסר שם");
      const { error } = await supabase.from("day_entries").update({
        title: title.trim(),
        description: description || null,
        time_of_day: time || null,
        location_name: location || null,
        google_maps_url: mapsUrl || null,
      }).eq("id", entry.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["day-entries"] });
      qc.invalidateQueries({ queryKey: ["day-entries-summary"] });
      toast.success("נשמר");
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-3 pt-2 pb-2">
      <div>
        <label className="text-xs text-muted-foreground">כותרת</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} required
          className="w-full mt-1 rounded-lg bg-background border border-input px-3 h-11" />
      </div>
      <div>
        <label className="text-xs text-muted-foreground">שעה</label>
        <input value={time} onChange={(e) => setTime(e.target.value)} placeholder="09:00" dir="ltr"
          className="w-full mt-1 rounded-lg bg-background border border-input px-3 h-11" />
      </div>
      <div>
        <label className="text-xs text-muted-foreground">פרטים / הערות</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
          className="w-full mt-1 rounded-lg bg-background border border-input px-3 py-2 min-h-[60px]" />
      </div>
      <div>
        <label className="text-xs text-muted-foreground">מיקום</label>
        <input value={location} onChange={(e) => setLocation(e.target.value)}
          className="w-full mt-1 rounded-lg bg-background border border-input px-3 h-11" />
      </div>
      <div>
        <label className="text-xs text-muted-foreground">Google Maps URL</label>
        <input value={mapsUrl} onChange={(e) => setMapsUrl(e.target.value)} dir="ltr"
          className="w-full mt-1 rounded-lg bg-background border border-input px-3 h-11" />
      </div>
      <button type="submit" disabled={save.isPending}
        className="w-full h-12 rounded-lg bg-[color:var(--accent)] text-white font-medium disabled:opacity-50">
        {save.isPending ? "שומר..." : "שמור"}
      </button>
    </form>
  );
}

function EmptyDay() {
  return (
    <div className="text-center py-10 space-y-2">
      <svg viewBox="0 0 64 64" width="64" height="64" fill="none" stroke="currentColor" strokeWidth="1.4" className="mx-auto text-[color:var(--accent)]">
        <circle cx="32" cy="34" r="10" />
        <path d="M32 16v4M32 48v4M16 34h4M48 34h4" strokeLinecap="round" />
      </svg>
      <p className="text-sm text-muted-foreground">אין פריטים ליום זה</p>
    </div>
  );
}


function EntryForm({ dayId, city, entryType, onDone, onBack }: {
  dayId: string; city: string; entryType: EntryType; onDone: () => void; onBack: () => void;
}) {
  const qc = useQueryClient();
  const { data: recs = [] } = useRecs();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [time, setTime] = useState("");
  const [linkedId, setLinkedId] = useState<string>("");
  const [search, setSearch] = useState("");

  const needsPicker = entryType === "attraction" || entryType === "food";
  const filterType = entryType === "food" ? "food" : "attraction";
  const picks = recs
    .filter((r) => r.type === filterType)
    .filter((r) => !city || r.city === city)
    .filter((r) => !search || r.name.toLowerCase().includes(search.toLowerCase()));

  const meta = ENTRY_TYPES.find((t) => t.type === entryType)!;

  const save = useMutation({
    mutationFn: async () => {
      if (!title.trim()) throw new Error("חסר שם");
      const linked = linkedId || null;
      const pickedRec = linked ? recs.find((r) => r.id === linked) : null;
      const { error } = await supabase.from("day_entries").insert({
        day_id: dayId,
        entry_type: entryType,
        title: title.trim(),
        description: description || null,
        time_of_day: time || null,
        icon_emoji: meta.icon,
        location_name: pickedRec?.city ?? null,
        google_maps_url: pickedRec?.google_maps_url ?? null,
        // CRITICAL: FK link for bidirectional recommendation → day association
        linked_recommendation_id: linked,
        display_order: 0,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["day-entries", dayId] });
      qc.invalidateQueries({ queryKey: ["day-entries-summary"] });
      toast.success("נוסף");
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function pick(id: string, name: string) {
    setLinkedId(id);
    setTitle(name);
    setSearch("");
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-3 pt-2 pb-2">
      <button type="button" onClick={onBack} className="text-xs text-muted-foreground min-h-0 h-auto p-0">← סוג אחר</button>
      <div className="text-lg flex items-center gap-2"><span>{meta.icon}</span>{meta.label}</div>

      {needsPicker && (
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">בחר מההמלצות ({city})</label>
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setLinkedId(""); }}
            placeholder="חיפוש..."
            className="w-full rounded-lg bg-background border border-input px-3"
          />
          {search && (
            <div className="max-h-40 overflow-y-auto border border-border rounded-lg">
              {picks.length === 0 && <div className="p-2 text-xs text-muted-foreground">לא נמצאו המלצות</div>}
              {picks.map((r) => (
                <button
                  type="button"
                  key={r.id}
                  onClick={() => pick(r.id, r.name)}
                  className="w-full text-right px-3 py-2 border-b border-border last:border-0 hover:bg-muted min-h-0 h-auto"
                >
                  <div className="text-sm" dir="ltr">{r.name}</div>
                  <div className="text-xs text-muted-foreground" dir="ltr">{r.city}</div>
                </button>
              ))}
            </div>
          )}
          {linkedId && <div className="text-xs text-[color:var(--terracotta)]">✓ מקושר להמלצה</div>}
        </div>
      )}

      <div>
        <label className="text-xs text-muted-foreground">כותרת</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} required
          className="w-full mt-1 rounded-lg bg-background border border-input px-3" />
      </div>
      <div>
        <label className="text-xs text-muted-foreground">שעה</label>
        <input value={time} onChange={(e) => setTime(e.target.value)} placeholder="09:00" dir="ltr"
          className="w-full mt-1 rounded-lg bg-background border border-input px-3" />
      </div>
      <div>
        <label className="text-xs text-muted-foreground">פרטים / הערות</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
          className="w-full mt-1 rounded-lg bg-background border border-input px-3 py-2 min-h-[60px]" />
      </div>
      <button type="submit" disabled={save.isPending}
        className="w-full h-12 rounded-lg bg-[color:var(--terracotta)] text-white font-medium disabled:opacity-50">
        {save.isPending ? "שומר..." : "הוסף"}
      </button>
    </form>
  );
}
