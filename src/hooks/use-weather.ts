import { useQuery } from "@tanstack/react-query";
import {
  fetchCurrentWeather,
  fetchWeather,
  geocodeCity,
  type CurrentWeather,
  type WeatherDay,
} from "@/lib/weather";
import type { LatLng } from "@/lib/coords";
import { weatherQueryName } from "@/lib/weather-location";

function isoOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Where to fetch weather for. A stored point (today's stop / hotel) wins and
 * skips geocoding; otherwise the label is shortened and geocoded, restricted to
 * the trip's country when it is known.
 */
export type WeatherPlaceOptions = {
  point?: LatLng | null;
  countryCode?: string | null;
};

function validPoint(point: LatLng | null | undefined): LatLng | null {
  if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return null;
  return point;
}

function geocodeQuery(label: string | null, countryCode: string | null, enabled: boolean) {
  return {
    queryKey: ["geocode", label, countryCode] as const,
    queryFn: () => geocodeCity(label!, countryCode),
    enabled: enabled && !!label,
    staleTime: Infinity,
    gcTime: 1000 * 60 * 60 * 24,
  };
}

export function useWeather(
  cityLabel: string | null | undefined,
  options?: WeatherPlaceOptions,
): {
  days: WeatherDay[];
  loading: boolean;
  lat: number | null;
  lng: number | null;
} {
  const point = validPoint(options?.point);
  const countryCode = options?.countryCode?.toUpperCase() || null;
  const city = weatherQueryName(cityLabel);

  const geo = useQuery(geocodeQuery(city, countryCode, !point));

  const lat = point?.lat ?? geo.data?.lat;
  const lng = point?.lng ?? geo.data?.lng;

  const forecast = useQuery({
    queryKey: ["weather", lat, lng],
    queryFn: () => fetchWeather(lat!, lng!, isoOffset(0), isoOffset(15)),
    enabled: lat != null && lng != null,
    staleTime: 1000 * 60 * 60 * 3,
    gcTime: 1000 * 60 * 60 * 6,
  });

  return {
    days: forecast.data ?? [],
    loading: (!point && geo.isLoading) || forecast.isLoading,
    lat: lat ?? null,
    lng: lng ?? null,
  };
}

export function useDayWeather(
  cityLabel: string | null | undefined,
  date: string | null | undefined,
  options?: WeatherPlaceOptions,
): (WeatherDay & { lat: number; lng: number }) | null {
  const { days, lat, lng } = useWeather(cityLabel, options);
  if (!date || lat == null || lng == null) return null;
  const day = days.find((d) => d.date === date);
  // Carry the coordinates the forecast was fetched for, so links built from
  // this value point at exactly the same place as the numbers shown.
  return day ? { ...day, lat, lng } : null;
}

export function useCurrentWeather(
  cityLabel: string | null | undefined,
  fallbackLabel?: string | null | undefined,
  options?: WeatherPlaceOptions,
): (CurrentWeather & { lat: number; lng: number }) | null {
  const point = validPoint(options?.point);
  const countryCode = options?.countryCode?.toUpperCase() || null;
  const primary = weatherQueryName(cityLabel);
  const fallback = weatherQueryName(fallbackLabel);

  const geoPrimary = useQuery(geocodeQuery(primary, countryCode, !point));

  const needsFallback = !point && !!fallback && geoPrimary.isFetched && !geoPrimary.data;

  const geoFallback = useQuery(geocodeQuery(fallback, countryCode, needsFallback));

  const geo = point ?? geoPrimary.data ?? geoFallback.data ?? null;
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
