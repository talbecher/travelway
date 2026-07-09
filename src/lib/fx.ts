// Live FX with sessionStorage cache. Fallback to manual rate from settings.
type Rates = { base: string; rates: Record<string, number>; date: string };

const CACHE_KEY = "fx-rates-ils-v1";
const TTL = 6 * 60 * 60 * 1000;

export async function getRates(): Promise<Rates | null> {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { at: number; data: Rates };
      if (Date.now() - parsed.at < TTL) return parsed.data;
    }
  } catch {}
  try {
    const res = await fetch("https://api.exchangerate-api.com/v4/latest/ILS");
    if (!res.ok) return null;
    const data = (await res.json()) as Rates;
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data }));
    return data;
  } catch {
    return null;
  }
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
