## הבעיה
1. צ'יפ מזג האוויר לא מוצג כי `Open-Meteo geocoding` לא מכיר עברית. `יפן` ו-`טוקיו` מחזירים 0 תוצאות; רק `Japan`/`Tokyo` מחזירים lat/lng.
2. גם כשיוצג — אין דרך לראות תחזית קדימה. המשתמש רוצה שקליק יפתח את מקור התחזית בטאב חדש.

## הפתרון

### 1. `src/lib/weather.ts`
- הוספת מילון `HE_PLACE_ALIASES` (עברית→אנגלית) עם המדינות/הערים הנפוצות: יפן→Japan, טוקיו→Tokyo, קיוטו→Kyoto, אוסקה→Osaka, איטליה→Italy, רומא→Rome, מילאנו→Milan, פירנצה→Florence, ונציה→Venice, צרפת→France, פריז→Paris, ספרד→Spain, ברצלונה→Barcelona, מדריד→Madrid, יוון→Greece, אתונה→Athens, תאילנד→Thailand, בנגקוק→Bangkok, וייטנאם→Vietnam, טורקיה→Turkey, איסטנבול→Istanbul, בריטניה/אנגליה→England, לונדון→London, גרמניה→Germany, ברלין→Berlin, הולנד→Netherlands, אמסטרדם→Amsterdam, פורטוגל→Portugal, ליסבון→Lisbon, הודו→India, סין→China, ארה"ב→USA, ניו יורק→New York, תל אביב→Tel Aviv.
- `geocodeCity`: לפני הקריאה ל-API, לתרגם דרך המילון (case/trim insensitive).
- ייצוא helper חדש `openMeteoForecastUrl(lat, lng)` שמחזיר URL ל-`https://open-meteo.com/en/docs?latitude=...&longitude=...` (דף התחזית הרשמי החינמי).

### 2. `src/hooks/use-weather.ts`
- `useCurrentWeather` יחזיר גם `lat`/`lng` (לא רק condition/temp), כדי שהקומפוננטה תוכל לבנות קישור.
- הוספת fallback: אם הכתובת הראשונה לא נמצאה, ננסה fallback (`useCurrentWeather(city, fallback)`).

### 3. `src/routes/index.tsx` — `HeroCard`
- להעביר גם `trip.destination_country` כ-fallback ל-Hook.
- לעטוף את הצ'יפ ב-`<a href={openMeteoForecastUrl(lat, lng)} target="_blank" rel="noreferrer">` עם `title="לתחזית מלאה"` ואייקון `ExternalLink` קטן ליד הטמפ' כדי להבהיר שזה קליקבילי.
- אם אין lat/lng — הצ'יפ ייעלם (במקום להציג בלי לינק).

### תוצאה
בכרטיס ה-Hero יופיע צ'יפ עם אייקון מזג אוויר + טמפ' + חץ יציאה; קליק פותח בטאב חדש את דף Open-Meteo עם lat/lng של היעד ותחזית מלאה קדימה.
