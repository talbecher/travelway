# הצעת החלפת יום מהצ׳אט + אישור באפליקציה — תיקון פערים

היקף: החלפת יום בודד בלבד. אין שינוי ב-`prepare_day_replace`, ב-`replace_day_entries` או בהרשאות שלהם.

## 1. הרשאה נפרדת ליצירת הצעה
- ל-`api_tokens` תתווסף עמודה `scopes text[] NOT NULL DEFAULT '{read}'`. כל הטוקנים הקיימים נשארים `read` בלבד.
- אפשר לסמן טוקן חדש ב-`/ai-access` ב„הגשת הצעות ליום” (`propose_day`) רק כשהוא מוגבל לטיול אחד (`trip_id` חובה). לא ניתן להוסיף את ההרשאה לטוקן קיים; צריך ליצור טוקן חדש.
- `POST /api/public/day-proposals` מחזיר 403 אם בטוקן אין `propose_day` או אם `trip_id` שלו שונה מהטיול בבקשה. את זה בודק ה-RPC בשרת, לא רק הקוד שמטפל בבקשה.

## 2. חישוב מצב היום ביצירת הצעה (בלי auth.uid)
- RPC חדש `api_create_day_proposal(_hash, _trip_id, _day_id, _entries)` מסוג SECURITY DEFINER. ההרשאה ניתנת ל-`service_role` בלבד, כמו `api_resolve_token`.
- הסדר בתוכו:
  1. אימות הטוקן דרך אותה לוגיקה של `api_resolve_token`: hash, תוקף, ביטול, scope, ובעלות או שיתוף פעילים.
  2. בדיקה ש-`day_id` שייך ל-`trip_id` המאושר.
  3. בדיקת מגבלות גודל.
  4. חישוב ה-fingerprint ורשימת התחנות המוגנות דרך העזרים המשותפים הקיימים `_day_replace_fingerprint` ו-`_day_replace_rows`.
- כך אין שכפול של כללי השימור וה-fingerprint, ואין הנחה ש-`prepare_day_replace` ירוץ דרך admin.
- מגבלה: אם העזרים ייכתבו מחדש בעתיד, צריך לבדוק שהם עדיין לא תלויים ב-`auth.uid()`. בדיקה ייעודית מכסה את זה.

## 3. טבלת הצעות ללא עריכה מהלקוח
- `day_replace_proposals`: `id`, `trip_id`, `day_id`, `token_id`, `request_id` (קבוע ונוצר בשרת), `entries jsonb`, `entry_count`, `fingerprint`, `status` (`pending`/`rejected`/`expired`/`superseded`), `expires_at` (72 שעות), `created_at`.
- הרשאות: למשתמש מחובר יש SELECT בלבד, דרך `can_access_trip(trip_id)`. אין INSERT, UPDATE או DELETE ללקוח. ל-`service_role` יש הכל.
- פעולות מצומצמות דרך RPC בלבד:
  - `apply_day_proposal(_proposal_id)` לאישור.
  - `reject_day_proposal(_proposal_id)` לדחייה.
  - `reconfirm_day_proposal(_proposal_id)` לאישור מחודש אחרי שהיום השתנה.

  כל אחת בודקת `can_access_trip`, שה-`day_id` שייך ל-`trip_id`, ושהמעבר מותר.
- כתיבה לטבלה אפשרית רק כשהדגל המקומי מוגדר בתוך ה-RPCs האלה, ונאכפת בטריגר. זה אותו דפוס שקיים ב-`day_replace_runs`.

## 4. אישור מחיל רק את התוכן השמור
- `apply_day_proposal` רץ כ-SECURITY INVOKER עם ה-session של המשתמש. הוא:
  1. קורא את ההצעה עם נעילה (`FOR UPDATE`).
  2. בודק שהיא `pending`, שלא פג תוקפה, ושהטוקן שיצר אותה לא בוטל ולא פג.
  3. קורא ל-`replace_day_entries(day_id, proposal.fingerprint, proposal.request_id, proposal.entries, ...)`.
- הלקוח שולח רק `proposal_id`. לא נשלחים תחנות, סטטוס או fingerprint.

