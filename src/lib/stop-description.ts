/**
 * The description shown at the top of the home screen's stop actions sheet: the stop's own
 * description, else its linked recommendation's notes; null when neither has visible text.
 * Pure: reads only its arguments.
 */
export function stopDescription(
  entry: { description?: string | null } | null | undefined,
  linkedRec: { notes?: string | null } | null | undefined,
): string | null {
  const own = entry?.description?.trim();
  if (own) return own;
  const fromRec = linkedRec?.notes?.trim();
  return fromRec || null;
}
