import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { hebDate } from "@/lib/format";
import { useCurrentWeather, useDayWeather } from "@/hooks/use-weather";
import { WeatherIcon } from "@/components/WeatherIcon";
import { WEATHER_LABELS_HE, weatherForecastUrl } from "@/lib/weather";
import { useOnline } from "@/hooks/use-online";
import { getDestinationPhoto } from "@/lib/places.functions";
import ambienceImage from "@/assets/travel-ambience.jpg";
import { Info, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BottomSheet } from "@/components/BottomSheet";

export function ActiveTripHero({
  title,
  dayNumber,
  daysTotal,
  date,
  city,
  weatherLocation,
  imageUrls,
  fallbackBackground,
  destination,
}: {
  title: string;
  dayNumber: number | null;
  daysTotal: number;
  date: string;
  city: string | null;
  weatherLocation: string | null;
  imageUrls: string[];
  fallbackBackground: string;
  destination?: string | null;
}) {
  const [loadedImageUrl, setLoadedImageUrl] = useState<string | null>(null);
  const [dayImagesExhausted, setDayImagesExhausted] = useState(false);
  const [ambienceFailed, setAmbienceFailed] = useState(false);
  const [attributionOpen, setAttributionOpen] = useState(false);
  const imageKey = imageUrls.join("|");
  const isOnline = useOnline();
  const fetchDestinationPhoto = useServerFn(getDestinationPhoto);

  const destinationTerm = destination?.trim() || null;
  const cityTerm = city?.trim() || null;

  useEffect(() => {
    let cancelled = false;
    setLoadedImageUrl(null);
    setDayImagesExhausted(false);
    const candidates = imageKey ? imageKey.split("|") : [];
    if (candidates.length === 0) setDayImagesExhausted(true);
    const loadAt = (index: number) => {
      if (cancelled) return;
      if (index >= candidates.length) {
        setDayImagesExhausted(true);
        return;
      }
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

  const { data: destinationPhoto } = useQuery({
    queryKey: ["destination-photo", destinationTerm, cityTerm],
    enabled: dayImagesExhausted && isOnline && !!destinationTerm,
    retry: false,
    // Google photo URIs are short-lived references; refetch on a new session
    // rather than caching them long-term.
    gcTime: 15 * 60 * 1000,
    staleTime: 10 * 60 * 1000,
    queryFn: () =>
      fetchDestinationPhoto({ data: { city: cityTerm, destination: destinationTerm! } }),
  });

  const [destinationPhotoFailed, setDestinationPhotoFailed] = useState(false);
  const destinationUrl =
    dayImagesExhausted && !destinationPhotoFailed ? destinationPhoto?.url ?? null : null;

  useEffect(() => {
    setDestinationPhotoFailed(false);
  }, [destinationPhoto?.url]);

  const backgroundUrl =
    loadedImageUrl ?? destinationUrl ?? (dayImagesExhausted && !ambienceFailed ? ambienceImage : null);
  const showsPlacesPhoto = !loadedImageUrl && !!destinationUrl;
  const attributions = showsPlacesPhoto ? destinationPhoto?.attributions ?? [] : [];

  const reliableWeatherLocation = weatherLocation?.trim() || null;
  const forecast = useDayWeather(reliableWeatherLocation, date);
  const current = useCurrentWeather(reliableWeatherLocation);
  const condition = forecast?.condition ?? current?.condition ?? null;
  const temperature = forecast?.tempMax ?? current?.temp ?? null;
  const weatherLabel = condition ? WEATHER_LABELS_HE[condition] : null;
  const forecastUrl = current ? weatherForecastUrl(current.lat, current.lng) : null;
  const showWeather = !!reliableWeatherLocation && (temperature != null || !!condition);

  return (
    <>
      <section
        className="relative isolate flex overflow-hidden rounded-2xl px-4 py-4 text-primary-foreground shadow-sm sm:px-5 sm:py-5"
        style={backgroundUrl ? undefined : { backgroundColor: "var(--warning-foreground)", backgroundImage: fallbackBackground }}
      >
        {backgroundUrl && (
          <img
            src={backgroundUrl}
            alt=""
            className="absolute inset-0 -z-20 h-full w-full object-cover"
            onError={() => {
              if (destinationUrl && backgroundUrl === destinationUrl) setDestinationPhotoFailed(true);
              else if (backgroundUrl === ambienceImage) setAmbienceFailed(true);
            }}
          />
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

            {showWeather && (
              <a
                href={forecastUrl ?? undefined}
                target={forecastUrl ? "_blank" : undefined}
                rel={forecastUrl ? "noreferrer" : undefined}
                className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-primary-foreground/25 bg-foreground/35 px-3 text-[12px] text-primary-foreground backdrop-blur-sm"
                aria-label={`${temperature != null ? `${temperature} מעלות` : "מזג אוויר"}${weatherLabel ? `, ${weatherLabel}` : ""}, ${reliableWeatherLocation}`}
              >
                <WeatherIcon condition={condition ?? "unknown"} size="sm" />
                {temperature != null ? (
                  <span className="font-semibold tabular-nums" dir="ltr">{temperature}°</span>
                ) : (
                  weatherLabel && <span className="font-medium">{weatherLabel}</span>
                )}
              </a>
            )}
          </div>

          <div className="flex items-end justify-between gap-2">
            {showWeather ? (
              <p className="text-[11px] font-medium text-primary-foreground/90">
                מזג האוויר ב{reliableWeatherLocation}{weatherLabel && temperature != null ? ` · ${weatherLabel}` : ""}
              </p>
            ) : (
              <span />
            )}

            {showsPlacesPhoto && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setAttributionOpen(true)}
                aria-label="פרטי התמונה והצלם"
                className="shrink-0 rounded-full border border-primary-foreground/20 bg-foreground/30 text-primary-foreground/80 backdrop-blur-sm hover:bg-foreground/45 hover:text-primary-foreground"
              >
                <Info aria-hidden="true" />
              </Button>
            )}
          </div>
        </div>
      </section>

      <BottomSheet open={attributionOpen} onOpenChange={setAttributionOpen} title="פרטי התמונה">
        {destinationUrl && (
          <div className="space-y-4 pb-2">
            <img
              src={destinationUrl}
              alt="תמונת היעד המוצגת בפתיחת הטיול"
              className="aspect-[16/10] w-full rounded-lg object-cover"
            />

            <div className="space-y-3">
              {attributions.map((attribution, index) => (
                <div key={`${attribution.name}-${index}`} className="flex min-w-0 items-center gap-3">
                  {attribution.photoUri && (
                    <img
                      src={attribution.photoUri}
                      alt=""
                      className="h-10 w-10 shrink-0 rounded-full object-cover"
                    />
                  )}
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">צילום</p>
                    {attribution.uri ? (
                      <a
                        href={attribution.uri}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-foreground hover:text-primary"
                      >
                        <span className="break-words">{attribution.name}</span>
                        <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      </a>
                    ) : (
                      <p className="py-2 text-sm font-medium text-foreground">{attribution.name}</p>
                    )}
                  </div>
                </div>
              ))}

              {destinationPhoto?.googleMapsUri ? (
                <Button variant="outline" className="w-full" asChild>
                  <a href={destinationPhoto.googleMapsUri} target="_blank" rel="noreferrer">
                    הצגת התמונה ב־Google Maps
                    <ExternalLink aria-hidden="true" />
                  </a>
                </Button>
              ) : (
                <p className="text-sm font-medium text-muted-foreground">Google Maps</p>
              )}
            </div>
          </div>
        )}
      </BottomSheet>
    </>
  );
}
