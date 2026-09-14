import { useCallback, useEffect, useState } from "react";

/**
 * Recommendation ids created through Discover during the current browser
 * session. Session-scoped only — nothing is written to the database.
 */
const EVENT = "discover-recent-changed";

function storageKey(userId: string, tripId: string): string {
  return `discover:recent:${userId}:${tripId}`;
}

export function readRecentDiscoverIds(userId?: string | null, tripId?: string | null): string[] {
  if (typeof window === "undefined" || !userId || !tripId) return [];
  try {
    const raw = window.sessionStorage.getItem(storageKey(userId, tripId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

export function addRecentDiscoverIds(
  userId: string | null | undefined,
  tripId: string | null | undefined,
  ids: string[],
): void {
  if (typeof window === "undefined" || !userId || !tripId || ids.length === 0) return;
  const next = Array.from(new Set([...readRecentDiscoverIds(userId, tripId), ...ids]));
  try {
    window.sessionStorage.setItem(storageKey(userId, tripId), JSON.stringify(next));
  } catch {
    /* storage unavailable — the badge is a convenience only */
  }
  window.dispatchEvent(new CustomEvent(EVENT));
}

/** Live list of recommendation ids created through Discover this session. */
export function useRecentDiscoverIds(
  userId: string | null | undefined,
  tripId: string | null | undefined,
): string[] {
  const [ids, setIds] = useState<string[]>([]);

  const refresh = useCallback(() => {
    setIds(readRecentDiscoverIds(userId, tripId));
  }, [userId, tripId]);

  useEffect(() => {
    refresh();
    if (typeof window === "undefined") return;
    window.addEventListener(EVENT, refresh);
    return () => window.removeEventListener(EVENT, refresh);
  }, [refresh]);

  return ids;
}
