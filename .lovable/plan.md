# ייבוא המלצות מ-Google My Maps

הוספת אפשרות לייבא בקבוצה מקומות ממפה ציבורית של Google My Maps אל טבלת ההמלצות.

## איפה מוסיפים

- **`src/routes/recommendations.tsx`** — כפתור נוסף "ייבוא ממפה" ליד ה-FAB הקיים; פותח BottomSheet חדש.
- **`src/lib/maps-import.functions.ts`** (חדש) — server function שמוריד ומפרסר את ה-KML.
- **`src/components/ImportFromMyMapsSheet.tsx`** (חדש) — רכיב ה-BottomSheet עם 3 השלבים (URL → תצוגה מקדימה → מיפוי קטגוריה).

## Server function: `fetchMyMapKml`

Input: `{ url: string }`. שלבים בתוך ה-handler:

1. חילוץ `mid` מ-`URLSearchParams` — אם חסר, זורק שגיאה ידידותית.
2. `fetch("https://www.google.com/maps/d/kml?mid=<mid>", { headers: { "User-Agent": "Mozilla/5.0" } })` עם `AbortController` וטיים-אאוט 10s.
3. פרסור עם `fast-xml-parser` (להוסיף כתלות עם `bun add fast-xml-parser`). מעבר על כל `<Placemark>`:
   - `name`, `description` (עם פס' HTML tags בסיסי),
   - `<coordinates>` בפורמט `lng,lat[,alt]` → מומר למספרים; אם לא תקין, המקום מסומן `hasCoords: false`,
   - `<styleUrl>` / `<Style><IconStyle><Icon><href>` → מיפוי צבע/סוג ל-`suggested_type` (`food`/`attraction`/`hotel`) בעזרת מילון מחרוזות (`red|restaurant|dining` → food, `lodging|hotel|yellow` → hotel, ברירת מחדל attraction).
4. מחזיר מערך של `{ name, description, latitude, longitude, suggested_type, google_maps_url, hasCoords }`.

שגיאות מוחזרות כ-`throw` עם הודעות בעברית שה-UI יציג ישירות (URL לא תקין, KML ריק, fetch נכשל).

## ה-BottomSheet — 3 שלבים

**שלב 1 · URL:** כותרת "ייבוא מ-Google My Maps", סאב-טייטל "הדבק לינק של מפה ציבורית", Input עם placeholder, כפתור "המשך".

**שלב 2 · תצוגה מקדימה:** ספינר בזמן fetch; רשימת מקומות עם `Checkbox` לכל שורה (שם, סניפט תיאור, אינדיקטור קואורדינטות ✅/⚠️). מקומות בלי קואורדינטות מסומנים אבל ניתנים לבחירה (יישמרו עם `latitude/longitude = null`). כפתורי "בחר הכל" / "בטל הכל". תחתית: "המשך (N)".

**שלב 3 · מיפוי קטגוריה:** שאלה "לאיזה קטגוריה לשייך את המקומות?" עם שלושה pills: 🍜 אוכל / ⛩ אטרקציה / 🏨 לינה (בחירה יחידה, ברירת מחדל = הסוג הכי נפוץ מה-`suggested_type`). שדה טקסט "עיר" — תג עיר ברירת מחדל לכל המקומות. כפתור "ייבא N מקומות".

**שמירה:** `supabase.from("recommendations").insert(rows)` בקריאה אחת — כל שורה עם `trip_id: TRIP_ID`, `type` שנבחר, `city` שהוזנה, `name`, `notes = description`, `latitude`, `longitude`, `google_maps_url`, `status: "wishlist"`. אחר כך `queryClient.invalidateQueries({ queryKey: ["recs"] })`, טוסט הצלחה, וסגירת ה-sheet.

## טיפול בשגיאות (טוסטים)

- URL לא של My Maps → "הלינק לא נראה כמו Google My Maps".
- fetch נכשל / KML ריק → "לא ניתן לייבא — ודא שהמפה ציבורית".
- 0 Placemarks → "לא נמצאו מקומות במפה זו".
- insert חלקי (שגיאה מהשרת) → מציג את הודעת השגיאה מ-Supabase.

## פרטים טכניים

- `fast-xml-parser` להוסיף כ-dependency (נמצא כבר? אבדוק ב-build; אם לא — `bun add fast-xml-parser`).
- ה-server function נקרא מהלקוח דרך `useServerFn` — לא דורש `requireSupabaseAuth` (הפעולה עצמה — ה-insert — רצה עם ה-client האותנטי הקיים ו-RLS מגן).
- אין שינויים בסכמה: `recommendations` כבר מכיל `latitude`, `longitude`, `notes`, `city`, `status`.
- אין שינוי ב-`onboarding` / `itinerary` / קבצים אחרים.
