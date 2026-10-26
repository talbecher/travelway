import { extractJsonBlock, normalizeEntryName } from "@/lib/ai-import";
import { CHECKLIST_CATEGORIES, type ChecklistPriority } from "@/lib/checklist-templates";

export const CHECKLIST_PRIORITIES: ChecklistPriority[] = ["high", "normal", "low"];
const CATEGORY_IDS = CHECKLIST_CATEGORIES.map((c) => c.id);

export const CHECKLIST_IMPORT_EXAMPLE = `{
  "version": 1,
  "checklist": [
    { "title": "להזמין eSIM", "category": "tech", "priority": "high", "due_date": "2026-11-20", "notes": "לבדוק תמיכה בטלפון" },
    { "title": "מתאם חשמל", "category": "packing" }
  ]
}`;

export type ChecklistImportRow = {
  index: number;
  title: string;
  category: string;
  priority: ChecklistPriority;
  due_date: string | null;
  notes: string | null;
  errors: string[];
};

export type ChecklistParseResult = { rows: ChecklistImportRow[]; error?: string };

function str(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v !== "string" && typeof v !== "number") return null;
  const s = String(v).trim();
  return s ? s : null;
}

export function isValidIsoDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const y = +m[1], mo = +m[2], d = +m[3];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

export function parseChecklistImport(raw: string): ChecklistParseResult {
  const block = extractJsonBlock(raw);
  if (!block) return { rows: [], error: "לא נמצא בלוק JSON תקין בטקסט שהודבק" };
  let json: unknown;
  try {
    json = JSON.parse(block);
  } catch {
    return { rows: [], error: "ה-JSON שהודבק אינו תקין" };
  }
  const list = (json as { checklist?: unknown })?.checklist;
  if (!Array.isArray(list)) return { rows: [], error: "חסר מערך checklist ב-JSON" };
  if (!list.length) return { rows: [], error: "לא נמצאו משימות ב-JSON" };

  const rows = list.map((item, index): ChecklistImportRow => {
    const errors: string[] = [];
    const o = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    if (!item || typeof item !== "object") errors.push("הפריט אינו אובייקט");

    const title = str(o.title) ?? "";
    if (!title) errors.push("חסרה כותרת");
    else if (title.length > 200) errors.push("כותרת ארוכה מ-200 תווים");

    const catRaw = str(o.category);
    const category = catRaw ?? "other";
    if (catRaw && !CATEGORY_IDS.includes(catRaw)) errors.push(`קטגוריה לא מוכרת: ${catRaw}`);

    const priRaw = str(o.priority);
    const priority = (priRaw ?? "normal") as ChecklistPriority;
    if (priRaw && !CHECKLIST_PRIORITIES.includes(priRaw as ChecklistPriority))
      errors.push(`עדיפות לא מוכרת: ${priRaw}`);

    const dueRaw = str(o.due_date);
    if (dueRaw && !isValidIsoDate(dueRaw)) errors.push(`תאריך לא תקין: ${dueRaw} (נדרש YYYY-MM-DD)`);

    return {
      index,
      title,
      category,
      priority,
      due_date: dueRaw,
      notes: str(o.notes),
      errors,
    };
  });
  return { rows };
}

export type ChecklistDup = "existing" | "in_import" | null;

/** Classifies each row against all trip tasks (done included) and earlier rows. */
export function classifyChecklistDuplicates(
  rows: { title: string }[],
  existingTitles: string[],
): ChecklistDup[] {
  const existing = new Set(existingTitles.map(normalizeEntryName).filter(Boolean));
  const seen = new Set<string>();
  return rows.map((r) => {
    const n = normalizeEntryName(r.title);
    let d: ChecklistDup = null;
    if (n && existing.has(n)) d = "existing";
    else if (n && seen.has(n)) d = "in_import";
    if (n) seen.add(n);
    return d;
  });
}

/** Default selection: valid rows that are not duplicates. */
export function defaultChecklistSelection(rows: ChecklistImportRow[], dups: ChecklistDup[]): Set<number> {
  const s = new Set<number>();
  rows.forEach((r, i) => {
    if (!r.errors.length && !dups[i]) s.add(r.index);
  });
  return s;
}
