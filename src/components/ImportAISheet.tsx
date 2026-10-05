import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { BottomSheet } from "@/components/BottomSheet";
import { searchPlaces, getPlacePhotoUrl } from "@/lib/places.functions";
import {
  applyEntries,
  applyRecs,
  checkReplaceRun,
  classifyDayDuplicates,
  prepareDayReplace,
  prepareReplaceRows,
  replaceDayEntries,
  ReplaceTransportError,
  type ReplacePrep,
  type ReplaceRow,
  defaultIcon,
  normalizeName,
  parseAIResponse,
  type DupInfo,
  type ParsedEntry,
  type ParsedRec,
  type PlaceLookup,
} from "@/lib/ai-import";
import { createDaySnapshot, defaultSnapshotName, pruneSnapshots } from "@/hooks/use-day-snapshots";
import { generateRecsPrompt } from "@/lib/export-to-ai";
import { supabase } from "@/integrations/supabase/client";

async function fetchDayEntries(dayId: string) {
  const { data, error } = await supabase
    .from("day_entries")
    .select("title, time_of_day")
    .eq("day_id", dayId);
  if (error) throw error;
  return data ?? [];
}


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
  const [copyingPrompt, setCopyingPrompt] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);
  const [tab, setTab] = useState<"itinerary" | "recs">(mode === "recs" ? "recs" : "itinerary");
  const [dupInfo, setDupInfo] = useState<DupInfo[]>([]);
  const [loadingDay, setLoadingDay] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [applyNotice, setApplyNotice] = useState<string | null>(null);
  // Replace mode (single-day only)
  const [replaceMode, setReplaceMode] = useState(false);
  const [dayRows, setDayRows] = useState<Array<{ title: string | null; time_of_day: string | null }>>([]);
  const [confirm, setConfirm] = useState<{ prep: ReplacePrep; added: number } | null>(null);
  // One prepared attempt: same request id + same payload for any retry (no re-run of Google).
  const pendingRef = useRef<{ requestId: string; fingerprint: string; rows: ReplaceRow[] } | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [modeLoading, setModeLoading] = useState(false);
  // Bumped on every reset; late async results compare against it and bail.
  const reqRef = useRef(0);

  const isDayMode = mode === "day";
  const targetDayId = isDayMode ? days[0]?.id ?? null : null;

  function resetDupState() {
    reqRef.current++;
    setDupInfo([]);
    setLoadingDay(false);
    setLoadError(null);
    setApplyNotice(null);
    setReplaceMode(false);
    setDayRows([]);
    setConfirm(null);
    pendingRef.current = null;
    setUncertain(false);
    setModeLoading(false);
  }

  useEffect(() => {
    if (!open) {
      setText("");
      setEntries([]);
      setRecs([]);
      setError(null);
      setSkipped(0);
      setBusy(false);
      setPromptCopied(false);
      setTab(mode === "recs" ? "recs" : "itinerary");
      resetDupState();
    }
  }, [open, mode]);

  // Switching day/trip discards any preview built for the previous one.
  useEffect(() => {
    setEntries([]);
    setRecs([]);
    setError(null);
    resetDupState();
  }, [targetDayId, tripId]);

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

  async function handleParse() {
    const req = ++reqRef.current;
    setDupInfo([]);
    setApplyNotice(null);
    setLoadError(null);
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

    let dups: DupInfo[] = parsedEntries.map(() => ({ exact: null, otherTime: false }));
    if (isDayMode && targetDayId && parsedEntries.length) {
      setLoadingDay(true);
      try {
        const rows = await fetchDayEntries(targetDayId);
        if (req !== reqRef.current) return;
        setDayRows(rows);
        dups = classifyDayDuplicates(parsedEntries, rows);
      } catch (err) {
        console.error("[ImportAISheet] day load failed", err);
        if (req === reqRef.current) setLoadError("לא הצלחנו לטעון את תחנות היום לבדיקת כפילויות.");
        return;
      } finally {
        if (req === reqRef.current) setLoadingDay(false);
      }
    }

    setDupInfo(dups);
    setEntries(parsedEntries);
    setRecs(res.recs);
    setEntrySel(dups.map((d) => d.exact === null));
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

  // Any change to the selection or preview invalidates an open confirmation.
  useEffect(() => {
    if (!busy) {
      setConfirm(null);
      if (!uncertain) pendingRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entrySel, entries, enrich]);

  async function switchMode(next: boolean) {
    if (next === replaceMode || busy || !targetDayId) return;
    setApplyNotice(null);
    if (!next) {
      const d = classifyDayDuplicates(entries, dayRows);
      setReplaceMode(false);
      setDupInfo(d);
      setEntrySel(d.map((x) => x.exact === null));
      return;
    }
    const req = reqRef.current;
    setModeLoading(true);
    try {
      const prep = await prepareDayReplace(targetDayId);
      if (req !== reqRef.current) return;
      // Only stops that will survive (protected) count as existing duplicates.
      const d = classifyDayDuplicates(entries, prep.protected);
      setReplaceMode(true);
      setDupInfo(d);
      setEntrySel(d.map((x) => x.exact === null));
    } catch (err) {
      console.error("[ImportAISheet] prepare failed", err);
      if (req === reqRef.current) setApplyNotice("לא הצלחנו לבדוק את תחנות היום. נסו שוב.");
    } finally {
      if (req === reqRef.current) setModeLoading(false);
    }
  }

  async function openConfirm() {
    if (!targetDayId || busy || !selectedEntries.length) return;
    const req = reqRef.current;
    setBusy(true);
    setApplyNotice(null);
    try {
      const prep = await prepareDayReplace(targetDayId);
      if (req !== reqRef.current) return;
      const d = classifyDayDuplicates(entries, prep.protected);
      const newDup = d.map((f, i) => f.exact !== null && f.exact !== dupInfo[i]?.exact);
      setDupInfo(d);
      if (newDup.some(Boolean)) {
        setEntrySel((s) => s.map((v, i) => (newDup[i] ? false : v)));
        setApplyNotice("נמצאו כפילויות חדשות מול תחנות שנשמרות. הן בוטלו מהבחירה — בדקו ואשרו שוב.");
        return;
      }
      setConfirm({ prep, added: selectedEntries.length });
    } catch (err) {
      console.error("[ImportAISheet] prepare failed", err);
      if (req === reqRef.current) setApplyNotice("לא הצלחנו לבדוק את תחנות היום. הבחירה נשמרה — נסו שוב.");
    } finally {
      setBusy(false);
    }
  }

  function finishReplace(r: { removed: number; kept: number; added: number }) {
    qc.invalidateQueries({ queryKey: ["day-entries"] });
    qc.invalidateQueries({ queryKey: ["day-entries-summary"] });
    qc.invalidateQueries({ queryKey: ["day-snapshots"] });
    if (targetDayId) void pruneSnapshots(targetDayId).catch(() => {});
    pendingRef.current = null;
    setUncertain(false);
    toast.success(`תכנון היום הוחלף: נוספו ${r.added}, הוסרו ${r.removed}, נשמרו ${r.kept}`, {
      description: "נשמרה נקודת שחזור — אפשר לחזור אחורה מ'גרסאות היום'",
    });
    onOpenChange(false);
  }

  function handleDayChanged() {
    pendingRef.current = null;
    setUncertain(false);
    setConfirm(null);
    setReplaceMode(false);
    void switchModeFresh();
  }

  async function switchModeFresh() {
    // Re-enter replace mode against the current day state; user must confirm again.
    if (!targetDayId) return;
    try {
      const prep = await prepareDayReplace(targetDayId);
      const d = classifyDayDuplicates(entries, prep.protected);
      setReplaceMode(true);
      setDupInfo(d);
    } catch {
      /* keep notice below */
    }
    setApplyNotice("היום השתנה מאז האישור. בדקו את התצוגה ואשרו שוב.");
  }

  async function runReplace() {
    if (!targetDayId || !confirm || busy) return;
    const req = reqRef.current;
    setBusy(true);
    setApplyNotice(null);
    try {
      if (!pendingRef.current) {
        const rows = await prepareReplaceRows(selectedEntries, enrich ? lookup : undefined);
        if (req !== reqRef.current) return;
        pendingRef.current = { requestId: crypto.randomUUID(), fingerprint: confirm.prep.fingerprint, rows };
      }
      const p = pendingRef.current;
      const out = await replaceDayEntries({
        dayId: targetDayId,
        fingerprint: p.fingerprint,
        requestId: p.requestId,
        rows: p.rows,
        snapshotName: `לפני החלפת יום · ${defaultSnapshotName("manual").split(" · ")[1] ?? ""}`,
      });
      if (out.status === "done" || out.status === "already_applied") return finishReplace(out);
      if (out.status === "day_changed") return handleDayChanged();
      if (out.status === "in_progress") {
        setUncertain(true);
        setApplyNotice("ההחלפה עדיין בתהליך. בדקו סטטוס בעוד רגע.");
        return;
      }
      pendingRef.current = null;
      setConfirm(null);
      setApplyNotice("הבקשה לא תאמה ניסיון קודם. אשרו שוב.");
    } catch (err) {
      console.error("[ImportAISheet] replace failed", err);
      if (err instanceof ReplaceTransportError) {
        setUncertain(true);
        setApplyNotice("החיבור נקטע — לא ידוע אם ההחלפה בוצעה. בדקו סטטוס לפני כל פעולה.");
      } else {
        pendingRef.current = null;
        setConfirm(null);
        setApplyNotice("ההחלפה נכשלה. היום נשאר כפי שהיה.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function checkStatus() {
    const p = pendingRef.current;
    if (!targetDayId || !p || busy) return;
    setBusy(true);
    try {
      const { status: st, result } = await checkReplaceRun(targetDayId, p.requestId);
      if (st === "done") {
        return finishReplace(result ?? { added: p.rows.length, removed: 0, kept: 0 });
      }
      if (st === "day_changed") return handleDayChanged();
      setApplyNotice(
        st === "pending"
          ? "ההחלפה עדיין בתהליך. בדקו שוב בעוד רגע."
          : "ההחלפה לא בוצעה. אפשר לנסות שוב — אותה בקשה בדיוק תישלח."
      );
      if (st === "absent") setUncertain(false);
    } catch (err) {
      console.error("[ImportAISheet] status check failed", err);
      setApplyNotice("לא הצלחנו לבדוק את הסטטוס — עדיין לא ידוע אם ההחלפה בוצעה. נסו לבדוק שוב.");
    } finally {
      setBusy(false);
    }
  }

  async function handleApply() {
    if (!totalSelected || busy) return;
    setBusy(true);
    try {
      // Day mode: re-read the target day right before writing (UI guard only).
      if (isDayMode && targetDayId) {
        const req = reqRef.current;
        let rows: Array<{ title: string | null; time_of_day: string | null }>;
        try {
          rows = await fetchDayEntries(targetDayId);
        } catch (err) {
          console.error("[ImportAISheet] recheck failed", err);
          if (req === reqRef.current) setApplyNotice("לא הצלחנו לבדוק את תחנות היום. הבחירה נשמרה — נסו שוב.");
          return;
        }
        if (req !== reqRef.current) return;
        const fresh = classifyDayDuplicates(entries, rows);
        const newDup = fresh.map((f, i) => f.exact !== null && f.exact !== dupInfo[i]?.exact);
        if (newDup.some(Boolean)) {
          setDupInfo(fresh);
          setEntrySel((s) => s.map((v, i) => (newDup[i] ? false : v)));
          setApplyNotice("נמצאו כפילויות חדשות ביום מאז התצוגה המקדימה. הן בוטלו מהבחירה — בדקו ואשרו שוב.");
          return;
        }
        setDupInfo(fresh);
      }
      setApplyNotice(null);
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

  async function handleCopyPrompt() {
    if (copyingPrompt) return;
    setCopyingPrompt(true);
    try {
      const prompt = await generateRecsPrompt(tripId);
      await navigator.clipboard.writeText(prompt);
      setPromptCopied(true);
      toast.success("הבקשה הועתקה");
    } catch (e) {
      console.error("[ImportAISheet] copy prompt failed", e);
      toast.error("ההעתקה נכשלה");
    } finally {
      setCopyingPrompt(false);
    }
  }

  const hasResults = entries.length > 0 || recs.length > 0;

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange}>
      <div className="pb-2 text-right">
        {mode === "recs" ? (
          <>
            <div className="text-lg font-semibold">המלצות בעזרת ChatGPT / Claude</div>
            <div className="text-[13px] text-muted-foreground mt-0.5">
              העתיקו את הבקשה לשירות ה־AI שלכם וחזרו לכאן עם התשובה. המקומות יישמרו בהמלצות; תוכלו להוסיף אותם למסלול בהמשך
            </div>
          </>
        ) : (
          <>
            <div className="text-lg font-semibold">📥 ייבא תשובה מ-AI</div>
            <div className="text-[13px] text-muted-foreground mt-0.5">
              הדבק את כל התשובה של ChatGPT / Claude — נזהה את בלוק ה-JSON אוטומטית
            </div>
          </>
        )}

        {!hasResults && (
          <>
            {mode === "recs" && (
              <>
                <div className="mt-4 text-[14px] font-medium">1. העתיקו בקשה ל־ChatGPT / Claude</div>
                <button
                  type="button"
                  onClick={handleCopyPrompt}
                  disabled={copyingPrompt}
                  className="mt-2 w-full h-12 rounded-xl border border-border bg-card font-medium text-[14px] disabled:opacity-50"
                >
                  {copyingPrompt ? "מכין בקשה…" : promptCopied ? "✅ הועתק — אפשר להעתיק שוב" : "📋 העתק בקשה מוכנה"}
                </button>
                <div className="mt-4 text-[14px] font-medium">2. הדביקו את התשובה שקיבלתם</div>
              </>
            )}
            <textarea
              dir="ltr"
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                resetDupState();
              }}
              placeholder={mode === "recs" ? "הדביקו כאן את כל התשובה" : '{"version":1,"itinerary":[...],"recommendations":[...]}'}
              aria-label={mode === "recs" ? "התשובה שקיבלתם" : undefined}
              className={(mode === "recs" ? "mt-2" : "mt-3") + " w-full h-44 rounded-xl bg-[color:var(--surface-2)] border border-border p-3 text-[12px] outline-none" + (mode === "recs" ? "" : " font-mono")}
            />
            {error && (
              <div className="mt-2 text-[13px] text-[color:var(--accent-2)]">{error}</div>
            )}
            {loadError && (
              <div role="alert" className="mt-2 text-[13px] text-[color:var(--accent-2)]">{loadError}</div>
            )}
            <button
              type="button"
              onClick={handleParse}
              disabled={!text.trim() || loadingDay}
              className="mt-3 w-full h-12 rounded-xl bg-[color:var(--accent)] text-white font-medium text-[14px] disabled:opacity-50"
            >
              {loadingDay ? "בודק את תחנות היום…" : loadError ? "נסה שוב" : "בדוק ותצוגה מקדימה"}
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

            {isDayMode && entries.length > 0 && (
              <div className="mt-4">
                <div className="text-[14px] font-medium">איך לשלב את התכנון החדש ביום הזה?</div>
                <div
                  className="mt-2 flex flex-col gap-2 sm:flex-row"
                  role="radiogroup"
                  aria-label="אופן הייבוא"
                >
                  {([false, true] as const).map((v) => {
                    const selected = replaceMode === v;
                    return (
                      <button
                        key={String(v)}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        disabled={busy || modeLoading || uncertain}
                        onClick={() => void switchMode(v)}
                        className={
                          "flex min-h-11 flex-1 items-start gap-2.5 rounded-xl border p-3 text-right disabled:opacity-60 " +
                          (selected
                            ? "border-[color:var(--accent)] bg-[color:var(--surface-2)]"
                            : "border-border bg-surface")
                        }
                      >
                        <span
                          aria-hidden="true"
                          className={
                            "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border " +
                            (selected
                              ? "border-[color:var(--accent)] bg-[color:var(--accent)] text-[color:var(--accent-foreground)]"
                              : "border-border-strong")
                          }
                        >
                          {selected && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium text-[14px]">
                            {v ? "החלפת התכנון" : "הוספת תחנות"}
                          </span>
                          <span className="mt-0.5 block text-[12px] leading-relaxed text-muted-foreground">
                            {v
                              ? "התחנות שתבחרו יחליפו את התכנון הקיים. תחנות מלון ותחנות המקושרות להמלצות שסומנו כמוזמנות יישמרו."
                              : "התכנון הקיים נשאר. נוסיף אליו את התחנות שתבחרו."}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
                {replaceMode && (
                  <div className="mt-2 text-[12px] text-muted-foreground">
                    בחרו את כל התחנות שתרצו בתכנון המעודכן, לא רק את השינויים.
                  </div>
                )}
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
                        {dupInfo[i]?.exact && (
                          <span className="block text-[12px] font-medium text-[color:var(--accent-2)] mt-0.5">
                            {dupInfo[i]!.exact === "existing"
                              ? replaceMode ? "כבר קיים בתחנה שנשמרת" : "כבר קיים ביום"
                              : "מופיע פעמיים בייבוא"}
                          </span>
                        )}
                        {dupInfo[i]?.otherTime && (
                          <span className="block text-[12px] text-muted-foreground mt-0.5">
                            ⚠️ שם זהה קיים בשעה אחרת
                          </span>
                        )}
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

            {isDayMode ? (
              <label className="mt-3 flex items-start gap-2.5 rounded-xl border border-border bg-surface p-3 text-[13px]">
                <input
                  type="checkbox"
                  checked={enrich}
                  onChange={(e) => setEnrich(e.target.checked)}
                  className="mt-1 w-4 h-4 shrink-0"
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-[14px]">השלמת פרטי מקומות מ־Google</span>
                  <span className="mt-0.5 block text-[12px] text-muted-foreground">
                    הוספת מיקום, תמונה ודירוג כשניתן — עשוי להאריך את הייבוא.
                  </span>
                </span>
              </label>
            ) : (
              <label className="mt-3 flex items-center gap-2 text-[13px]">
                <input
                  type="checkbox"
                  checked={enrich}
                  onChange={(e) => setEnrich(e.target.checked)}
                  className="w-4 h-4"
                />
                השלם מיקום, תמונה ודירוג מ-Google (איטי יותר)
              </label>
            )}

            <div className="mt-3 flex flex-col gap-2">
              {applyNotice && (
                <div role="alert" className="text-[13px] text-[color:var(--accent-2)]">{applyNotice}</div>
              )}
              {replaceMode && recs.length > 0 && (
                <div className="text-[12px] text-muted-foreground">במצב החלפה רק תחנות היום מוחלפות — המלצות לא ייובאו.</div>
              )}
              {replaceMode && confirm && (
                <div className="rounded-xl border border-border bg-[color:var(--surface-2)] p-3 text-[13px] space-y-1">
                  <div className="font-medium">
                    {dayLabel(fixedDayNumber ?? days[0]?.day_number ?? 0)} · {days[0]?.date}
                  </div>
                  <div>
                    יוסרו {confirm.prep.remove_count} · יישמרו {confirm.prep.keep_count} · יתווספו {confirm.added}
                  </div>
                  <div className="text-[12px] text-muted-foreground">
                    לפני ההחלפה יישמר גיבוי שאפשר לשחזר דרך ׳גרסאות היום׳.
                  </div>
                  {confirm.prep.protected.length > 0 && (
                    <ul className="text-[12px] text-muted-foreground">
                      {confirm.prep.protected.map((p) => (
                        <li key={p.id}>
                          {p.reason === "hotel" ? "🏨 נשמר (מלון)" : "🎟 נשמר (הוזמן)"}: {p.title}
                          {p.time_of_day ? ` · ${p.time_of_day}` : ""}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              {replaceMode ? (
                uncertain ? (
                  <button
                    type="button"
                    onClick={() => void checkStatus()}
                    disabled={busy}
                    className="h-12 rounded-xl bg-[color:var(--accent)] text-white font-medium text-[14px] disabled:opacity-50"
                  >
                    {busy ? "בודק…" : "בדוק סטטוס"}
                  </button>
                ) : confirm ? (
                  <button
                    type="button"
                    onClick={() => void runReplace()}
                    disabled={busy || !selectedEntries.length}
                    className="h-12 rounded-xl bg-[color:var(--accent-2)] text-white font-medium text-[14px] disabled:opacity-50"
                  >
                    {busy ? "מחליף…" : "אשר והחלף את התכנון"}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void openConfirm()}
                    disabled={busy || !selectedEntries.length}
                    className="h-12 rounded-xl bg-[color:var(--accent)] text-white font-medium text-[14px] disabled:opacity-50"
                  >
                    {busy ? "בודק…" : "בדיקת החלפת היום"}
                  </button>
                )
              ) : (
              <button
                type="button"
                onClick={handleApply}
                disabled={!totalSelected || busy}
                className="h-12 rounded-xl bg-[color:var(--accent)] text-white font-medium text-[14px] disabled:opacity-50"
              >
                {busy
                  ? "מוסיף…"
                  : isDayMode
                    ? `הוסף ${totalSelected} תחנות ליום הקיים`
                    : `הוסף ${totalSelected} פריטים`}
              </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setEntries([]);
                  setRecs([]);
                  setError(null);
                  resetDupState();
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
