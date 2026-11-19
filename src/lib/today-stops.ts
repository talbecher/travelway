export type TodayStopInput = {
  id: string;
  time_of_day: string | null;
  display_order?: number | null;
};

export type TodayStop<T> = { entry: T; position: number; past: boolean };

/**
 * All of today's stops in itinerary order (display_order; ties keep the loaded order).
 * A timed stop is "past" once its time has been reached, except the latest reached one,
 * which is the current activity (same rule as the Live Now card). Untimed stops are never past.
 * Nothing is hidden or reordered by time.
 */
export function todayStopsTimeline<T extends TodayStopInput>(
  entries: T[],
  currentHHMM: string,
): TodayStop<T>[] {
  const ordered = entries
    .map((entry, index) => ({ entry, index }))
    .sort(
      (a, b) => (a.entry.display_order ?? 0) - (b.entry.display_order ?? 0) || a.index - b.index,
    )
    .map(({ entry }) => entry);
  const hhmm = (e: T) => (e.time_of_day ?? "").slice(0, 5);
  const timed = ordered
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry.time_of_day)
    .sort((a, b) => hhmm(a.entry).localeCompare(hhmm(b.entry)) || a.index - b.index);
  const reached =
    [...timed].reverse().find(({ entry }) => hhmm(entry) <= currentHHMM)?.entry ?? null;
  return ordered.map((entry, position) => ({
    entry,
    position,
    past: !!entry.time_of_day && hhmm(entry) <= currentHHMM && entry !== reached,
  }));
}
