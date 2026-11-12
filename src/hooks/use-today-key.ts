import { useEffect, useState } from "react";
import { todayLocal } from "@/lib/format";

const CHECK_MS = 60_000;

/**
 * Calls onChange with the device-local date (YYYY-MM-DD) whenever it differs from `initial`:
 * once right away, every minute, and when the page becomes visible again (a phone resuming
 * the app after midnight). Returns a cleanup that stops the interval and the listener.
 */
export function subscribeTodayKey(initial: string, onChange: (key: string) => void): () => void {
  let last = initial;
  const check = () => {
    const next = todayLocal();
    if (next !== last) {
      last = next;
      onChange(next);
    }
  };
  const onVisible = () => {
    if (document.visibilityState === "visible") check();
  };
  check();
  const timer = setInterval(check, CHECK_MS);
  const hasDocument = typeof document !== "undefined";
  if (hasDocument) document.addEventListener("visibilitychange", onVisible);
  return () => {
    clearInterval(timer);
    if (hasDocument) document.removeEventListener("visibilitychange", onVisible);
  };
}

/** Device-local "today" that changes at midnight even while the screen stays open. */
export function useTodayKey(): string {
  const [key, setKey] = useState(todayLocal);
  useEffect(() => subscribeTodayKey(key, setKey), []); // eslint-disable-line react-hooks/exhaustive-deps
  return key;
}
