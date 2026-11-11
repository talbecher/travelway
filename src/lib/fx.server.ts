// Server-only live FX table for expense proposals made through the API.
// Same provider and URL as the browser helper in fx.ts (which is window-only and is left untouched).
// The result is passed to api_create_expense_proposal as _live_fx; it is never taken from the API caller.

export const FX_URL = "https://api.exchangerate-api.com/v4/latest/ILS";
export const FX_PROVIDER = "exchangerate-api.com";
/** A cached table younger than this is used without asking the provider again. */
export const FX_FRESH_MS = 6 * 60 * 60 * 1000;
/** If the provider fails, a cached table up to this age is still used (marked stale). Older: no rate. */
export const FX_MAX_STALE_MS = 24 * 60 * 60 * 1000;
const FX_TIMEOUT_MS = 5000;

export type LiveFx = {
  base: string;
  /** 1 {base} = rates[X] {X}. Only finite, positive numbers are kept. */
  rates: Record<string, number>;
  /** Provider's rate date, YYYY-MM-DD. */
  date: string;
  provider: string;
  /** true when served from the cache because the provider could not be reached. */
  stale: boolean;
};

/** Validates the provider answer. Returns null for anything that is not a usable rate table. */
export function parseFxTable(raw: unknown): Omit<LiveFx, "stale"> | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const base = typeof o.base === "string" ? o.base.toUpperCase() : "";
  if (!/^[A-Z]{3}$/.test(base)) return null;
  const date = typeof o.date === "string" ? o.date : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (!o.rates || typeof o.rates !== "object" || Array.isArray(o.rates)) return null;
  const rates: Record<string, number> = {};
  for (const [k, v] of Object.entries(o.rates as Record<string, unknown>)) {
    if (/^[A-Z]{3}$/.test(k) && typeof v === "number" && Number.isFinite(v) && v > 0) rates[k] = v;
  }
  if (Object.keys(rates).length === 0) return null;
  return { base, rates, date, provider: FX_PROVIDER };
}

type Cached = { at: number; data: Omit<LiveFx, "stale"> };
let cache: Cached | null = null;

/** Test hook. */
export function resetFxCache(): void {
  cache = null;
}

/**
 * Live rate table: fresh cache (< 6 h) -> provider -> stale cache (< 24 h) -> null.
 * The cache lives in this server instance's memory only; nothing is written to the database.
 */
export async function getServerFx(
  opts: { now?: () => number; fetchImpl?: typeof fetch } = {},
): Promise<LiveFx | null> {
  const now = opts.now ?? Date.now;
  const fetchImpl = opts.fetchImpl ?? fetch;
  if (cache && now() - cache.at < FX_FRESH_MS) return { ...cache.data, stale: false };
  try {
    const res = await fetchImpl(FX_URL, { signal: AbortSignal.timeout(FX_TIMEOUT_MS) });
    if (res.ok) {
      const data = parseFxTable(await res.json());
      if (data) {
        cache = { at: now(), data };
        return { ...data, stale: false };
      }
    }
  } catch {
    /* provider unreachable: fall through to the stale cache */
  }
  if (cache && now() - cache.at < FX_MAX_STALE_MS) {
    console.warn("[fx] provider unavailable, using cached rates");
    return { ...cache.data, stale: true };
  }
  return null;
}
