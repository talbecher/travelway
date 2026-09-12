# החלפת תמונת היעד האוטומטית ל־Pexels

## מה ישתנה

מקור תמונת האווירה בפתיחת הבית בזמן טיול פעיל יוחלף מ־Google Places ל־Pexels. הקרדיט שמוצג היום מעל התמונה יוסר לגמרי.

סדר הבחירה נשאר כפי שהוא:

1. תמונה תקינה מתחנות היום (ללא שינוי).
2. חיפוש Pexels לפי עיר היום + יעד.
3. חיפוש Pexels לפי היעד בלבד.
4. תמונת האווירה המקומית הקיימת.
5. הגרדיאנט הקיים.

## מפתח

המפתח שנשלח בצ'אט יישמר כסוד בשם `PEXELS_API_KEY` ויקרא רק בצד השרת, בתוך ה־handler. הוא לא ייכנס לקוד ולא ייחשף ללקוח. מומלץ להחליף אותו אצל Pexels אחרי ההטמעה, מאחר שנשלח בצ'אט גלוי.

## פרטים טכניים

### `src/lib/places.functions.ts`

- `getDestinationPhoto` (שורות 417-471) יוחלף במימוש Pexels; העוזרים ששימשו אותו בלבד (`searchDestinationPlace`, `isGeographic`, `componentsMatch`, `rankPhotos`, `resolvePhotoUri`, טיפוסי הייחוס) יימחקו אם אינם בשימוש אחר. `searchPlaces` / `getPlacePhotoUrl` של המקומות נשארים ללא שינוי.
- אותה חתימה: `.middleware([requireSupabaseAuth])`, קלט `{ city?: string | null; destination: string }`.
- עד שתי בקשות ל־`https://api.pexels.com/v1/search` עם כותרת `Authorization: <PEXELS_API_KEY>`, `orientation=landscape`, `per_page=5`: ראשונה `"<city> <destination> cityscape"`, שנייה `"<destination> landscape travel"`.
- מחזירה `{ url: string | null }` בלבד — גודל `large` (מתאים לפתיחה במובייל), ללא ייחוס.
- חוסר מפתח, שגיאת רשת, סטטוס לא תקין או תוצאה ריקה → `{ url: null }` בשקט, ללא חריגה.

### `src/components/home/ActiveTripHero.tsx`

- ה־`useQuery` הקיים נשאר עם אותם תנאי `enabled` (מועמדי היום מוצו, יש חיבור, יש יעד) ואותו `queryKey` לפי עיר+יעד, כך שהחלפת יום/טיול מתעלמת מתשובה ישנה ואין בקשות כפולות.
- מוסרים: `attributions`, `showsPlacesPhoto`, ותג הקרדיט בתחתית הפתיחה.
- נשמרים: סדר הגיבויים, טיפול בכשל טעינת תמונה, מזג האוויר, הטקסטים והמבנה.

### `src/routes/index.tsx`

ללא שינוי נדרש מעבר לוודא שהפרופים הקיימים (`destination`, `city`) עדיין מועברים בענף הפעיל.

## מה לא משתנה

תמונות תחנות היום, חיפוש Google Places, מזג האוויר, הנתונים, ה־DB, התלויות והבית שלפני/אחרי הטיול.

## בדיקות

בנייה ובדיקת טיפוסים בלבד.
