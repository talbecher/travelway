import { useEffect, useState } from "react";
import { hebDate } from "@/lib/format";
import { useCurrentWeather, useDayWeather } from "@/hooks/use-weather";
import { WeatherIcon } from "@/components/WeatherIcon";
import { WEATHER_LABELS_HE, weatherForecastUrl } from "@/lib/weather";

export function ActiveTripHero({
  title,
  dayNumber,
  daysTotal,
  date,
  city,
  weatherLocation,
  imageUrls,
  fallbackBackground,
}: {
  title: string;
  dayNumber: number | null;
  daysTotal: number;
  date: string;
  city: string | null;
  weatherLocation: string | null;
  imageUrls: string[];
  fallbackBackground: string;
}) {
  const [loadedImageUrl, setLoadedImageUrl] = useState<string | null>(null);
  const imageKey = imageUrls.join("|");

  useEffect(() => {
    let cancelled = false;
    setLoadedImageUrl(null);
    const candidates = imageKey ? imageKey.split("|") : [];
    const loadAt = (index: number) => {
      if (cancelled || index >= candidates.length) return;
      const url = candidates[index];
      if (!url) return;
      const image = new Image();
      image.onload = () => {
        if (!cancelled) setLoadedImageUrl(url);
      };
      image.onerror = () => loadAt(index + 1);
      image.src = url;
    };
    loadAt(0);
    return () => {
      cancelled = true;
    };
  }, [imageKey]);

  const reliableWeatherLocation = weatherLocation?.trim() || null;
  const forecast = useDayWeather(reliableWeatherLocation, date);
  const current = useCurrentWeather(reliableWeatherLocation);
  const condition = forecast?.condition ?? current?.condition ?? null;
  const temperature = forecast ? forecast.tempMax : current?.temp ?? null;
  const weatherLabel = condition ? WEATHER_LABELS_HE[condition] : null;
  const forecastUrl = current ? weatherForecastUrl(current.lat, current.lng) : null;

  return (
    <section
      className="relative isolate flex overflow-hidden rounded-2xl px-4 py-4 text-primary-foreground shadow-sm sm:px-5 sm:py-5"
      style={loadedImageUrl ? undefined : { backgroundColor: "var(--warning-foreground)", backgroundImage: fallbackBackground }}
    >
      {loadedImageUrl && (
        <img src={loadedImageUrl} alt="" className="absolute inset-0 -z-20 h-full w-full object-cover" />
      )}
      <div className="absolute inset-0 -z-10 bg-gradient-to-l from-warning-foreground/85 via-warning-foreground/45 to-transparent" />

      <div className="flex w-full min-w-0 flex-col gap-5">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="break-words text-[25px] font-bold leading-tight text-primary-foreground drop-shadow-sm">
              {title}
            </h1>
            <p className="mt-0.5 break-words text-[12px] leading-snug text-primary-foreground/85">
              {dayNumber ? `יום ${dayNumber} מתוך ${daysTotal}` : "היום בטיול"} · {hebDate(date)}
              {city ? ` · ${city}` : ""}
            </p>
          </div>

          {condition && temperature != null && reliableWeatherLocation && (
            <a
              href={forecastUrl ?? undefined}
              target={forecastUrl ? "_blank" : undefined}
              rel={forecastUrl ? "noreferrer" : undefined}
              className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-primary-foreground/25 bg-foreground/35 px-3 text-[12px] text-primary-foreground backdrop-blur-sm"
              aria-label={`${temperature} מעלות, ${weatherLabel ?? "מזג אוויר"}, ${reliableWeatherLocation}`}
            >
              <WeatherIcon condition={condition} size="sm" />
              <span className="font-semibold tabular-nums" dir="ltr">{temperature}°</span>
            </a>
          )}
        </div>

        {condition && temperature != null && reliableWeatherLocation && (
          <p className="text-[11px] font-medium text-primary-foreground/90">
            מזג האוויר ב{reliableWeatherLocation}{weatherLabel ? ` · ${weatherLabel}` : ""}
          </p>
        )}
      </div>
    </section>
  );
}