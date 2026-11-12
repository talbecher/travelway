// Free-text search over document metadata. Pure and framework-free so it runs under `bun test`.
// Never looks inside file contents — only the fields the user typed or the file's visible name.

/** Final Hebrew letters folded to their base form, so "מסמך" also matches "מסמכים". */
const FINAL_LETTERS: Record<string, string> = {
  ך: "כ",
  ם: "מ",
  ן: "נ",
  ף: "פ",
  ץ: "צ",
};

/** Opaque storage ids (e.g. "9f8e7d6c5b4a39281706.pdf") carry no meaning for a human searching. */
const OPAQUE_FILE_NAME = /^[0-9a-f-]{20,}\.[a-z0-9]+$/i;

export type DocSearchFields = {
  title?: string | null;
  notes?: string | null;
  file_path?: string | null;
  file_url?: string | null;
};

/**
 * Treat hyphens as word separators, drop combining marks (Hebrew niqqud, Latin accents), lowercase,
 * fold final Hebrew letters, collapse whitespace. Applied to both the query and the text, so both
 * sides match in the same shape and "תל־אביב" and "תל אביב" find each other either way round.
 *
 * Hyphens are replaced first, on purpose: the Hebrew maqaf (U+05BE) sits inside the U+0591-U+05C7
 * Hebrew block, so a mark-stripping rule written as that range would otherwise delete it and glue
 * the two words together.
 */
export function normalizeText(s: string | null | undefined): string {
  return (s ?? "")
    .replace(/[-־]/g, " ")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[ךםןףץ]/g, (c) => FINAL_LETTERS[c] ?? c)
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Human-readable name of an attached file, or null when there is none or it is an opaque storage id.
 * Null rather than a placeholder: otherwise every document with an attachment would match the
 * placeholder's words.
 */
export function fileBasename(filePath?: string | null, fileUrl?: string | null): string | null {
  const raw = filePath ?? fileUrl ?? "";
  const base = raw.split("?")[0].split("/").pop() ?? "";
  if (!base || OPAQUE_FILE_NAME.test(base)) return null;
  try {
    return decodeURIComponent(base);
  } catch {
    return base;
  }
}

/**
 * Every whitespace-separated token must appear in at least one field (substring, case-insensitive).
 * Tokens may land in different fields and in any order. An empty query matches everything.
 */
export function matchesQuery(fields: Array<string | null | undefined>, q: string): boolean {
  const query = normalizeText(q);
  if (!query) return true;
  const hay = normalizeText(fields.filter(Boolean).join(" \n "));
  return query.split(" ").every((t) => hay.includes(t));
}

/**
 * Document match over title, notes and the attached file's name.
 * `extraTerms` carries the caller's Hebrew type label and synonyms, so this module stays free of UI copy.
 */
export function docMatchesQuery(
  doc: DocSearchFields,
  q: string,
  extraTerms?: string | null,
): boolean {
  return matchesQuery(
    [doc.title, doc.notes, fileBasename(doc.file_path, doc.file_url), extraTerms],
    q,
  );
}