## 5. עקביות ומניעת ביצוע כפול (בלי מערכת ניסיונות חדשה)
- ה-`request_id` של ההצעה עובר כמו שהוא ל-`replace_day_entries`, כך ש-`day_replace_runs` הקיים ממשיך לבד לטפל בניסיונות חוזרים.
- הסטטוס `applied` לא נשמר בהצעה. מחושב מ-`day_replace_runs` לפי `request_id`: run במצב done פירושו הוחל.
- לכן אם התשובה אבדה, או אם שלב מאוחר נכשל, התצוגה עדיין משקפת את מה שקרה בפועל. ניסיון חוזר עם אותו `request_id` מחזיר את התוצאה הקיימת (`already_applied`) ולא מחליף שוב.
- מגבלה: החלפת היום והקריאה ל-run מתבצעות באותה טרנזקציה. עם זאת, מכשיר אחר באותו רגע עלול לקבל `day_changed` או `already_applied` במקום תוצאה זהה. זה מכוסה ולא מוסתר.

## 6. אם היום השתנה
- `replace_day_entries` מחזיר `day_changed`, ושום דבר לא משתנה ביום.
- המסך מציג השוואה מעודכנת מול מצב היום הנוכחי. ה-fingerprint לא מתעדכן אוטומטית.
- רק לחיצה מפורשת של המשתמש תפעיל את `reconfirm_day_proposal`. הוא מחשב fingerprint חדש בשרת, מייצר `request_id` חדש, ומסמן את הניסיון הקודם כ-`superseded`.
- רק אחר כך אפשר לאשר שוב, וגם זה בלחיצה נוספת.

## 7. קישור ותצוגה
- הצ׳אט מקבל קישור `/day-proposals/$id` במסך שדורש התחברות. פתיחת הקישור מציגה בלבד ולא כותבת כלום.
- מגבלות: גוף הבקשה עד 64KB, עד 40 תחנות, כותרת עד 200 תווים, עד 20 הצעות ממתינות לטיול.
- התחנות נבדקות בשרת באותו מפענח של מצב היום מ-`ai-import`.
- מסך האישור משתמש מחדש בתצוגת ההחלפה הקיימת: יום ותאריך, כמה תחנות יוסרו, יישמרו ויתווספו, והודעת הגיבוי.
- ללא השלמות Google.

## קבצים
- מיגרציה: עמודת `scopes`, הטבלה, הטריגר, ושלושה RPCs: `api_create_day_proposal`, `apply_day_proposal`, `reject_day_proposal`/`reconfirm_day_proposal`.
- `src/routes/api/public/day-proposals.ts`: POST עם PAT ובדיקת zod.
- `src/routes/api/public/openapi.json.ts`: הוספת פעולת POST.
- `src/routes/_authenticated/day-proposals.$id.tsx`: מסך התצוגה והאישור.
- `src/routes/ai-access.tsx`: בחירת הרשאת `propose_day` ביצירת טוקן.
- `src/lib/ai-import.ts` ו-`src/components/ImportAISheet.tsx`: הוצאת רכיב תצוגת האישור לשימוש משותף, בלי לשנות את ההתנהגות.

## בדיקות חיוניות (בטיול בדיקה, ללא דפדפן וללא Google)
1. טוקן `read` קיים: POST נדחה (403).
2. טוקן `propose_day` של טיול אחר, או `day_id` מטיול אחר: נדחה.
3. דרך REST כמשתמש משותף: INSERT, UPDATE ו-DELETE על ההצעות נחסמים.
4. אישור מחיל את התוכן השמור בלבד. קריאה חוזרת מחזירה `already_applied`, והתצוגה מראה „הוחל” לפי ה-run.
5. שינוי ביום אחרי יצירת ההצעה: `day_changed`, היום ללא שינוי. אחרי `reconfirm` ואישור נוסף ההחלפה מצליחה.
6. טוקן מבוטל או הצעה שפג תוקפה: האישור נדחה.
7. חריגה ממגבלת הגודל או מספר התחנות: נדחה.
8. GET לקישור לא משנה אף שורה.
9. tsgo ו-build.
