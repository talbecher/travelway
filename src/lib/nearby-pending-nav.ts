/**
 * "Did we get there?" memory for the home "near you" card: the last place the user tapped
 * "נווט" for, kept in localStorage as {recId, ts}. Pure rules first, then thin storage wrappers
 * that never throw (navigation must not depend on storage working).
 */

export type PendingNav = { recId: string; ts: number };

export const PENDING_NAV_KEY = "travelway:nearby-pending-nav";
/** A navigation older than this no longer marks its card. */
export const PENDING_NAV_TTL_MS = 3 * 60 * 60 * 1000;

/** Parses the stored value; anything malformed is treated as no pending navigation. */
export function parsePendingNav(raw: string | null | undefined): PendingNav | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as unknown;
    if (!v || typeof v !== "object") return null;
    const { recId, ts } = v as { recId?: unknown; ts?: unknown };
    if (typeof recId !== "string" || !recId) return null;
    if (typeof ts !== "number" || !Number.isFinite(ts)) return null;
    return { recId, ts };
  } catch {
    return null;
  }
}

/** Live = recorded in the last 3 hours (a timestamp in the future is a bad clock, not live). */
export function isPendingNavLive(nav: PendingNav | null, now: number): nav is PendingNav {
  if (!nav) return false;
  const age = now - nav.ts;
  return age >= 0 && age < PENDING_NAV_TTL_MS;
}

/**
 * Which card gets the "ניווטתם לכאן" mark: the pending place, only while live, only while it is
 * still a saved place and not yet visited. Otherwise null.
 */
export function pendingNavHighlightId(
  nav: PendingNav | null,
  now: number,
  statusOf: (recId: string) => string | null | undefined,
): string | null {
  if (!isPendingNavLive(nav, now)) return null;
  const status = statusOf(nav.recId);
  if (status == null || status === "visited") return null;
  return nav.recId;
}

/** The stored value should be dropped: expired, unreadable target, or already visited. */
export function shouldClearPendingNav(
  nav: PendingNav | null,
  now: number,
  statusOf: (recId: string) => string | null | undefined,
): boolean {
  if (!nav) return false;
  if (!isPendingNavLive(nav, now)) return true;
  return statusOf(nav.recId) === "visited";
}

/**
 * Puts the highlighted place first and keeps the rest in their distance order, then cuts to
 * `limit`. `ranked` is the full distance-sorted list, so a navigated place just outside the top
 * rows still surfaces. Without a highlight this is a plain `slice(0, limit)`.
 */
export function promotePendingNav<T extends { rec: { id: string } }>(
  ranked: T[],
  highlightId: string | null,
  limit: number,
): T[] {
  const i = highlightId ? ranked.findIndex((x) => x.rec.id === highlightId) : -1;
  if (i <= 0) return ranked.slice(0, limit);
  return [ranked[i], ...ranked.slice(0, i), ...ranked.slice(i + 1)].slice(0, limit);
}

export function readPendingNav(): PendingNav | null {
  try {
    return parsePendingNav(localStorage.getItem(PENDING_NAV_KEY));
  } catch {
    return null;
  }
}

/** A new navigation replaces the previous one. */
export function writePendingNav(nav: PendingNav): void {
  try {
    localStorage.setItem(PENDING_NAV_KEY, JSON.stringify(nav));
  } catch {
    /* storage unavailable: navigation still proceeds */
  }
}

export function clearPendingNav(): void {
  try {
    localStorage.removeItem(PENDING_NAV_KEY);
  } catch {
    /* ignore */
  }
}
