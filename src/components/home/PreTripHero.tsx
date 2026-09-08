import { useEffect, useState } from "react";
import { hebDate } from "@/lib/format";

/**
 * Compact pre-trip header. Display only — no queries.
 * Keeps a panoramic 160–190px band with a readable bottom scrim.
 */
export function PreTripHero({
  title,
  flag,
  destination,
  startDate,
  endDate,
  daysTotal,
  daysToStart,
  imageUrls,
  fallbackBackground,
}: {
  title: string;
  flag: string;
  destination: string | null;
  startDate: string;
  endDate: string;
  daysTotal: number;
  daysToStart: number;
  imageUrls: string[];
  fallbackBackground: string;
}) {
  const [loadedImageUrl, setLoadedImageUrl] = useState<string | null>(null);
  const key = imageUrls.join("|");
  useEffect(() => {
    let cancelled = false;
    setLoadedImageUrl(null);
    const candidates = key ? key.split("|") : [];
    const tryAt = (index: number) => {
      if (cancelled || index >= candidates.length) return;
      const url = candidates[index]!;
      const img = new Image();
      img.onload = () => {
        if (!cancelled) setLoadedImageUrl(url);
      };
      img.onerror = () => tryAt(index + 1);
      img.src = url;
    };
    tryAt(0);
    return () => {
      cancelled = true;
    };
  }, [key]);
  const showImage = Boolean(loadedImageUrl);
  const countdown = daysToStart === 1 ? "עוד יום אחד יוצאים לדרך" : `עוד ${daysToStart} ימים יוצאים לדרך`;

  return (
    <section
      className="relative isolate flex min-h-[164px] overflow-hidden rounded-2xl px-4 py-3.5 text-white shadow-sm sm:min-h-[186px] sm:px-5"
      style={showImage ? undefined : { background: fallbackBackground }}
    >
      {showImage && (
        <img
          src={loadedImageUrl ?? undefined}
          alt=""
          className="absolute inset-0 -z-20 h-full w-full object-cover"
        />
      )}
      {/* readable scrim only where the text sits */}
      <div className="absolute inset-x-0 bottom-0 -z-10 h-[85%] bg-gradient-to-t from-black/85 via-black/50 to-transparent" />

      <div className="mt-auto min-w-0 max-w-full">
        <div className="mb-0.5 flex min-w-0 items-center gap-1.5 text-[12px] text-white/85">
          <span className="shrink-0 text-[15px] leading-none">{flag}</span>
          {destination && <span className="min-w-0 break-words">{destination}</span>}
        </div>
        <h1 className="max-w-full break-words text-[25px] font-bold leading-tight text-white drop-shadow-[0_1px_6px_rgba(0,0,0,0.45)]">
          {title}
        </h1>
        <p className="mt-0.5 text-[12px] leading-snug text-white/85" dir="rtl">
          {hebDate(startDate)} – {hebDate(endDate)} · {daysTotal} ימים
        </p>
        <p className="mt-1.5 text-[13px] font-semibold text-[color:var(--accent)] drop-shadow-[0_1px_4px_rgba(0,0,0,0.5)]">
          ✈ {countdown}
        </p>
      </div>
    </section>
  );
}
