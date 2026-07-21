// Open-Meteo based weather helpers. No API key required.

export type WeatherCondition =
  | "sunny"
  | "partly-cloudy"
  | "cloudy"
  | "fog"
  | "drizzle"
  | "rain"
  | "snow"
  | "storm"
  | "unknown";

export type WeatherDay = {
  date: string;
  tempMax: number;
  tempMin: number;
  precipitation: number;
  weatherCode: number;
  condition: WeatherCondition;
};

export function getCondition(code: number): WeatherCondition {
  if (code === 0) return "sunny";
  if (code === 1 || code === 2) return "partly-cloudy";
  if (code === 3) return "cloudy";
  if (code === 45 || code === 48) return "fog";
  if (code === 51 || code === 53 || code === 55) return "drizzle";
  if ([61, 63, 65, 80, 81, 82].includes(code)) return "rain";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "snow";
  if ([95, 96, 99].includes(code)) return "storm";
  return "unknown";
}

export const WEATHER_LABELS_HE: Record<WeatherCondition, string> = {
  sunny: "שמשי",
  "partly-cloudy": "בהיר חלקית",
  cloudy: "מעונן",
  fog: "ערפל",
  drizzle: "גשם קל",
  rain: "גשם",
  snow: "שלג",
  storm: "סופת רעמים",
  unknown: "",
};

export async function geocodeCity(
  name: string
): Promise<{ lat: number; lng: number } | null> {
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
      name
    )}&count=1&language=en`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = (await res.json()) as {
      results?: Array<{ latitude: number; longitude: number }>;
    };
    const first = json.results?.[0];
    if (!first) return null;
    return { lat: first.latitude, lng: first.longitude };
  } catch {
    return null;
  }
}

export async function fetchWeather(
  lat: number,
  lng: number,
  startDate: string,
  endDate: string
): Promise<WeatherDay[]> {
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${lat}&longitude=${lng}` +
      `&daily=temperature_2m_max,temperature_2m_min,weathercode,precipitation_sum` +
      `&timezone=auto&start_date=${startDate}&end_date=${endDate}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const json = (await res.json()) as {
      daily?: {
        time?: string[];
        temperature_2m_max?: number[];
        temperature_2m_min?: number[];
        weathercode?: number[];
        precipitation_sum?: number[];
      };
    };
    const d = json.daily;
    if (!d?.time) return [];
    return d.time.map((date, i) => {
      const code = d.weathercode?.[i] ?? -1;
      return {
        date,
        tempMax: Math.round(d.temperature_2m_max?.[i] ?? 0),
        tempMin: Math.round(d.temperature_2m_min?.[i] ?? 0),
        precipitation: Number(d.precipitation_sum?.[i] ?? 0),
        weatherCode: code,
        condition: getCondition(code),
      };
    });
  } catch {
    return [];
  }
}
