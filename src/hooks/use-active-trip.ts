import { useEffect, useState } from "react";
import { ACTIVE_TRIP_EVENT, getActiveTripId } from "@/lib/constants";

/**
 * Returns the currently-active trip id, re-rendering when it changes
 * (via setActiveTripId or another tab writing localStorage).
 */
export function useActiveTripId(): string {
  const [id, setId] = useState<string>(() => getActiveTripId());

  useEffect(() => {
    const sync = () => setId(getActiveTripId());
    window.addEventListener(ACTIVE_TRIP_EVENT, sync);
    window.addEventListener("storage", sync);
    // Sync once on mount in case the value changed between render and effect
    sync();
    return () => {
      window.removeEventListener(ACTIVE_TRIP_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return id;
}
