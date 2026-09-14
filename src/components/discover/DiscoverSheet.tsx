import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Compass, Loader2 } from "lucide-react";
import { BottomSheet } from "@/components/BottomSheet";
import {
  discoverPlaces,
  DISCOVER_INTERESTS,
  INTEREST_LABELS,
  type DiscoverInterest,
  type DiscoverResponse,
} from "@/lib/discover.functions";
import { DiscoverCard } from "@/components/discover/DiscoverCard";

export function DiscoverSheet({
  open,
  onOpenChange,
  defaultCity,
  defaultCountry,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  defaultCity?: string | null;
  defaultCountry?: string | null;
}) {
  const [city, setCity] = useState(defaultCity ?? "");
  const [country, setCountry] = useState(defaultCountry ?? "");
  const [interests, setInterests] = useState<DiscoverInterest[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [data, setData] = useState<DiscoverResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const run = useServerFn(discoverPlaces);
  const search = useMutation({
    mutationFn: (vars: { city: string; country: string; interests: string[] }) =>
      run({ data: vars }),
    onSuccess: (res) => {
      setData(res);
      setSelected(new Set());
      setErrorMsg(res.ok ? null : (res.message ?? "החיפוש נכשל."));
    },
    onError: () => {
      setData(null);
      setErrorMsg("החיפוש נכשל. נסו שוב מאוחר יותר.");
    },
  });

  const toggleInterest = (i: DiscoverInterest) => {
    setInterests((prev) => {
      if (prev.includes(i)) return prev.filter((x) => x !== i);
      if (prev.length >= 3) return prev;
      return [...prev, i];
    });
  };

  const canSubmit =
    city.trim().length > 0 &&
    country.trim().length > 0 &&
    interests.length >= 1 &&
    interests.length <= 3 &&
    !search.isPending;

  const submit = () => {
    if (!canSubmit) return;
    setErrorMsg(null);
    search.mutate({ city: city.trim(), country: country.trim(), interests });
  };

  const results = data?.ok ? data.results : [];

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title="Discover — גילוי מקומות">
      <div className="space-y-4 pb-2" dir="rtl">
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">עיר</span>
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              maxLength={100}
              dir="rtl"
              className="w-full h-10 rounded-lg bg-background border border-input px-3 text-sm outline-none focus:border-[color:var(--accent)]"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">מדינה</span>
            <input
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              maxLength={100}
              dir="rtl"
              className="w-full h-10 rounded-lg bg-background border border-input px-3 text-sm outline-none focus:border-[color:var(--accent)]"
            />
          </label>
        </div>

        <div className="space-y-1.5">
          <span className="text-xs text-muted-foreground">תחומי עניין (1–3)</span>
          <div className="flex flex-wrap gap-2">
            {DISCOVER_INTERESTS.map((i) => {
              const active = interests.includes(i);
              const disabled = !active && interests.length >= 3;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => toggleInterest(i)}
                  aria-pressed={active}
                  disabled={disabled}
                  className={`h-8 px-3 rounded-full border text-xs min-h-0 ${
                    active
                      ? "bg-[color:var(--accent)] text-white border-transparent"
                      : "bg-card border-border text-foreground"
                  } ${disabled ? "opacity-40" : ""}`}
                >
                  {INTEREST_LABELS[i]}
                </button>
              );
            })}
          </div>
        </div>

        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className="w-full h-11 rounded-lg bg-[color:var(--accent)] text-white text-sm flex items-center justify-center gap-2 disabled:opacity-40"
        >
          {search.isPending ? <Loader2 size={16} className="animate-spin" /> : <Compass size={16} />}
          {search.isPending ? "מחפש…" : "חפש מקומות"}
        </button>

        {errorMsg && (
          <div role="alert" className="text-xs text-[color:var(--accent-2)] bg-muted rounded-lg p-3">
            {errorMsg}
          </div>
        )}

        {data?.ok && (data.failedInterests?.length ?? 0) > 0 && (
          <div role="status" className="text-xs text-muted-foreground bg-muted rounded-lg p-3">
            חלק מהתחומים לא הוחזרו:{" "}
            {data.failedInterests!.map((i) => INTEREST_LABELS[i]).join(", ")}
          </div>
        )}

        {search.isPending && (
          <div className="space-y-2" aria-hidden>
            {[0, 1, 2].map((k) => (
              <div key={k} className="h-[92px] rounded-xl bg-muted animate-pulse" />
            ))}
          </div>
        )}

        {!search.isPending && data?.ok && results.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-6">
            לא נמצאו מקומות מתאימים ליעד ולתחומים שנבחרו.
          </p>
        )}

        {results.length > 0 && (
          <>
            <div className="space-y-2">
              {results.map((p) => (
                <DiscoverCard
                  key={p.id}
                  place={p}
                  selected={selected.has(p.id)}
                  onToggle={() =>
                    setSelected((prev) => {
                      const next = new Set(prev);
                      if (next.has(p.id)) next.delete(p.id);
                      else next.add(p.id);
                      return next;
                    })
                  }
                />
              ))}
            </div>

            <div className="sticky bottom-0 pt-2 bg-surface">
              <button
                type="button"
                disabled
                className="w-full h-11 rounded-lg border border-border bg-card text-xs text-muted-foreground opacity-60"
              >
                תצוגה מקדימה — השמירה תתווסף בהמשך
                {selected.size > 0 ? ` (${selected.size})` : ""}
              </button>
              <p className="text-[10px] text-muted-foreground text-center mt-1.5">
                נתוני המקומות והתמונות מ־Google
              </p>
            </div>
          </>
        )}
      </div>
    </BottomSheet>
  );
}
