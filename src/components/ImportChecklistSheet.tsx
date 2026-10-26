import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { BottomSheet, BottomSheetFooter } from "@/components/BottomSheet";
import { supabase } from "@/integrations/supabase/client";
import { assertOnline } from "@/hooks/use-online";
import { useActiveTripId } from "@/hooks/use-active-trip";
import { useBulkAddItems } from "@/hooks/use-checklist";
import { useTrip } from "@/hooks/use-trip";
import { PRIORITY_LABEL, categoryMeta } from "@/lib/checklist-templates";
import {
  CHECKLIST_IMPORT_EXAMPLE,
  buildChecklistPrompt,
  classifyChecklistDuplicates,
  defaultChecklistSelection,
  parseChecklistImport,
  type ChecklistImportRow,
} from "@/lib/checklist-import";


type Existing = { titles: string[]; count: number };

export function ImportChecklistSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const tripId = useActiveTripId();
  const bulkAdd = useBulkAddItems();
  const { data: trip } = useTrip();
  // Bumped on every open, close and trip change; async results from an older value are ignored.
  const sessionRef = useRef(0);

  const [raw, setRaw] = useState("");
  const [rows, setRows] = useState<ChecklistImportRow[] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [existing, setExisting] = useState<Existing | null>(null);
  const [loadState, setLoadState] = useState<"idle" | "loading" | "error">("idle");
  const [saving, setSaving] = useState(false);

  function reset() {
    sessionRef.current += 1;
    setRaw("");
    setRows(null);
    setParseError(null);
    setSelected(new Set());
    setExisting(null);
    setLoadState("idle");
    setSaving(false);
  }

  useEffect(() => {
    reset();
    if (open) void loadExisting();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tripId]);

  async function loadExisting() {
    const session = sessionRef.current;
    if (!tripId) return;
    setLoadState("loading");
    const { data, error } = await supabase.from("checklist_items").select("title").eq("trip_id", tripId);
    if (session !== sessionRef.current) return;
    if (error) {
      setLoadState("error");
      return;
    }
    setExisting({ titles: (data ?? []).map((d) => d.title), count: data?.length ?? 0 });
    setLoadState("idle");
  }

  const dups = useMemo(
    () => (rows && existing ? classifyChecklistDuplicates(rows, existing.titles) : []),
    [rows, existing],
  );

  function preview() {
    if (!existing) return;
    const r = parseChecklistImport(raw);
    setParseError(r.error ?? null);
    setRows(r.error ? null : r.rows);
    setSelected(r.error ? new Set() : defaultChecklistSelection(r.rows, classifyChecklistDuplicates(r.rows, existing.titles)));
  }

  function toggle(i: number) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });
  }

  const chosen = (rows ?? []).filter((r) => !r.errors.length && selected.has(r.index));

  async function save() {
    if (saving || !chosen.length || !existing) return;
    if (!assertOnline()) return;
    const session = sessionRef.current;
    setSaving(true);
    try {
      await bulkAdd.mutateAsync(
        chosen.map((r, i) => ({
          title: r.title,
          category: r.category,
          priority: r.priority,
          notes: r.notes,
          due_date: r.due_date,
          display_order: existing.count + i,
        })),
      );
      if (session !== sessionRef.current) return;
      toast.success(`נוספו ${chosen.length} משימות`);
      onOpenChange(false);
    } catch (e) {
      if (session !== sessionRef.current) return;
      toast.error(e instanceof Error ? e.message : "השמירה נכשלה");
      setSaving(false);
    }
  }

  return (
    <BottomSheet open={open} onOpenChange={(o) => !saving && onOpenChange(o)} title="ייבוא משימות מ-AI">
      <div className="space-y-3 pb-2">
        {loadState === "loading" && <div className="text-sm text-muted-foreground">טוען את הצ׳קליסט הקיים…</div>}
        {loadState === "error" && (
          <div className="rounded-xl border border-destructive/40 p-3 text-sm">
            <div className="text-destructive">לא הצלחנו לטעון את המשימות הקיימות.</div>
            <button type="button" onClick={() => void loadExisting()} className="mt-2 h-11 px-4 rounded-xl border border-border">
              נסו שוב
            </button>
          </div>
        )}

        {!rows && (
          <>
            <details className="rounded-xl border border-border bg-surface p-3 text-[13px]">
              <summary className="cursor-pointer font-medium min-h-11 flex items-center">מה לבקש מהצ׳אט?</summary>
              <p className="mt-1 text-muted-foreground">
                העתיקו את הבקשה המוכנה לצ׳אט, ואז הדביקו כאן את התשובה. רק title חובה.
              </p>
              <button
                type="button"
                onClick={() =>
                  void navigator.clipboard
                    ?.writeText(buildChecklistPrompt(trip))
                    .then(() => toast.success("הבקשה הועתקה"))
                    .catch(() => toast.error("ההעתקה נכשלה"))
                }
                className="mt-2 h-11 px-4 rounded-xl bg-[color:var(--accent)] text-[color:var(--accent-foreground)] font-medium"
              >
                העתק בקשה ל־AI
              </button>
              <pre dir="ltr" className="mt-2 overflow-x-auto rounded-lg bg-muted p-2 text-[11px]">{CHECKLIST_IMPORT_EXAMPLE}</pre>
              <button
                type="button"
                onClick={() => void navigator.clipboard?.writeText(CHECKLIST_IMPORT_EXAMPLE).then(() => toast.success("הדוגמה הועתקה"))}
                className="mt-2 ms-2 h-11 px-4 rounded-xl border border-border"
              >
                העתק דוגמה
              </button>
            </details>
            <textarea
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              dir="ltr"
              rows={8}
              placeholder="הדביקו כאן את תשובת הצ׳אט"
              className="w-full rounded-xl border border-border bg-background p-3 text-[13px]"
            />
            {parseError && <div className="text-sm text-destructive">{parseError}</div>}
          </>
        )}

        {rows && (
          <>
            <button type="button" onClick={() => setRows(null)} className="h-11 text-sm text-muted-foreground">
              ← חזרה לעריכת הטקסט
            </button>
            <ul className="space-y-2">
              {rows.map((r, i) => {
                const invalid = r.errors.length > 0;
                const cat = categoryMeta(r.category);
                return (
                  <li key={r.index}>
                    <label className={"flex items-start gap-3 rounded-xl border border-border p-3 min-h-11 " + (invalid ? "opacity-70" : "")}>
                      <input
                        type="checkbox"
                        className="mt-1 h-5 w-5 shrink-0"
                        disabled={invalid || saving}
                        checked={!invalid && selected.has(r.index)}
                        onChange={() => toggle(r.index)}
                      />
                      <span className="min-w-0 flex-1 text-[14px]">
                        <span className="block font-medium">{r.title || "(ללא כותרת)"}</span>
                        <span className="block text-[12px] text-muted-foreground">
                          {cat.emoji} {cat.label} · עדיפות {PRIORITY_LABEL[r.priority] ?? r.priority}
                          {r.due_date ? ` · עד ${r.due_date}` : ""}
                        </span>
                        {r.categoryNote && <span className="block text-[12px] text-muted-foreground">{r.categoryNote}</span>}
                        {r.notes && <span className="block text-[12px] text-muted-foreground">{r.notes}</span>}
                        {dups[i] === "existing" && <span className="block text-[12px] text-[color:var(--accent)]">כבר קיימת</span>}
                        {dups[i] === "in_import" && <span className="block text-[12px] text-[color:var(--accent)]">מופיעה פעמיים בייבוא</span>}
                        {r.errors.map((e) => (
                          <span key={e} className="block text-[12px] text-destructive">{e} — לא תישמר</span>
                        ))}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>

      <BottomSheetFooter>
        {rows ? (
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || !chosen.length}
            className="h-12 w-full rounded-xl bg-[color:var(--accent)] text-[color:var(--accent-foreground)] font-medium disabled:opacity-50"
          >
            {saving ? "מוסיף…" : `הוסף ${chosen.length} משימות`}
          </button>
        ) : (
          <button
            type="button"
            onClick={preview}
            disabled={!raw.trim() || !existing}
            className="h-12 w-full rounded-xl bg-[color:var(--accent)] text-[color:var(--accent-foreground)] font-medium disabled:opacity-50"
          >
            תצוגה מקדימה
          </button>
        )}
      </BottomSheetFooter>
    </BottomSheet>
  );
}
