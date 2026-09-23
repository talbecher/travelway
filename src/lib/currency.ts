import { useEffect, useState } from "react";
import { useSettings, useTrip } from "@/hooks/use-trip";
import { getRates } from "@/lib/fx";

/**
 * Currency model:
 * - settings.base_currency  -> budget / balance / all reports.  Amount columns
 *   named *_ils are interpreted as amounts in the BASE currency.
 * - trips.currency_code     -> target (local) currency for on-trip spending.
 * The target currency is never copied into the base currency.
 */

const ZERO_DECIMAL = new Set(["JPY", "KRW", "VND", "CLP", "ISK", "HUF", "TWD"]);

export function formatMoney(amount: number | null | undefined, currency?: string | null): string {
  const v = Number(amount ?? 0);
  const cur = (currency || "ILS").toUpperCase();
  const maximumFractionDigits = ZERO_DECIMAL.has(cur) ? 0 : 2;
  try {
    return new Intl.NumberFormat("he-IL", {
      style: "currency",
      currency: cur,
      minimumFractionDigits: 0,
      maximumFractionDigits,
    }).format(v);
  } catch {
    return `${v.toLocaleString("he-IL", { maximumFractionDigits })} ${cur}`;
  }
}

export function useBaseCurrency(): string {
  const { data: settings } = useSettings();
  return (settings?.base_currency || "ILS").toUpperCase();
}

export function useTargetCurrency(): string {
  const { data: trip } = useTrip();
  const { data: settings } = useSettings();
  return (trip?.currency_code || settings?.foreign_currency || "ILS").toUpperCase();
}

const PAIR_TTL = 6 * 60 * 60 * 1000;
const PAIR_PREFIX = "fx-pair-v1:";

export type PairRate = { rate: number; date: string; provider: string };

/**
 * Cross rate for an arbitrary pair: 1 {base} = X {target}.
 * The provider answer has its own base currency; any currency equal to that
 * base is treated as 1. Cached per pair.
 */
export async function getPairRate(base: string, target: string): Promise<PairRate | null> {
  const b = base.toUpperCase();
  const t = target.toUpperCase();
  if (b === t) return { rate: 1, date: "", provider: "local" };
  const key = `${PAIR_PREFIX}${b}>${t}`;
  if (typeof window !== "undefined") {
    try {
      const raw = sessionStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw) as { at: number; data: PairRate };
        if (Date.now() - parsed.at < PAIR_TTL) return parsed.data;
      }
    } catch {
      /* ignore cache errors */
    }
  }
  const rates = await getRates();
  if (!rates) return null;
  const apiBase = (rates.base || "").toUpperCase();
  const valueOf = (c: string): number | null => {
    if (c === apiBase) return 1;
    const v = Number(rates.rates?.[c]);
    return Number.isFinite(v) && v > 0 ? v : null;
  };
  const bv = valueOf(b);
  const tv = valueOf(t);
  if (!bv || !tv) return null;
  const data: PairRate = { rate: tv / bv, date: rates.date, provider: "exchangerate-api.com" };
  if (typeof window !== "undefined") {
    try {
      sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), data }));
    } catch {
      /* ignore cache errors */
    }
  }
  return data;
}

export type Conversion = {
  base: string;
  target: string;
  /** 1 {base} = rate {target}. null when no valid rate is available. */
  rate: number | null;
  source: "same" | "manual" | "live" | null;
  provider: string | null;
  updatedAt: string | null;
  /** true when base === target, so no conversion is needed at all. */
  sameCurrency: boolean;
};

/** Manual rate (> 0) wins over the daily market rate. No hardcoded fallback. */
export function useConversion(): Conversion {
  const base = useBaseCurrency();
  const target = useTargetCurrency();
  const { data: settings } = useSettings();
  const manual = Number(settings?.manual_exchange_rate ?? 0);
  const [live, setLive] = useState<PairRate | null>(null);

  useEffect(() => {
    let alive = true;
    setLive(null);
    if (base === target) return;
    getPairRate(base, target).then((r) => {
      if (alive) setLive(r);
    });
    return () => {
      alive = false;
    };
  }, [base, target]);

  if (base === target) {
    return { base, target, rate: 1, source: "same", provider: null, updatedAt: null, sameCurrency: true };
  }
  if (Number.isFinite(manual) && manual > 0) {
    return { base, target, rate: manual, source: "manual", provider: null, updatedAt: null, sameCurrency: false };
  }
  if (live && Number.isFinite(live.rate) && live.rate > 0) {
    return {
      base,
      target,
      rate: live.rate,
      source: "live",
      provider: live.provider,
      updatedAt: live.date || null,
      sameCurrency: false,
    };
  }
  return { base, target, rate: null, source: null, provider: null, updatedAt: null, sameCurrency: false };
}

function trimRate(rate: number): string {
  return rate.toLocaleString("he-IL", { maximumFractionDigits: rate >= 100 ? 2 : 4 });
}

/** "1 ILS = 38 JPY (שער שוק יומי · exchangerate-api.com · 2026-09-23)" */
export function conversionLabel(c: Conversion): string {
  if (c.sameCurrency || c.rate == null) return "";
  const dir = `1 ${c.base} = ${trimRate(c.rate)} ${c.target}`;
  if (c.source === "manual") return `${dir} (שער ידני)`;
  const parts = ["שער שוק יומי", c.provider, c.updatedAt].filter(Boolean);
  return `${dir} (${parts.join(" · ")})`;
}

export const NO_RATE_MESSAGE = "אין שער המרה תקין — הזינו שער ידני בהגדרות התקציב או נסו שוב כשיש חיבור לאינטרנט";
