import { useEffect, useState } from "react";
import { CloudSun } from "lucide-react";
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

  const forecast = useDayWeather(weatherLocation, date);
  const current = useCurrentWeather(weatherLocation);
  const condition = forecast?.condition ?? current?.condition ?? null;
  const temperature = forecast ? forecast.tempMax : current?.temp ?? null;
  const weatherLabel = condition ? WEATHER_LABELS_HE[condition] : null;
  const forecastUrl = current ? weatherForecastUrl(current.lat, current.lng) : null;

  return (
    <section
      className="relative isolate flex min-h-[154px] overflow-hidden rounded-2xl px-4 py-3.5 text-primary-foreground shadow-sm sm:min-h-[170px] sm:px-5"
      style={loadedImageUrl ? undefined : { background: fallbackBackground }}
    >
      {loadedImageUrl && (
        <img src={loadedImageUrl} alt="" className="absolute inset-0 -z-20 h-full w-full object-cover" />
      )}
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-foreground/90 via-foreground/40 to-foreground/10" />

      <div className="flex w-full min-w-0 flex-col justify-between gap-3">
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

          {condition && temperature != null && weatherLocation && (
            <a
              href={forecastUrl ?? undefined}
              target={forecastUrl ? "_blank" : undefined}
              rel={forecastUrl ? "noreferrer" : undefined}
              className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-primary-foreground/25 bg-foreground/35 px-3 text-[12px] text-primary-foreground backdrop-blur-sm"
              aria-label={`${temperature} מעלות, ${weatherLabel ?? "מזג אוויר"}, ${weatherLocation}`}
            >
              <WeatherIcon condition={condition} size="sm" />
              <span className="font-semibold tabular-nums" dir="ltr">{temperature}°</span>
            </a>
          )}
        </div>

        <div className="flex items-center gap-1.5 text-[11px] text-primary-foreground/85">
          <CloudSun size={14} aria-hidden="true" />
          {weatherLocation ? `מזג האוויר ב${weatherLocation}` : "פרטי היום"}
        </div>
      </div>
    </section>
  );
}