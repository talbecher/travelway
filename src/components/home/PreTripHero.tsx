import { useEffect, useState } from "react";
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
  imageUrl,
  fallbackBackground,
}: {
  title: string;
  flag: string;
  destination: string | null;
  startDate: string;
  endDate: string;
  daysTotal: number;
  daysToStart: number;
  imageUrl: string | null;
  fallbackBackground: string;
}) {
  const [loadedImageUrl, setLoadedImageUrl] = useState<string | null>(null);
  useEffect(() => {
    setLoadedImageUrl(null);
    if (!imageUrl) return;
    const candidate = new Image();
    candidate.onload = () => setLoadedImageUrl(imageUrl);
    candidate.onerror = () => setLoadedImageUrl(null);
    candidate.src = imageUrl;
    return () => {
      candidate.onload = null;
      candidate.onerror = null;
    };
  }, [imageUrl]);
  const showImage = loadedImageUrl === imageUrl;
  const countdown = daysToStart === 1 ? "עוד יום אחד יוצאים לדרך" : `עוד ${daysToStart} ימים יוצאים לדרך`;

  return (
    <section
      className="relative isolate flex min-h-[168px] overflow-hidden rounded-2xl bg-surface-2 px-4 py-4 text-white shadow-sm sm:min-h-[182px] sm:px-5"
      style={{ background: fallbackBackground }}
    >
      {showImage && (
        <img
          src={loadedImageUrl ?? undefined}
          alt=""
          className="absolute inset-0 -z-20 h-full w-full object-cover"
          onError={() => setLoadedImageUrl(null)}
        />
      )}
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black/85 via-black/35 to-black/15" />
      {!showImage && (
        <div aria-hidden="true" className="absolute end-4 top-3 -z-10 text-6xl opacity-15">
          {flag}
        </div>
      )}

      <div className="mt-auto min-w-0 max-w-full">
        <div className="mb-1 flex min-w-0 items-center gap-2 text-[12px] text-white/80">
          <span className="shrink-0 text-lg leading-none">{flag}</span>
          {destination && <span className="min-w-0 break-words">{destination}</span>}
        </div>
        <h1 className="max-w-full break-words text-[26px] font-bold leading-tight text-white">{title}</h1>
        <p className="mt-1 text-[12px] leading-snug text-white/80" dir="rtl">
          {hebDate(startDate)} – {hebDate(endDate)} · {daysTotal} ימים
        </p>
        <p className="mt-2 text-[13px] font-medium text-[color:var(--accent)]">✈ {countdown}</p>
      </div>
    </section>
  );
}
