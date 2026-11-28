import { useEffect, useState } from "react";
import { dateKeyInTimeZone, TRIP_TIME_ZONE } from "@/lib/documents-by-date";

const CHECK_MS = 60_000;

/**
 * Today's date (YYYY-MM-DD) on the trip's clock (Asia/Tokyo), not the device's or UTC.
 * Re-checked every minute and when the page becomes visible, so it rolls over at Tokyo midnight.
 */
export function useTripTodayKey(timeZone: string = TRIP_TIME_ZONE): string {
  const [key, setKey] = useState(() => dateKeyInTimeZone(new Date(), timeZone));
  useEffect(() => {
    const check = () => setKey(dateKeyInTimeZone(new Date(), timeZone));
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    check();
    const timer = setInterval(check, CHECK_MS);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [timeZone]);
  return key;
}
