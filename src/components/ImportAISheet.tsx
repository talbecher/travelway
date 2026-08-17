import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { BottomSheet } from "@/components/BottomSheet";
import { searchPlaces, getPlacePhotoUrl } from "@/lib/places.functions";
import {
  applyEntries,
  applyRecs,
  defaultIcon,
  normalizeName,
  parseAIResponse,
  type ParsedEntry,
  type ParsedRec,
  type PlaceLookup,
} from "@/lib/ai-import";

type DayLite = { id: string; day_number: number; date: string; city_label?: string | null };

export function ImportAISheet({
  open,
  onOpenChange,
  tripId,
  days,
  mode = "full",
  fixedDayNumber,
  existingRecNames = [],
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  tripId: string;
  days: DayLite[];
  mode?: "full" | "day" | "recs";
  fixedDayNumber?: number;
  existingRecNames?: string[];
}) {
  const qc = useQueryClient();
  const search = useServerFn(searchPlaces);
  const getPhoto = useServerFn(getPlacePhotoUrl);

  const [text, setText] = useState("");
  const [entries, setEntries] = useState<ParsedEntry[]>([]);
  const [recs, setRecs] = useState<ParsedRec[]>([]);
  const [entrySel, setEntrySel] = useState<boolean[]>([]);
  const [recSel, setRecSel] = useState<boolean[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [skipped, setSkipped] = useState(0);
  const [enrich, setEnrich] = useState(true);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"itinerary" | "recs">(mode === "recs" ? "recs" : "itinerary");

  useEffect(() => {
    if (!open) {
      setText("");
      setEntries([]);
      setRecs([]);
      setError(null);
      setSkipped(0);
      setBusy(false);
      setTab(mode === "recs" ? "recs" : "itinerary");
    }
  }, [open, mode]);

  const existing = useMemo(
    () => new Set(existingRecNames.map((n) => normalizeName(n))),
    [existingRecNames]
  );

  const dayIdByNumber = useMemo(() => {
    const m = new Map<number, string>();
    for (const d of days) m.set(d.day_number, d.id);
    return m;
  }, [days]);

  const dayLabel = (n: number) => {
    const d = days.find((x) => x.day_number === n);
    return d ? `יום ${n}${d.city_label ? ` · ${d.city_label}` : ""}` : `יום ${n}`;
  };

  function handleParse() {
    const allowed =
      mode === "day" && fixedDayNumber != null ? [fixedDayNumber] : days.map((d) => d.day_number);
    const res = parseAIResponse(text, allowed);
    setSkipped(res.skipped);
    if (res.error) {
      setError(res.error);
      setEntries([]);
      setRecs([]);
      return;
    }
    setError(null);
    const parsedEntries = mode === "recs" ? [] : res.entries;
    setEntries(parsedEntries);
    setRecs(res.recs);
    setEntrySel(parsedEntries.map(() => true));
    setRecSel(res.recs.map((r) => !existing.has(normalizeName(r.name))));
    setTab(parsedEntries.length ? "itinerary" : "recs");
  }

  const lookup: PlaceLookup = async (query) => {
    try {
      const res = await search({ data: { query } });
      const p = res.results?.[0];
      if (!p) return null;
      let photo_url: string | null = null;
      if (p.photoName) {
        const ph = await getPhoto({ data: { photoName: p.photoName, maxWidthPx: 600 } });
        photo_url = ph.url ?? null;
      }
      return {
        latitude: p.latitude,
        longitude: p.longitude,
        address: p.address ?? null,
        city: p.city ?? null,
        google_maps_url: p.google_maps_url ?? null,
        photo_url,
        rating: p.rating ?? null,
        ratingCount: p.userRatingCount ?? null,
      };
    } catch {
      return null;
    }
  };

  const selectedEntries = entries.filter((_, i) => entrySel[i]);
  const selectedRecs = recs.filter((_, i) => recSel[i]);
  const totalSelected = selectedEntries.length + selectedRecs.length;

  async function handleApply() {
    if (!totalSelected || busy) return;
    setBusy(true);
    try {
      const l = enrich ? lookup : undefined;

      // Restore point per affected day, before anything is written.
      const affectedDayIds = Array.from(
        new Set(selectedEntries.map((e) => dayIdByNumber.get(e.day_number)).filter(Boolean))
      ) as string[];
      let snapshotted = 0;
      for (const id of affectedDayIds) {
        try {
          await createDaySnapshot({ dayId: id, tripId, reason: "ai_import" });
          snapshotted++;
        } catch (err) {
          console.error("[ImportAISheet] snapshot failed", err);
        }
      }

      const addedEntries = await applyEntries(selectedEntries, dayIdByNumber, l);
      const addedRecs = await applyRecs(tripId, selectedRecs, l);

      qc.invalidateQueries({ queryKey: ["day-entries"] });
      qc.invalidateQueries({ queryKey: ["day-entries-summary"] });
      qc.invalidateQueries({ queryKey: ["day-snapshots"] });
      qc.invalidateQueries({ queryKey: ["recs"] });

      toast.success(
        `נוספו ${addedEntries} פעילויות ו-${addedRecs} המלצות`.replace(" ו-0 המלצות", "").replace("נוספו 0 פעילויות ו", "נוספו"),
        snapshotted ? { description: "נשמרה נקודת שחזור — אפשר לחזור אחורה מ'גרסאות היום'" } : undefined
      );

      onOpenChange(false);
    } catch (e) {
      console.error("[ImportAISheet] apply failed", e);
      toast.error("השמירה נכשלה");
    } finally {
      setBusy(false);
    }
  }

  const hasResults = entries.length > 0 || recs.length > 0;

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange}>
      <div className="pb-2 text-right">
        <div className="text-lg font-semibold">📥 ייבא תשובה מ-AI</div>
        <div className="text-[13px] text-muted-foreground mt-0.5">
          הדבק את כל התשובה של ChatGPT / Claude — נזהה את בלוק ה-JSON אוטומטית
        </div>

        {!hasResults && (
          <>
            <textarea
              dir="ltr"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder='{"version":1,"itinerary":[...],"recommendations":[...]}'
              className="mt-3 w-full h-44 rounded-xl bg-[color:var(--surface-2)] border border-border p-3 font-mono text-[12px] outline-none"
            />
            {error && (
              <div className="mt-2 text-[13px] text-[color:var(--accent-2)]">{error}</div>
            )}
            <button
              type="button"
              onClick={handleParse}
              disabled={!text.trim()}
              className="mt-3 w-full h-12 rounded-xl bg-[color:var(--accent)] text-white font-medium text-[14px] disabled:opacity-50"
            >
              בדוק ותצוגה מקדימה
            </button>
          </>
        )}

        {hasResults && (
          <>
            {mode !== "recs" && (
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setTab("itinerary")}
                  className={
                    "flex-1 h-9 rounded-full text-[13px] border " +
                    (tab === "itinerary"
                      ? "bg-[color:var(--accent)] text-white border-transparent"
                      : "bg-surface border-border")
                  }
                >
                  מסלול ({entries.length})
                </button>
                <button
                  type="button"
                  onClick={() => setTab("recs")}
                  className={
                    "flex-1 h-9 rounded-full text-[13px] border " +
                    (tab === "recs"
                      ? "bg-[color:var(--accent)] text-white border-transparent"
                      : "bg-surface border-border")
                  }
                >
                  המלצות ({recs.length})
                </button>
              </div>
            )}

            <div className="mt-3 max-h-[46vh] overflow-y-auto space-y-2">
              {tab === "itinerary" &&
                (entries.length === 0 ? (
                  <div className="text-[13px] text-muted-foreground py-6 text-center">
                    לא נמצאו פעילויות מסלול בתשובה
                  </div>
                ) : (
                  entries.map((e, i) => (
                    <label
                      key={`${e.day_number}-${i}`}
                      className="flex items-start gap-2.5 rounded-xl border border-border bg-card p-3"
                    >
                      <input
                        type="checkbox"
                        checked={!!entrySel[i]}
                        onChange={(ev) =>
                          setEntrySel((s) => s.map((v, j) => (j === i ? ev.target.checked : v)))
                        }
                        className="mt-1 w-4 h-4 shrink-0"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2 flex-wrap">
                          <span>{e.icon_emoji ?? defaultIcon(e.entry_type)}</span>
                          <span className="font-medium text-[14px]">{e.title}</span>
                          {e.time_of_day ? (
                            <span className="rounded-full bg-[color:var(--surface-2)] text-[11px] px-2 py-0.5">
                              {e.time_of_day}
                            </span>
                          ) : (
                            <span className="rounded-full bg-[color:var(--surface-2)] text-[11px] px-2 py-0.5 text-muted-foreground">
                              ללא שעה
                            </span>
                          )}
                        </span>
                        <span className="block text-[12px] text-muted-foreground mt-0.5">
                          {dayLabel(e.day_number)}
                          {e.location_name ? ` · ${e.location_name}` : ""}
                        </span>
                        {e.description && (
                          <span className="block text-[12px] text-muted-foreground mt-0.5 line-clamp-2">
                            💬 {e.description}
                          </span>
                        )}
                      </span>
                    </label>
                  ))
                ))}

              {tab === "recs" &&
                (recs.length === 0 ? (
                  <div className="text-[13px] text-muted-foreground py-6 text-center">
                    לא נמצאו המלצות בתשובה
                  </div>
                ) : (
                  recs.map((r, i) => {
                    const dup = existing.has(normalizeName(r.name));
                    return (
                      <label
                        key={`${r.name}-${i}`}
                        className="flex items-start gap-2.5 rounded-xl border border-border bg-card p-3"
                      >
                        <input
                          type="checkbox"
                          checked={!!recSel[i]}
                          onChange={(ev) =>
                            setRecSel((s) => s.map((v, j) => (j === i ? ev.target.checked : v)))
                          }
                          className="mt-1 w-4 h-4 shrink-0"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2 flex-wrap">
                            <span>{r.type === "food" ? "🍜" : r.type === "hotel" ? "🏨" : "⛩"}</span>
                            <span className="font-medium text-[14px]">{r.name}</span>
                            {dup && (
                              <span className="rounded-full bg-[color:var(--surface-2)] text-[11px] px-2 py-0.5">
                                כבר קיים ברשימה
                              </span>
                            )}
                          </span>
                          <span className="block text-[12px] text-muted-foreground mt-0.5">
                            {r.city ?? "ללא עיר"}
                            {r.booking_deadline ? ` · 🎟 להזמין עד ${r.booking_deadline}` : ""}
                          </span>
                          {r.notes && (
                            <span className="block text-[12px] text-muted-foreground mt-0.5 line-clamp-2">
                              💬 {r.notes}
                            </span>
                          )}
                        </span>
                      </label>
                    );
                  })
                ))}
            </div>

            {tab === "itinerary" && entries.length > 0 && (
              <div className="mt-2 text-[12px] text-muted-foreground">
                🕐 הפריטים ימוזגו למסלול הקיים לפי שעות. פריט ללא שעה יישאר אחרי הפריט שלפניו.
              </div>
            )}

            {skipped > 0 && (
              <div className="mt-2 text-[12px] text-muted-foreground">
                {skipped} פריטים דולגו (פורמט לא תקין או יום שאינו קיים)
              </div>
            )}

            <label className="mt-3 flex items-center gap-2 text-[13px]">
              <input
                type="checkbox"
                checked={enrich}
                onChange={(e) => setEnrich(e.target.checked)}
                className="w-4 h-4"
              />
              השלם מיקום, תמונה ודירוג מ-Google (איטי יותר)
            </label>

            <div className="mt-3 flex flex-col gap-2">
              <button
                type="button"
                onClick={handleApply}
                disabled={!totalSelected || busy}
                className="h-12 rounded-xl bg-[color:var(--accent)] text-white font-medium text-[14px] disabled:opacity-50"
              >
                {busy ? "מוסיף…" : `הוסף ${totalSelected} פריטים`}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEntries([]);
                  setRecs([]);
                  setError(null);
                }}
                disabled={busy}
                className="h-11 rounded-xl bg-surface border border-border text-[14px]"
              >
                חזור להדבקה
              </button>
            </div>
          </>
        )}
      </div>
    </BottomSheet>
  );
}

export default ImportAISheet;
