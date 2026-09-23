import { useEffect, useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import { useSettings } from "@/hooks/use-trip";
import { useBaseCurrency, useTargetCurrency } from "@/lib/currency";
import { getRates, convert } from "@/lib/fx";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { BottomSheet } from "./BottomSheet";

const CURRENCIES = ["ILS", "JPY", "USD", "EUR"] as const;

export function ConverterPill() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-xs px-3 py-1.5 rounded-full bg-card border border-border text-muted-foreground min-h-0 h-auto"
        aria-label="ממיר מטבע"
      >
        ₪ ⇄ ¥
      </button>
      <BottomSheet open={open} onOpenChange={setOpen} title="ממיר מטבע">
        <Converter />
      </BottomSheet>
    </>
  );
}

function Converter() {
  const { data: settings } = useSettings();
  const qc = useQueryClient();
  const manual = Number(settings?.manual_exchange_rate ?? 0);
  const base = useBaseCurrency();
  const target = useTargetCurrency();
  const [rates, setRates] = useState<Awaited<ReturnType<typeof getRates>>>(null);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState("ILS");
  const [to, setTo] = useState("JPY");
  const [amount, setAmount] = useState("100");
  const [useManual, setUseManual] = useState(false);

  useEffect(() => {
    getRates().then((r) => { setRates(r); setLoading(false); });
  }, []);

  const n = Number(amount) || 0;
  const result = convert(n, from, to, rates, useManual && manual > 0 ? manual : null);

  async function setPair(f: string, t: string) { setFrom(f); setTo(t); }

  return (
    <div className="space-y-4 pt-2">
      <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center">
        <select value={from} onChange={(e) => setFrom(e.target.value)}
          className="rounded-lg bg-background border border-input px-3">
          {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
        </select>
        <button
          type="button"
          onClick={() => { const t = from; setFrom(to); setTo(t); }}
          className="h-11 w-11 rounded-full border border-border flex items-center justify-center min-h-0"
          aria-label="החלף"
        >
          <ArrowLeftRight size={16} />
        </button>
        <select value={to} onChange={(e) => setTo(e.target.value)}
          className="rounded-lg bg-background border border-input px-3">
          {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
        </select>
      </div>

      <input
        type="number"
        inputMode="decimal"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className="w-full rounded-lg bg-background border border-input px-3 text-xl"
      />

      <div className="text-center py-6 border-y border-border">
        <div className="text-4xl font-medium tabular-nums">
          {result.toLocaleString(undefined, { maximumFractionDigits: to === "JPY" ? 0 : 2 })}
        </div>
        <div className="text-sm text-muted-foreground mt-1">{to}</div>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <QuickBtn onClick={() => setPair("ILS","JPY")}>₪→¥</QuickBtn>
        <QuickBtn onClick={() => setPair("JPY","ILS")}>¥→₪</QuickBtn>
        <QuickBtn onClick={() => setPair("USD","JPY")}>$→¥</QuickBtn>
        <QuickBtn onClick={() => setPair("EUR","JPY")}>€→¥</QuickBtn>
      </div>

      <label className="flex items-center justify-between text-sm py-2">
        <span>שער מוגדר ידנית</span>
        <input type="checkbox" checked={useManual} onChange={(e) => setUseManual(e.target.checked)} className="min-h-0 h-4 w-8" />
      </label>

      {useManual && (
        <div>
          <label className="text-xs text-muted-foreground">שער ידני — 1 {base} = X {target}</label>
          <input
            type="number"
            step="0.01"
            defaultValue={manual > 0 ? manual : ""}
            onBlur={async (e) => {
              const v = Number(e.target.value);
              if (!v) return;
              await supabase.from("settings").update({ manual_exchange_rate: v }).eq("id", settings!.id);
              qc.invalidateQueries({ queryKey: ["settings"] });
            }}
            className="w-full mt-1 rounded-lg bg-background border border-input px-3"
          />
        </div>
      )}

      <p className="text-xs text-muted-foreground text-center">
        {loading ? "טוען שערים..." : rates ? `שער שוק יומי · exchangerate-api.com · עודכן ${rates.date}` : "אין חיבור — נדרש שער ידני"}
      </p>
    </div>
  );
}

function QuickBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className="h-11 rounded-lg border border-border bg-background text-sm min-h-0">
      {children}
    </button>
  );
}
