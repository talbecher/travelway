import { hebDate } from "@/lib/format";

/**
 * Compact pre-trip header. Display only — no queries, no progress ring,
 * no fixed height so long titles can wrap freely.
 */
export function PreTripHero({
  title,
  flag,
  destination,
  startDate,
  endDate,
  daysTotal,
  daysToStart,
}: {
  title: string;
  flag: string;
  destination: string | null;
  startDate: string;
  endDate: string;
  daysTotal: number;
  daysToStart: number;
}) {
  return (
    <section className="flex flex-wrap items-start gap-x-3 gap-y-1.5 pt-1">
      <span className="text-[22px] leading-none shrink-0">{flag}</span>
      <div className="min-w-0 flex-1">
        <h1 className="text-[20px] font-semibold leading-snug tracking-[-0.3px] break-words">{title}</h1>
        <p className="mt-0.5 text-[12px] text-muted-foreground leading-snug break-words" dir="rtl">
          {destination ? `${destination} · ` : ""}
          {hebDate(startDate)} – {hebDate(endDate)} · {daysTotal} ימים
        </p>
      </div>
      <span className="shrink-0 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-[color:var(--accent)]">
        עוד {daysToStart} ימים
      </span>
    </section>
  );
}
