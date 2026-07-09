import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { motion } from "framer-motion";
import { ChevronRight, ExternalLink, Pencil, Trash2, ArrowUp, ArrowDown, Plus, Check, X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDays, dayEntriesQuery } from "@/hooks/use-trip";
import { hebDateLong } from "@/lib/format";
import { ENTRY_TYPES } from "@/lib/constants";
import { BottomSheet } from "@/components/BottomSheet";
import { saveRecommendation } from "@/lib/recommendations";
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
};

const TYPE_COLOR: Record<string, string> = {
  food: "var(--accent-2)",
  attraction: "var(--accent)",
  transport: "var(--chart-3)",
  hotel_checkin: "var(--accent-3)",
  flight: "var(--chart-4)",
  note: "var(--chart-6)",
};

const TYPE_ICON: Record<string, string> = {
  flight: "✈️", hotel_checkin: "🏨", attraction: "⛩", food: "🍜", transport: "🚆", note: "📝",
};

function sortEntries(list: EntryRow[]): EntryRow[] {
  return [...list].sort((a, b) => {
    const ta = a.time_of_day ?? "";
    const tb = b.time_of_day ?? "";
    if (ta && tb && ta !== tb) return ta.localeCompare(tb);
    if (ta && !tb) return -1;
    if (!ta && tb) return 1;
    return a.display_order - b.display_order;
  });
}

