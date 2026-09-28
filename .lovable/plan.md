# מקור ייבוא להמלצות מ־Google My Maps

## מה המשתמש יקבל
- בייבוא מפה: שדה חובה „שם המקור” (ברירת מחדל: שם המפה מה־KML אם קיים, אחרת ריק).
- בעמוד ההמלצות: מסנן „מקור” — „הכול” + המפות שיובאו לטיול הפעיל. מוצג רק אם יש לפחות מקור אחד.
- המסנן פועל יחד עם חיפוש, עיר, קטגוריה ו„חדשים מ־Discover”, לפני חיתוך ה־40, ומשפיע גם על המפה ועל בחירה מרובה.
- על כרטיס: תווית קטנה „מ־{שם המקור}”; כשיש כמה — המקור הראשון ו„+N” עם title/aria-label של כל השמות.
- המלצות ישנות ללא קשר — מופיעות רק ב„הכול”, בלי תווית.

## מבנה נתונים (מיגרציה חדשה ומתועדת)
```text
import_sources            recommendation_sources
- id                      - recommendation_id -> recommendations ON DELETE CASCADE
- trip_id -> trips CASCADE- source_id -> import_sources ON DELETE CASCADE
- name (not empty)        - created_at
- kind default 'google_my_maps'   PK (recommendation_id, source_id)
- source_url, created_at
```
- מחיקת מקור מוחקת רק קשרים, לא המלצות. מחיקת המלצה מנקה את קשריה.
- GRANT ל־authenticated/service_role, RLS: import_sources דרך can_access_trip(trip_id); recommendation_sources — רק אם גם ההמלצה וגם המקור שייכים לאותו טיול נגיש (בדיקת EXISTS בשני הצדדים + אותו trip_id).
- אינדקסים: import_sources(trip_id), recommendation_sources(source_id).

## זרימת ייבוא
1. `fetchMyMapKml` מחזיר גם את שם המפה (Document.name) — כשדה נוסף, בלי לשנות את רשימת המקומות.
2. בשמירה: יצירת שורת import_sources, הכנסת ההמלצות עם `.select("id")`, ואז הכנסת הקשרים.
3. „אותה המלצה בכמה מקורות”: לפני ההכנסה, מקום שכבר קיים בטיול עם שם זהה (ללא רישיות/רווחים) ובמרחק של עד כ־50 מ' — לא נוצר מחדש, רק מקושר למקור החדש (קשרים קודמים נשמרים, upsert עם ignoreDuplicates). הנתונים של ההמלצה הקיימת לא משתנים.
4. אם הכנסת הקשרים נכשלת — ההמלצות נשארות, מוצגת שגיאה ברורה. רענון `["recs"]` ו־`["rec-sources", tripId]`.

## עמוד ההמלצות
- שאילתה חדשה `["rec-sources", tripId]`: מקורות הטיול + מפת recId → שמות מקורות (שאילתה אחת נוספת, לא לכל כרטיס).
- state `source` ("all" | id) שמתאפס במעבר טיול; מסנן נוסף ב־visibleIds, mapPins ו־PlacesList (וב־useEffect שמאפס את ה־limit).
- תווית בכרטיס מקבלת את השמות כ־prop מהרשימה.
- ללא שינוי: הוסף ליום, מיקום, שאר השדות, מנגנון 40, עיצוב כללי.

## פרטים טכניים
- קבצים: מיגרציה חדשה, `src/lib/maps-import.functions.ts`, `src/components/ImportFromMyMapsSheet.tsx`, `src/hooks/use-trip.ts` (recSourcesQuery), `src/routes/recommendations.tsx`.
- מחיקה מרובה ומחיקת המלצה בודדת: invalidation גם ל־`["rec-sources"]`.

## בדיקות
- bunx tsgo --noEmit, bun run build.
- בדיקת SQL מול המסד: טיול ללא מקורות מחזיר 0 קשרים (נתונים ישנים לא מקבלים שיוך).
- אימות בקוד שהמסנן משולב בשלושת המסלולים (רשימה, מפה, בחירה). לחשבון הבדיקה אין טיול, לכן בדיקת דפדפן תדווח כלא בוצעה אם לא יתאפשר.
