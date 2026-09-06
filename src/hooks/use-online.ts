import { useEffect, useState } from "react";
import { toast } from "sonner";

/** Reactive online/offline state (always `true` during SSR). */
export function useOnline(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  return online;
}

export function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

/** Proactive guard: shows a toast and returns `false` when offline. */
export function assertOnline(): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    toast.error("אין חיבור לאינטרנט", {
      description: "צריך חיבור כדי לשמור",
    });
    return false;
  }
  return true;
}
