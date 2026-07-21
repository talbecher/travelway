# תיקוני עמוד יום — לפי צילום המסך

מהצילום המובייל מזוהות שלוש בעיות מוחשיות. נגע רק בקבצי ה-UI של עמוד היום — `src/routes/itinerary.$dayId.tsx` (+ `src/components/DayMap.tsx` לתיקון legend/controls במידת הצורך). ללא שינויי לוגיקה.

## 1. יישור ותצוגה במובייל

מה רואים בצילום:
- ה-sticky bottom bar ("חיפוש מהיר…" + כפתור +) חופף לכרטיס האחרון (Hotel RIO Shinjuku נחתך באמצע).
- כפתורי מצב תחבורה (🚶 · 🚆 · 🚗) יוצאים מרוחב המסך — הכפתור האדום מימין נחתך.
- שורת ה-city-chip ("טוקיו · עריכה") מיושרת שמאלה במקום ימין (RTL שבור באזור ה-hero).
- ה-Legend/Focus button של המפה יושבים בפינה — לא נראה בעייתי בצילום זה, אבל ה-zoom control של Leaflet כן חופף.

מה נעשה:
- **Sticky bar** ב-`itinerary.$dayId.tsx`:
  - להפוך את `pb-2` של פאנל הרשימה ל-`pb-[72px]` כדי שהכרטיס האחרון לא ייחתך על ידי ה-bar.
  - להוסיף `pb-[env(safe-area-inset-bottom)]` ל-bar עצמו ולוודא `bg-card` אטום מלא (לא שקוף) כך שלא נראה טקסט "מתחת".
  - להוריד את גובה ה-`PlacesSearch` בתוך ה-bar (input קטן יותר, `h-9` במקום ברירת המחדל) כדי שהכל ייכנס לשורה אחת גם ב-iPhone SE.
- **כפתורי transport** (הבלוק שכולל את "פתח את כל היום בגוגל מפות"):
  - להעביר ל-container `flex-wrap justify-end gap-1.5` כך שכשאין מקום — הכפתורים עוברים לשורה שנייה במקום להיחתך.
  - להקטין padding לכפתורי אייקון (`px-2.5 h-8`) ולהסתיר את הטקסט מתחת ל-`xs` (רק אייקון + tooltip).
- **Hero — city chip RTL**:
  - להוסיף `dir="rtl"` מפורש על ה-wrapper של ה-chip ולוודא שהיישור באמצעות `justify-start` (במקום `inline-flex` שיוצא לשמאל ב-RTL).
- **מפה — zoom control**:
  - ב-`DayMap.tsx`, להעביר את ה-Zoom control ל-`topright` כדי שלא יתנגש עם ה-Focus/Legend buttons שיושבים ב-`bottom-right`.

## 2. בחירת מצב תחבורה (רכב / תחבורה ציבורית / אופניים / רגל)

בצילום רואים שהתחלנו לממש את זה (יש כפתורים "מכונית" ו-"תחבורה") אבל הם לא מסתדרים לרוחב ולא ברור לאיזה link כל אחד מפנה. נשלים:

- **`src/lib/coords.ts`**: לוודא ש-`googleDirectionsUrl` מקבל פרמטר `mode: 'walking' | 'transit' | 'driving' | 'bicycling'` ומצרף `travelmode=<mode>` ל-URL.
- **`src/routes/itinerary.$dayId.tsx`**: 4 כפתורים (🚶 ברגל · 🚆 תח״צ · 🚗 רכב · 🚴 אופניים). כל אחד `<a target="_blank">` ישיר, בלי state. הטקסט של הכפתור הראשי הכללי יוסר (הוא מיותר עכשיו כשיש כפתורים ספציפיים) — הכפתורים עצמם יהיו tooltip + emoji + label במקום המבנה הכפול הנוכחי.

## 3. החזרת label לכפתור "הוסף מההמלצות"

הכפתור הפך ל-"+" בלבד בתוך ה-sticky bar, וזה נבלע ליד ה-PlacesSearch (המשתמש חושב ששניהם אותו דבר).

- להחליף את כפתור ה-"+" בכפתור עם אייקון ⭐ + טקסט "המלצות" (רוחב מינימלי ~92px, `shrink-0`, `bg-[color:var(--accent)] text-white`).
- ה-PlacesSearch לצדו ב-`flex-1`.
- Layout סופי של ה-bar (RTL): `[⭐ המלצות] [חיפוש מהיר בגוגל...]` — שני מרכיבים ברורים, כל אחד עם ייעוד שונה.

## קבצים שיושפעו

- `src/routes/itinerary.$dayId.tsx` — sticky bar, transport buttons, label, padding
- `src/lib/coords.ts` — פרמטר `mode` ב-`googleDirectionsUrl` (אם עוד לא קיים)
- `src/components/DayMap.tsx` — מיקום zoom control
