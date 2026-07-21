import { useQuery } from "@tanstack/react-query";
import { fetchCurrentWeather, fetchWeather, geocodeCity, type CurrentWeather, type WeatherDay } from "@/lib/weather";


function isoOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function useWeather(cityLabel: string | null | undefined): {
  days: WeatherDay[];
  loading: boolean;
} {
  const city = cityLabel?.trim() || null;

  const geo = useQuery({
    queryKey: ["geocode", city],
    queryFn: () => geocodeCity(city!),
    enabled: !!city,
    staleTime: Infinity,
    gcTime: 1000 * 60 * 60 * 24,
  });

  const lat = geo.data?.lat;
  const lng = geo.data?.lng;

  const forecast = useQuery({
    queryKey: ["weather", lat, lng],
    queryFn: () => fetchWeather(lat!, lng!, isoOffset(0), isoOffset(15)),
    enabled: lat != null && lng != null,
    staleTime: 1000 * 60 * 60 * 3,
    gcTime: 1000 * 60 * 60 * 6,
  });

  return {
    days: forecast.data ?? [],
    loading: geo.isLoading || forecast.isLoading,
  };
}

export function useDayWeather(
  cityLabel: string | null | undefined,
  date: string | null | undefined
): WeatherDay | null {
  const { days } = useWeather(cityLabel);
  if (!date) return null;
  return days.find((d) => d.date === date) ?? null;
}

export function useCurrentWeather(
  cityLabel: string | null | undefined,
  fallbackLabel?: string | null | undefined
): (CurrentWeather & { lat: number; lng: number }) | null {
  const primary = cityLabel?.trim() || null;
  const fallback = fallbackLabel?.trim() || null;

  const geoPrimary = useQuery({
    queryKey: ["geocode", primary],
    queryFn: () => geocodeCity(primary!),
    enabled: !!primary,
    staleTime: Infinity,
    gcTime: 1000 * 60 * 60 * 24,
  });

  const needsFallback = !!fallback && geoPrimary.isFetched && !geoPrimary.data;

  const geoFallback = useQuery({
    queryKey: ["geocode", fallback],
    queryFn: () => geocodeCity(fallback!),
    enabled: needsFallback,
    staleTime: Infinity,
    gcTime: 1000 * 60 * 60 * 24,
  });

  const geo = geoPrimary.data ?? geoFallback.data ?? null;
  const lat = geo?.lat;
  const lng = geo?.lng;

  const current = useQuery({
    queryKey: ["current-weather", lat, lng],
    queryFn: () => fetchCurrentWeather(lat!, lng!),
    enabled: lat != null && lng != null,
    staleTime: 1000 * 60 * 30,
    gcTime: 1000 * 60 * 60 * 2,
  });

  if (!current.data || lat == null || lng == null) return null;
  return { ...current.data, lat, lng };
}