function DayDetail() {
  const { dayId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: days = [] } = useDays();
  const day = days.find((d) => d.id === dayId);
  const { data: rawEntries = [], isLoading } = useQuery(dayEntriesQuery(dayId));
  const entries = sortEntries(rawEntries as EntryRow[]);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [entryType, setEntryType] = useState<EntryType | null>(null);
  const [editEntry, setEditEntry] = useState<EntryRow | null>(null);

  const [editingCity, setEditingCity] = useState(false);
  const [cityValue, setCityValue] = useState(day?.city_label ?? "");

  const saveCity = useMutation({
    mutationFn: async () => {
      if (!day) return;
      const { error } = await supabase.from("itinerary_days").update({ city_label: cityValue }).eq("id", day.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["days"] });
      setEditingCity(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

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
    reorder.mutate({ id: a.id, order: b.display_order });
    reorder.mutate({ id: b.id, order: a.display_order });
  }

  function openPicker() {
    setEntryType(null);
    setPickerOpen(true);
  }

  if (!day) return <div className="pt-6 text-center text-muted-foreground">יום לא נמצא</div>;

  return (
    <div className="pt-2 space-y-4 pb-4">
      <button onClick={() => navigate({ to: "/itinerary" })} className="flex items-center gap-1 text-sm text-muted-foreground min-h-0 h-auto py-1">
        <ChevronRight size={16} /> חזרה למסלול
      </button>
      <header className="space-y-1">
        <div className="text-xs text-muted-foreground">יום {day.day_number}</div>
        <h1>{hebDateLong(day.date)}</h1>
        {editingCity ? (
          <div className="flex items-center gap-2 mt-2">
            <input
              autoFocus
              value={cityValue}
              onChange={(e) => setCityValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveCity.mutate();
                if (e.key === "Escape") { setEditingCity(false); setCityValue(day.city_label ?? ""); }
              }}
              dir="ltr"
              placeholder="עיר / איזור"
              className="flex-1 text-sm bg-background border border-input rounded-md px-2 py-1 outline-none focus:border-[color:var(--accent)]"
            />
            <button onClick={() => saveCity.mutate()} className="w-8 h-8 rounded-full bg-[color:var(--accent)] text-white flex items-center justify-center min-h-0">
              <Check size={14} />
            </button>
            <button onClick={() => { setEditingCity(false); setCityValue(day.city_label ?? ""); }} className="w-8 h-8 rounded-full border border-border flex items-center justify-center text-muted-foreground min-h-0">
              <X size={14} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => { setCityValue(day.city_label ?? ""); setEditingCity(true); }}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground min-h-0 h-auto py-1 mt-1"
          >
            <span dir="ltr">{day.city_label || "הוסף עיר / איזור"}</span>
            <Pencil size={12} />
          </button>
        )}
      </header>

      {isLoading ? (
        <div className="space-y-2 animate-pulse">
          {[0,1,2].map(i => <div key={i} className="h-20 bg-card border border-border rounded-2xl" />)}
        </div>
      ) : entries.length === 0 ? (
        <EmptyDay onAdd={openPicker} />
      ) : (
        <>
          <Timeline
            entries={entries}
            onEdit={setEditEntry}
            onDelete={(id) => { if (confirm("למחוק פריט?")) del.mutate(id); }}
            onMoveUp={(idx) => move(idx, -1)}
            onMoveDown={(idx) => move(idx, 1)}
          />
          <button
            onClick={openPicker}
            className="w-full h-12 rounded-xl bg-[color:var(--accent)] text-white font-medium flex items-center justify-center gap-2"
          >
            <Plus size={18} /> הוסף פעילות
          </button>
        </>
      )}

      <BottomSheet open={pickerOpen} onOpenChange={setPickerOpen} title={entryType ? undefined : "בחר סוג פעילות"}>
        {!entryType ? (
          <div className="grid grid-cols-2 gap-3 pt-2 pb-4">
            {ENTRY_TYPES.map((t) => {
              const tint = TYPE_COLOR[t.type] ?? "var(--accent)";
              return (
                <button
                  key={t.type}
                  onClick={() => setEntryType(t.type as EntryType)}
                  className="flex flex-col items-center justify-center gap-3 py-6 rounded-2xl border border-border bg-background active:scale-[0.98] transition-transform"
                  style={{ background: `color-mix(in oklab, ${tint} 8%, transparent)` }}
                >
                  <span className="text-4xl">{t.icon}</span>
                  <span className="text-sm font-medium">{t.label}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <EntryForm
            key={entryType}
            dayId={day.id}
            entryType={entryType}
            defaultOrder={entries.length}
            onDone={() => { setEntryType(null); setPickerOpen(false); }}
            onBack={() => setEntryType(null)}
          />
        )}
      </BottomSheet>

      <BottomSheet open={!!editEntry} onOpenChange={(o) => !o && setEditEntry(null)} title="ערוך פריט">
        {editEntry && (
          <EntryForm
            key={editEntry.id}
            dayId={day.id}
            entryType={editEntry.entry_type as EntryType}
            defaultOrder={editEntry.display_order}
            existing={editEntry}
            onDone={() => setEditEntry(null)}
          />
        )}
      </BottomSheet>
    </div>
  );
}

function Timeline({
  entries, onEdit, onDelete, onMoveUp, onMoveDown,
}: {
  entries: EntryRow[];
  onEdit: (e: EntryRow) => void;
  onDelete: (id: string) => void;
  onMoveUp: (i: number) => void;
  onMoveDown: (i: number) => void;
}) {
  return (
    <div className="relative">
      <div className="absolute right-[18px] top-3 bottom-3 w-px bg-border" aria-hidden />
      <div className="space-y-3">
        {entries.map((e, idx) => {
          const tint = TYPE_COLOR[e.entry_type] ?? "var(--chart-6)";
          const icon = e.icon_emoji || TYPE_ICON[e.entry_type] || "•";
          const url = e.google_maps_url;
          return (
            <motion.div
              key={e.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="relative pr-11"
            >
              <div
                className="absolute right-0 top-2 w-9 h-9 rounded-full flex items-center justify-center text-[18px] border-2 border-background z-10"
                style={{ background: `color-mix(in oklab, ${tint} 22%, transparent)`, color: tint }}
              >
                {icon}
              </div>
              <div className="bg-card border border-border rounded-2xl p-3">
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    {e.time_of_day && (
                      <div className="text-xs text-muted-foreground tabular-nums" dir="ltr">{e.time_of_day}</div>
                    )}
                    <div className="font-medium text-[15px]">{e.title}</div>
                    {e.location_name && (
                      <div className="text-xs text-muted-foreground mt-0.5" dir="ltr">{e.location_name}</div>
                    )}
                    {e.description && (
                      <div className="text-sm text-muted-foreground mt-1 whitespace-pre-line">{e.description}</div>
                    )}
                    {url && (
                      <a href={url} target="_blank" rel="noreferrer" className="text-xs text-[color:var(--accent)] inline-flex items-center gap-1 mt-2">
                        <ExternalLink size={12} /> פתח במפה
                      </a>
                    )}
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    <button aria-label="הזז למעלה" disabled={idx === 0} onClick={() => onMoveUp(idx)}
                      className="w-7 h-7 rounded-full border border-border flex items-center justify-center text-muted-foreground disabled:opacity-30 min-h-0">
                      <ArrowUp size={12} />
                    </button>
                    <button aria-label="הזז למטה" disabled={idx === entries.length - 1} onClick={() => onMoveDown(idx)}
                      className="w-7 h-7 rounded-full border border-border flex items-center justify-center text-muted-foreground disabled:opacity-30 min-h-0">
                      <ArrowDown size={12} />
                    </button>
                  </div>
                </div>
                <div className="flex gap-2 mt-2 pt-2 border-t border-border/60">
                  <button onClick={() => onEdit(e)} className="flex-1 h-8 rounded-md border border-border text-xs inline-flex items-center justify-center gap-1 min-h-0">
                    <Pencil size={11} /> ערוך
                  </button>
                  <button onClick={() => onDelete(e.id)} className="flex-1 h-8 rounded-md border border-border text-[color:var(--accent-2)] text-xs inline-flex items-center justify-center gap-1 min-h-0">
                    <Trash2 size={11} /> מחק
                  </button>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

function EmptyDay({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="text-center py-14 space-y-4 flex flex-col items-center">
      <svg viewBox="0 0 96 96" width="96" height="96" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" className="text-[color:var(--accent)]">
        <circle cx="48" cy="48" r="30" />
        <path d="M48 30v18l12 8" />
        <path d="M20 20l6 6M76 20l-6 6M48 80v6" />
      </svg>
      <div className="space-y-1">
        <div className="text-[16px] font-medium">היום עדיין ריק</div>
        <div className="text-xs text-muted-foreground max-w-[260px]">הוסף טיסות, מלונות, אטרקציות, ארוחות, תחבורה או הערות — הכל יופיע כטיימליין לפי שעות.</div>
      </div>
      <button
        onClick={onAdd}
        className="h-12 px-6 rounded-xl bg-[color:var(--accent)] text-white font-medium inline-flex items-center gap-2"
      >
        <Plus size={18} /> הוסף פעילות לאותו יום
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Entry form (dispatches by type)
// ─────────────────────────────────────────────────────────────────

function EntryForm(props: {
  dayId: string;
  entryType: EntryType;
  defaultOrder: number;
  existing?: EntryRow;
  onDone: () => void;
  onBack?: () => void;
}) {
  const { entryType } = props;
  const meta = ENTRY_TYPES.find((t) => t.type === entryType)!;
  return (
    <div className="pb-2">
      <div className="flex items-center justify-between pt-1 pb-3">
        {props.onBack ? (
          <button type="button" onClick={props.onBack} className="text-xs text-muted-foreground min-h-0 h-auto p-0">← סוג אחר</button>
        ) : <span />}
        <div className="text-lg font-medium flex items-center gap-2"><span>{meta.icon}</span>{meta.label}</div>
      </div>
      {entryType === "flight" && <FlightForm {...props} />}
      {entryType === "hotel_checkin" && <LodgingForm {...props} />}
      {entryType === "attraction" && <PlaceForm {...props} recType="attraction" />}
      {entryType === "food" && <PlaceForm {...props} recType="food" />}
      {entryType === "transport" && <TransportForm {...props} />}
      {entryType === "note" && <NoteForm {...props} />}
    </div>
  );
}

type EntryPayload = {
  entry_type: EntryType;
  title: string;
  description?: string | null;
  time_of_day?: string | null;
  icon_emoji?: string | null;
  location_name?: string | null;
  google_maps_url?: string | null;
  linked_recommendation_id?: string | null;
  display_order?: number;
};

function useUpsert(dayId: string, existingId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: EntryPayload) => {
      if (existingId) {
        const { error } = await supabase.from("day_entries").update(payload).eq("id", existingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("day_entries").insert({ day_id: dayId, ...payload });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["day-entries", dayId] });
      qc.invalidateQueries({ queryKey: ["day-entries-summary"] });
      qc.invalidateQueries({ queryKey: ["recs"] });
      toast.success(existingId ? "נשמר" : "נוסף");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

function L({ children }: { children: React.ReactNode }) {
  return <label className="text-xs text-muted-foreground">{children}</label>;
}
const inputCls = "w-full mt-1 rounded-lg bg-background border border-input px-3 h-11 outline-none focus:border-[color:var(--accent)]";
const textareaCls = "w-full mt-1 rounded-lg bg-background border border-input px-3 py-2 min-h-[70px] outline-none focus:border-[color:var(--accent)]";
const btnCls = "w-full h-12 rounded-xl bg-[color:var(--accent)] text-white font-medium disabled:opacity-50";

type BaseFormProps = {
  dayId: string;
  defaultOrder: number;
  existing?: EntryRow;
  onDone: () => void;
};

function parseDesc(desc: string | null | undefined, key: string): string {
  if (!desc) return "";
  const m = desc.match(new RegExp(`^${key}:\\s*(.*)$`, "m"));
  return m ? m[1] : "";
}

function FlightForm({ dayId, defaultOrder, existing, onDone }: BaseFormProps) {
  const [flight, setFlight] = useState(existing?.title.split(" ")[0] ?? "");
  const [origin, setOrigin] = useState(parseDesc(existing?.description, "מוצא"));
  const [destination, setDestination] = useState(parseDesc(existing?.description, "יעד"));
  const [depart, setDepart] = useState(existing?.time_of_day ?? "");
  const [arrive, setArrive] = useState(parseDesc(existing?.description, "נחיתה"));
  const [notes, setNotes] = useState(parseDesc(existing?.description, "הערות"));
  const mut = useUpsert(dayId, existing?.id);
  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      const title = `${flight} ${origin}→${destination}`.trim();
      const description = [
        origin && `מוצא: ${origin}`,
        destination && `יעד: ${destination}`,
        arrive && `נחיתה: ${arrive}`,
        notes && `הערות: ${notes}`,
      ].filter(Boolean).join("\n");
      mut.mutate({
        entry_type: "flight",
        title: title || flight || "טיסה",
        description: description || null,
        time_of_day: depart || null,
        icon_emoji: "✈️",
        display_order: existing?.display_order ?? defaultOrder,
      }, { onSuccess: onDone });
    }} className="space-y-3">
      <div><L>מספר טיסה</L><input value={flight} onChange={(e) => setFlight(e.target.value)} dir="ltr" placeholder="LY 083" className={inputCls} /></div>
      <div className="grid grid-cols-2 gap-2">
        <div><L>מוצא</L><input value={origin} onChange={(e) => setOrigin(e.target.value)} dir="ltr" placeholder="TLV" className={inputCls} /></div>
        <div><L>יעד</L><input value={destination} onChange={(e) => setDestination(e.target.value)} dir="ltr" placeholder="NRT" className={inputCls} /></div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div><L>שעת המראה</L><input type="time" value={depart} onChange={(e) => setDepart(e.target.value)} dir="ltr" className={inputCls} /></div>
        <div><L>שעת נחיתה</L><input type="time" value={arrive} onChange={(e) => setArrive(e.target.value)} dir="ltr" className={inputCls} /></div>
      </div>
      <div><L>הערות</L><textarea value={notes} onChange={(e) => setNotes(e.target.value)} className={textareaCls} /></div>
      <button type="submit" disabled={mut.isPending} className={btnCls}>{mut.isPending ? "שומר..." : "שמור"}</button>
    </form>
  );
}

function LodgingForm({ dayId, defaultOrder, existing, onDone }: BaseFormProps) {
  const [name, setName] = useState(existing?.title ?? "");
  const [time, setTime] = useState(existing?.time_of_day ?? "");
  const [price, setPrice] = useState(parseDesc(existing?.description, "מחיר ללילה"));
  const [url, setUrl] = useState(parseDesc(existing?.description, "הזמנה"));
  const [cancel, setCancel] = useState(parseDesc(existing?.description, "ביטול"));
  const [notes, setNotes] = useState(parseDesc(existing?.description, "הערות"));
  const mut = useUpsert(dayId, existing?.id);
  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      if (!name.trim()) { toast.error("שם המלון חסר"); return; }
      const description = [
        price && `מחיר ללילה: ${price}`,
        url && `הזמנה: ${url}`,
        cancel && `ביטול: ${cancel}`,
        notes && `הערות: ${notes}`,
      ].filter(Boolean).join("\n");
      mut.mutate({
        entry_type: "hotel_checkin",
        title: name.trim(),
        description: description || null,
        time_of_day: time || null,
        icon_emoji: "🏨",
        google_maps_url: url || null,
        display_order: existing?.display_order ?? defaultOrder,
      }, { onSuccess: onDone });
    }} className="space-y-3">
      <div><L>שם המלון</L><input value={name} onChange={(e) => setName(e.target.value)} required className={inputCls} /></div>
      <div><L>שעת צ׳ק-אין</L><input type="time" value={time} onChange={(e) => setTime(e.target.value)} dir="ltr" className={inputCls} /></div>
      <div><L>מחיר ללילה (₪)</L><input type="number" value={price} onChange={(e) => setPrice(e.target.value)} className={inputCls} /></div>
      <div><L>לינק להזמנה</L><input type="url" value={url} onChange={(e) => setUrl(e.target.value)} dir="ltr" className={inputCls} /></div>
      <div><L>תאריך ביטול חינם</L><input type="date" value={cancel} onChange={(e) => setCancel(e.target.value)} className={inputCls} /></div>
      <div><L>הערות</L><textarea value={notes} onChange={(e) => setNotes(e.target.value)} className={textareaCls} /></div>
      <button type="submit" disabled={mut.isPending} className={btnCls}>{mut.isPending ? "שומר..." : "שמור"}</button>
    </form>
  );
}

function PlaceForm({ dayId, defaultOrder, existing, onDone, recType }: BaseFormProps & { recType: "attraction" | "food" }) {
  const [name, setName] = useState(existing?.title ?? "");
  const [time, setTime] = useState(existing?.time_of_day ?? "");
  const [area, setArea] = useState(existing?.location_name ?? "");
  const [mapsUrl, setMapsUrl] = useState(existing?.google_maps_url ?? "");
  const [foodType, setFoodType] = useState(recType === "food" ? parseDesc(existing?.description, "סוג") : "");
  const [notes, setNotes] = useState(recType === "food" ? parseDesc(existing?.description, "הערות") || (existing?.description ?? "") : (existing?.description ?? ""));
  const [saveToRecs, setSaveToRecs] = useState(false);
  const mut = useUpsert(dayId, existing?.id);
  return (
    <form onSubmit={async (e) => {
      e.preventDefault();
      if (!name.trim()) { toast.error(recType === "food" ? "שם המסעדה חסר" : "שם האטרקציה חסר"); return; }
      let linkedId: string | null = existing?.linked_recommendation_id ?? null;
      if (!existing && saveToRecs) {
        try {
          linkedId = await saveRecommendation({
            type: recType, name: name.trim(), city: area || null,
            google_maps_url: mapsUrl || null, notes: notes || null,
          });
        } catch (err) {
          toast.error((err as Error).message);
        }
      }
      const description = recType === "food"
        ? [foodType && `סוג: ${foodType}`, notes && `הערות: ${notes}`].filter(Boolean).join("\n")
        : notes;
      mut.mutate({
        entry_type: recType,
        title: name.trim(),
        description: description || null,
        time_of_day: time || null,
        icon_emoji: recType === "food" ? "🍜" : "⛩",
        location_name: area || null,
        google_maps_url: mapsUrl || null,
        linked_recommendation_id: linkedId,
        display_order: existing?.display_order ?? defaultOrder,
      }, { onSuccess: onDone });
    }} className="space-y-3">
      <div><L>{recType === "food" ? "שם המסעדה" : "שם האטרקציה"}</L><input value={name} onChange={(e) => setName(e.target.value)} required className={inputCls} /></div>
      <div><L>שעה מתוכננת</L><input type="time" value={time} onChange={(e) => setTime(e.target.value)} dir="ltr" className={inputCls} /></div>
      <div><L>אזור / שכונה</L><input value={area} onChange={(e) => setArea(e.target.value)} dir="ltr" className={inputCls} /></div>
      {recType === "food" && (
        <div><L>סוג אוכל</L><input value={foodType} onChange={(e) => setFoodType(e.target.value)} placeholder="ראמן, סושי..." className={inputCls} /></div>
      )}
      <div><L>לינק גוגל מפות</L><input type="url" value={mapsUrl} onChange={(e) => setMapsUrl(e.target.value)} dir="ltr" placeholder="https://maps.app.goo.gl/..." className={inputCls} /></div>
      <div><L>הערות</L><textarea value={notes} onChange={(e) => setNotes(e.target.value)} className={textareaCls} /></div>
      {!existing && (
        <label className="flex items-center gap-2 py-2 text-sm">
          <input type="checkbox" checked={saveToRecs} onChange={(e) => setSaveToRecs(e.target.checked)} className="w-4 h-4 accent-[color:var(--accent)]" />
          <span>שמור גם בהמלצות</span>
        </label>
      )}
      <button type="submit" disabled={mut.isPending} className={btnCls}>{mut.isPending ? "שומר..." : "שמור"}</button>
    </form>
  );
}

const TRANSPORT_TYPES = ["רכבת", "אוטובוס", "מונית", "הליכה", "שינקנסן", "מטרו"];

function TransportForm({ dayId, defaultOrder, existing, onDone }: BaseFormProps) {
  const [kind, setKind] = useState(existing ? parseDesc(existing.description, "סוג") || "רכבת" : "רכבת");
  const [from, setFrom] = useState(existing ? parseDesc(existing.description, "מוצא") : "");
  const [to, setTo] = useState(existing ? parseDesc(existing.description, "יעד") : "");
  const [time, setTime] = useState(existing?.time_of_day ?? "");
  const [duration, setDuration] = useState(existing ? parseDesc(existing.description, "משך") : "");
  const [notes, setNotes] = useState(existing ? parseDesc(existing.description, "הערות") : "");
  const mut = useUpsert(dayId, existing?.id);
  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      const description = [
        `סוג: ${kind}`,
        from && `מוצא: ${from}`,
        to && `יעד: ${to}`,
        duration && `משך: ${duration}`,
        notes && `הערות: ${notes}`,
      ].filter(Boolean).join("\n");
      mut.mutate({
        entry_type: "transport",
        title: `${kind}${from && to ? ` · ${from} → ${to}` : ""}`,
        description: description || null,
        time_of_day: time || null,
        icon_emoji: "🚆",
        display_order: existing?.display_order ?? defaultOrder,
      }, { onSuccess: onDone });
    }} className="space-y-3">
      <div><L>סוג</L>
        <select value={kind} onChange={(e) => setKind(e.target.value)} className={inputCls}>
          {TRANSPORT_TYPES.map((t) => <option key={t}>{t}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div><L>מוצא</L><input value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} /></div>
        <div><L>יעד</L><input value={to} onChange={(e) => setTo(e.target.value)} className={inputCls} /></div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div><L>שעת יציאה</L><input type="time" value={time} onChange={(e) => setTime(e.target.value)} dir="ltr" className={inputCls} /></div>
        <div><L>משך</L><input value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="2.5 שעות" className={inputCls} /></div>
      </div>
      <div><L>הערות</L><textarea value={notes} onChange={(e) => setNotes(e.target.value)} className={textareaCls} /></div>
      <button type="submit" disabled={mut.isPending} className={btnCls}>{mut.isPending ? "שומר..." : "שמור"}</button>
    </form>
  );
}

function NoteForm({ dayId, defaultOrder, existing, onDone }: BaseFormProps) {
  const [title, setTitle] = useState(existing?.title === "הערה" ? "" : (existing?.title ?? ""));
  const [content, setContent] = useState(existing?.description ?? "");
  const mut = useUpsert(dayId, existing?.id);
  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      if (!content.trim()) { toast.error("תוכן חסר"); return; }
      mut.mutate({
        entry_type: "note",
        title: title.trim() || "הערה",
        description: content,
        icon_emoji: "📝",
        display_order: existing?.display_order ?? defaultOrder,
      }, { onSuccess: onDone });
    }} className="space-y-3">
      <div><L>כותרת (לא חובה)</L><input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} /></div>
      <div><L>תוכן</L><textarea value={content} onChange={(e) => setContent(e.target.value)} required rows={5} className={textareaCls} /></div>
      <button type="submit" disabled={mut.isPending} className={btnCls}>{mut.isPending ? "שומר..." : "שמור"}</button>
    </form>
  );
}
