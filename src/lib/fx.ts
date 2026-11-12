// Live FX with sessionStorage cache. Fallback to manual rate from settings.
// If the provider cannot be reached, the last table that loaded successfully (localStorage)
// is returned with stale: true. A stale table is for display and the converter only:
// it is never written to the 6-hour cache, so a live table replaces it as soon as the network is back.
export type Rates = {
  base: string;
  rates: Record<string, number>;
  date: string;
  /** true when this is the last successful table, served because the live request failed. */
  stale?: boolean;
};

const CACHE_KEY = "fx-rates-ils-v1";
const LAST_GOOD_KEY = "fx-last-good-ils-v1";
const TTL = 6 * 60 * 60 * 1000;

function isRates(v: unknown): v is Rates {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.base === "string" &&
    typeof o.date === "string" &&
    !!o.rates &&
    typeof o.rates === "object" &&
    !Array.isArray(o.rates)
  );
}

function readLastGood(): Rates | null {
  try {
    const raw = localStorage.getItem(LAST_GOOD_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { data?: unknown };
    if (!isRates(parsed?.data)) return null;
    const { base, rates, date } = parsed.data;
    return { base, rates, date, stale: true };
  } catch {
    return null;
  }
}

function saveLastGood(data: Rates): void {
  try {
    const { base, rates, date } = data;
    localStorage.setItem(
      LAST_GOOD_KEY,
      JSON.stringify({ at: Date.now(), data: { base, rates, date } }),
    );
  } catch {
    /* storage full or blocked: keep working without the fallback */
  }
}

/** "שער מ-12.11 · אין חיבור" for a provider date YYYY-MM-DD. */
export function staleRateLabel(date: string): string {
  const dm = /^\d{4}-\d{2}-\d{2}/.test(date) ? `${date.slice(8, 10)}.${date.slice(5, 7)}` : date;
  return `שער מ-${dm} · אין חיבור`;
}

export async function getRates(): Promise<Rates | null> {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { at: number; data: Rates };
      if (Date.now() - parsed.at < TTL && isRates(parsed.data) && !parsed.data.stale)
        return parsed.data;
    }
  } catch {
    /* ignore cache errors */
  }
  try {
    const res = await fetch("https://api.exchangerate-api.com/v4/latest/ILS");
    if (res.ok) {
      const json: unknown = await res.json();
      if (isRates(json)) {
        const data: Rates = { base: json.base, rates: json.rates, date: json.date };
        try {
          sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data }));
        } catch {
          /* ignore cache errors */
        }
        saveLastGood(data);
        return data;
      }
    }
  } catch {
    /* network failure: fall through to the last good table */
  }
  return readLastGood();
}

export function convert(
  amount: number,
  from: string,
  to: string,
  rates: Rates | null,
  manualIlsToJpy?: number | null,
): number {
  if (from === to) return amount;
  // ILS <-> JPY manual override
  if (manualIlsToJpy && manualIlsToJpy > 0) {
    if (from === "ILS" && to === "JPY") return amount * manualIlsToJpy;
    if (from === "JPY" && to === "ILS") return amount / manualIlsToJpy;
  }
  if (!rates) return 0;
  // rates are ILS -> X. Convert via ILS.
  const toIls = (a: number, cur: string) => (cur === "ILS" ? a : a / rates.rates[cur]);
  const fromIls = (a: number, cur: string) => (cur === "ILS" ? a : a * rates.rates[cur]);
  return fromIls(toIls(amount, from), to);
}
