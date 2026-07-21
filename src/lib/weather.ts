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

const HE_PLACE_ALIASES: Record<string, string> = {
  "יפן": "Japan",
  "טוקיו": "Tokyo",
  "קיוטו": "Kyoto",
  "אוסקה": "Osaka",
  "נארה": "Nara",
  "הירושימה": "Hiroshima",
  "סאפורו": "Sapporo",
  "יוקוהמה": "Yokohama",
  "איטליה": "Italy",
  "רומא": "Rome",
  "מילאנו": "Milan",
  "מילאן": "Milan",
  "פירנצה": "Florence",
  "פלורנס": "Florence",
  "ונציה": "Venice",
  "נאפולי": "Naples",
  "צרפת": "France",
  "פריז": "Paris",
  "ניס": "Nice",
  "ליון": "Lyon",
  "מרסיי": "Marseille",
  "ספרד": "Spain",
  "ברצלונה": "Barcelona",
  "מדריד": "Madrid",
  "סביליה": "Seville",
  "ולנסיה": "Valencia",
  "יוון": "Greece",
  "אתונה": "Athens",
  "סנטוריני": "Santorini",
  "מיקונוס": "Mykonos",
  "כרתים": "Crete",
  "תאילנד": "Thailand",
  "בנגקוק": "Bangkok",
  "פוקט": "Phuket",
  "צ׳אנג מאי": "Chiang Mai",
  "צ'אנג מאי": "Chiang Mai",
  "וייטנאם": "Vietnam",
  "האנוי": "Hanoi",
  "הו צ'י מין": "Ho Chi Minh City",
  "הו צי מין": "Ho Chi Minh City",
  "טורקיה": "Turkey",
  "איסטנבול": "Istanbul",
  "אנטליה": "Antalya",
  "בריטניה": "England",
  "אנגליה": "England",
  "לונדון": "London",
  "מנצ'סטר": "Manchester",
  "גרמניה": "Germany",
  "ברלין": "Berlin",
  "מינכן": "Munich",
  "המבורג": "Hamburg",
  "הולנד": "Netherlands",
  "אמסטרדם": "Amsterdam",
  "פורטוגל": "Portugal",
  "ליסבון": "Lisbon",
  "פורטו": "Porto",
  "הודו": "India",
  "דלהי": "Delhi",
  "מומבאי": "Mumbai",
  "סין": "China",
  "בייג'ינג": "Beijing",
  "שנחאי": "Shanghai",
  'ארה"ב': "USA",
  "ארהב": "USA",
  "ארצות הברית": "USA",
  "ניו יורק": "New York",
  "לוס אנג'לס": "Los Angeles",
  "לוס אנג׳לס": "Los Angeles",
  "מיאמי": "Miami",
  "לאס וגאס": "Las Vegas",
  "שיקגו": "Chicago",
  "תל אביב": "Tel Aviv",
  "ירושלים": "Jerusalem",
  "דובאי": "Dubai",
  "אבו דאבי": "Abu Dhabi",
  "צ'כיה": "Czechia",
  "פראג": "Prague",
  "הונגריה": "Hungary",
  "בודפשט": "Budapest",
  "אוסטריה": "Austria",
  "וינה": "Vienna",
  "שוויץ": "Switzerland",
  "ציריך": "Zurich",
};

function normalizePlace(name: string): string {
  const trimmed = name.trim();
  if (HE_PLACE_ALIASES[trimmed]) return HE_PLACE_ALIASES[trimmed];
  // try case-insensitive lookup for latin variants
  const lower = trimmed.toLowerCase();
  for (const [k, v] of Object.entries(HE_PLACE_ALIASES)) {
    if (k.toLowerCase() === lower) return v;
  }
  return trimmed;
}

export async function geocodeCity(
  name: string
): Promise<{ lat: number; lng: number } | null> {
  try {
    const q = normalizePlace(name);
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
      q
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

export function weatherForecastUrl(lat: number, lng: number): string {
  return `https://www.windy.com/?${lat},${lng},11`;
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

export type CurrentWeather = {
  temp: number;
  weatherCode: number;
  condition: WeatherCondition;
};

export async function fetchCurrentWeather(
  lat: number,
  lng: number
): Promise<CurrentWeather | null> {
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${lat}&longitude=${lng}` +
      `&current=temperature_2m,weathercode&timezone=auto`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = (await res.json()) as {
      current?: { temperature_2m?: number; weathercode?: number };
    };
    const c = json.current;
    if (!c) return null;
    const code = c.weathercode ?? -1;
    return {
      temp: Math.round(c.temperature_2m ?? 0),
      weatherCode: code,
      condition: getCondition(code),
    };
  } catch {
    return null;
  }
}

