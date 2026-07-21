## Weather forecast with animated icons

Add weather display across itinerary and home screens using Open-Meteo (free, no API key).

### New files

**`src/lib/weather.ts`**
- Types: `WeatherCondition`, `WeatherDay`.
- `getCondition(code)` — WMO code → condition (mapping per spec).
- `WEATHER_LABELS_HE` — Hebrew label map.
- `geocodeCity(name)` — GET `https://geocoding-api.open-meteo.com/v1/search?name=…&count=1&language=en`, returns `{lat,lng}` or `null`.
- `fetchWeather(lat, lng, startDate, endDate)` — GET `https://api.open-meteo.com/v1/forecast` with daily temps + weathercode + precipitation_sum + `timezone=auto`. Maps arrays → `WeatherDay[]`. Errors → `[]`.

**`src/hooks/use-weather.ts`**
- `useWeather(cityLabel)` — chained `useQuery`s:
  - geocode: `["geocode", cityLabel]`, `staleTime: Infinity`, enabled when city present.
  - forecast: `["weather", lat, lng]`, `staleTime: 3h`, fetches today → today+16d, enabled when coords present.
  - Returns `{ days, loading }`.
- `useDayWeather(cityLabel, date)` — wraps `useWeather`, finds matching day, returns `WeatherDay | null`.

**`src/components/WeatherIcon.tsx`**
- Props `{ condition, size?: "sm"|"md"|"lg" }` (24/40/64 px).
- Inline SVG per condition (sunny, partly-cloudy, cloudy, fog, drizzle, rain, snow, storm, unknown).
- Animations via inline `<style>` scoped to component: `spin-slow`, `float`, `fog-fade`, `rain-fall`, `snow-fall`, `lightning` — with staggered `animation-delay` on drops/flakes.
- Respect `prefers-reduced-motion`.

### Edited files (presentation-only)

**`src/routes/itinerary.index.tsx`**
- For each day card, call `useDayWeather(day.city_label, day.date)`.
- In the card header top-right (LTR corner in RTL layout): small `<WeatherIcon size="sm">` + `{tempMax}°/{tempMin}°`, plus `💧` when `precipitation > 5`.
- Render nothing while loading/absent.
- To keep hooks stable inside the list, wrap the per-card weather in a small child component `DayWeatherBadge({city,date})`.

**`src/routes/itinerary.$dayId.tsx`**
- In the hero, below the date: `<WeatherIcon size="md">` + `{label} · {tempMax}°C / {tempMin}°C`.
- If `precipitation > 5`, small warning pill: `💧 צפוי גשם — בדוק פעילויות חוץ` styled with a subtle accent background.

**`src/routes/index.tsx`**
- Derive city from the trip's first itinerary day's `city_label` and today's date (or trip start date if in future).
- Only render when target date is within 16 days from today.
- Add a chip to the quick stats row: `<WeatherIcon size="sm">` + `{tempMax}° {label}`.

### Guarantees

- No DB, auth, mutation, or existing-query changes.
- Weather is purely additive; API failure leaves the UI unchanged.
- All network calls are unauthenticated public Open-Meteo endpoints; no secrets.
