# Fix: תמונת ההמלצה לא נשמרת ב־day_entries

## סיבה מאומתת
`addRecommendationToDay` ב־`src/lib/recommendations.ts` לא כולל `photo_url` ב־`insert`, ולכן כל הוספה של המלצה למסלול (בודדת או מרובה) יוצרת רשומה בלי תמונה — גם אם ההמלצה עצמה כוללת `photo_url`. גם הקריאה ב־`addSelected` (bulk) לא מעבירה את שדה התמונה.

## שינויים

### 1. `src/lib/recommendations.ts`
- להוסיף `photo_url?: string | null` לטיפוס הפרמטר של `addRecommendationToDay`.
- להוסיף `photo_url: rec.photo_url ?? null` באובייקט ה־`insert` ל־`day_entries`.

### 2. `src/routes/itinerary.$dayId.tsx` (`SavedRecsPicker.addSelected`, ~שורה 1875)
- להעביר `photo_url: (r.photo_url as string | null) ?? null` בקריאה ל־`addRecommendationToDay`.
- לוודא שה־`SELECT` של pool כבר מחזיר `photo_url` (כן, שורה 923).

## ללא שינוי
- אין שינויי DB, אין תלויות חדשות, אין שינוי בסדר או ב־UI.
- backfill לרשומות קיימות בלי תמונה — לא נעשה בשינוי הזה (נוסיף רק אם תבקש).
