import { useCurrentWeather, useDayWeather } from "@/hooks/use-weather";
import { WeatherIcon } from "@/components/WeatherIcon";
import { WEATHER_LABELS_HE, weatherForecastUrl } from "@/lib/weather";
import { hebDate, todayISO } from "@/lib/format";

/**
 * Compact pre-trip header. Display only — same weather hooks the previous
 * hero used, no new data sources, no trip-progress ring.
 */
export function PreTripHero({
  title,
  flag,
  destination,
  startDate,
  endDate,
  daysTotal,
  daysToStart,
  weatherCity,
  weatherFallback,
}: {
  title: string;
  flag: string;
  destination: string | null;
  startDate: string;
  endDate: string;
  daysTotal: number;
  daysToStart: number;
  weatherCity: string | null;
  weatherFallback: string | null;
}) {
  const today = todayISO();
  const forecast = useDayWeather(weatherCity ?? weatherFallback, today);
  const current = useCurrentWeather(weatherCity, weatherFallback);
  const wCondition = forecast?.condition ?? current?.condition ?? null;
  const wTemp = forecast ? forecast.tempMax : current?.temp ?? null;
  const wLabel = wCondition ? WEATHER_LABELS_HE[wCondition] : "";
  const forecastUrl = current ? weatherForecastUrl(current.lat, current.lng) : null;

  return (
    <section
      className="relative overflow-hidden rounded-2xl px-4 py-3 text-white"
      style={{ background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)" }}
    >
      <div className="flex items-start gap-3">
        <span className="text-[26px] leading-none shrink-0">{flag}</span>
        <div className="min-w-0 flex-1 text-right">
          <h1 className="text-[19px] font-medium leading-snug tracking-[-0.3px] break-words">{title}</h1>
          <p className="mt-1 text-[12px] text-white/70 leading-snug" dir="rtl">
            {destination ? `${destination} · ` : ""}
            {hebDate(startDate)} – {hebDate(endDate)} · {daysTotal} ימים
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium text-white"
          style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)" }}
        >
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-warning opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-warning" />
          </span>
          עוד {daysToStart} ימים
        </span>

        {wCondition && wTemp != null && (
          <a
            href={forecastUrl ?? "#"}
            target="_blank"
            rel="noreferrer"
            title={wLabel ? `${wLabel} · לתחזית מלאה` : "לתחזית מלאה"}
            aria-label={wLabel ? `${wTemp}° ${wLabel}` : `${wTemp}°`}
            className="inline-flex min-h-11 items-center gap-1 rounded-full px-2.5 text-[11px] text-white"
            style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)" }}
          >
            <WeatherIcon condition={wCondition} size="sm" />
            <span className="font-medium tabular-nums leading-none" dir="ltr">{wTemp}°</span>
          </a>
        )}
      </div>
    </section>
  );
}
