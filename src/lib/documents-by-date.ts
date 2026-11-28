/**
 * "Today's documents": which trip documents fall on a given calendar day of the trip.
 * Pure (no React, no Supabase) so it is unit-testable. "Today" is the trip's local calendar day,
 * never the UTC date: a traveler in Tokyo at 08:00 is already on the next UTC-calendar day's
 * morning, and at 01:00 UTC it is still "yesterday" in UTC terms but morning in Tokyo.
 */

/** Trips have no stored time zone yet; the app's trips are in Japan. */
export const TRIP_TIME_ZONE = "Asia/Tokyo";

export type DocDateFilter = "today" | "tomorrow" | "all";

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** Calendar date (YYYY-MM-DD) of `now` in `timeZone`. */
export function dateKeyInTimeZone(now: Date, timeZone: string = TRIP_TIME_ZONE): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** `key` (YYYY-MM-DD) plus `days` calendar days. Calendar arithmetic only, no time zone involved. */
export function addDaysToKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

/** The document's calendar day, or null when it has none (or an unparseable value). */
export function docDateKey(validDate: string | null | undefined): string | null {
  const v = (validDate ?? "").trim().slice(0, 10);
  return DATE_KEY.test(v) ? v : null;
}

/** The calendar day a filter selects, relative to `todayKey`; null for "all". */
export function filterDateKey(filter: DocDateFilter, todayKey: string): string | null {
  if (filter === "today") return todayKey;
  if (filter === "tomorrow") return addDaysToKey(todayKey, 1);
  return null;
}

/** Documents dated exactly `dateKey`, in their original order. */
export function documentsOnDate<T extends { valid_date: string | null }>(docs: readonly T[], dateKey: string): T[] {
  return docs.filter((d) => docDateKey(d.valid_date) === dateKey);
}

/** Applies a today / tomorrow / all filter; "all" returns every document unchanged. */
export function filterDocumentsByDate<T extends { valid_date: string | null }>(
  docs: readonly T[],
  filter: DocDateFilter,
  todayKey: string,
): T[] {
  const key = filterDateKey(filter, todayKey);
  return key ? documentsOnDate(docs, key) : [...docs];
}
