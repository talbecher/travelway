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

## השלמות לפני יישום

### הרשאות apply/reject/reconfirm (session רגיל, SELECT בלבד)
- `FOR UPDATE` דורש הרשאת UPDATE, ולכן לא ירוץ ב-INVOKER. לכן הנעילה והקריאה יתבצעו ב-helper מסוג SECURITY DEFINER בשם `_proposal_claim(_id, _seen_fingerprint)`. ל-authenticated תינתן הרשאת EXECUTE בלבד.
- `_proposal_claim` יבדוק `can_access_trip(trip_id)` לפי `auth.uid()` של ה-session. הוא יבדוק גם `day_id ∈ trip_id`, `status='pending'`, `expires_at > now()`, ושהטוקן לא בוטל ולא פג. את הטוקן הוא קורא כבעלים, והלקוח אינו מקבל גישה ל-`api_tokens`. אחר כך הוא נועל את השורה `FOR UPDATE` ומחזיר `day_id`, `entries`, `fingerprint` ו-`request_id`.
  - הנעילה נשמרת עד סוף הטרנזקציה, גם אחרי שה-helper חוזר.
  - אם המשתמש יקרא ל-helper ישירות, הוא רק קורא נתונים שכבר גלויים לו ונועל לרגע.
- `apply_day_proposal` עצמו רץ כ-SECURITY INVOKER. הוא קורא ל-`_proposal_claim`, ואז ל-`replace_day_entries` כמשתמש, עם התוכן השמור. ההרשאות של `replace_day_entries` לא משתנות.
- `reject_day_proposal` ו-`reconfirm_day_proposal` יהיו SECURITY DEFINER עם אותן בדיקות. כל אחד מבצע מעבר אחד מוגדר ולא מקבל שדות תוכן.
- ללקוח אין INSERT, UPDATE או DELETE על הטבלה. הטריגר עם הדגל הוא רק הגנה נוספת ולא מעניק הרשאה. ה-DEFINER הוא שמאפשר את הכתיבה, ורק דרך שלוש הפונקציות.

### אישור מחודש בלי לרענן מאחורי הקלעים
- `get_day_proposal_view(_id)` (DEFINER, קריאה בלבד) מחזיר את ההשוואה מול המצב הנוכחי ואת `current_fingerprint` שלפיו חושבה ההשוואה. הוא מבוסס על `_day_replace_rows` ו-`_day_replace_fingerprint`.
- הלקוח שולח את ה-fingerprint שהוצג לו כ-`_seen_fingerprint`.
- `reconfirm_day_proposal(_id, _seen_fingerprint)`:
  - מחשב מחדש את המצב הנוכחי. אם הוא שונה מ-`_seen_fingerprint`, מחזיר `day_changed` עם השוואה חדשה ולא משנה דבר.
  - אם קיים כבר run שהסתיים עבור `request_id` הנוכחי, מחזיר `already_applied`.
  - אחרת: שומר `fingerprint = _seen_fingerprint`, מעביר את ה-`request_id` הקודם ל-`superseded_request_ids uuid[]` ומייצר `request_id` חדש. הסטטוס נשאר `pending`.
- אחר כך האישור עובר דרך `replace_day_entries` עם ה-fingerprint שהוצג. אם היום השתנה שוב בינתיים, מתקבל `day_changed` ושום דבר לא מוחל.
- הצגת הסטטוס בודקת את כל ה-`request_id`, כולל הקודמים, מול `day_replace_runs`, כדי שהחלה ישנה לא תיעלם.

### תוקף
- `expires_at` נבדק בקריאה (`get_day_proposal_view`) ובאישור (`_proposal_claim`, `reconfirm`). אין תהליך מתוזמן.
- הסטטוס המוצג מחושב: הצעה `pending` שעבר תוקפה מוצגת כ„פג תוקף” וחסומה לפעולה.
- מכסת 20 ההצעות סופרת רק הצעות `pending` שתוקפן לא עבר ושאין להן run שהסתיים.

### אימות: מה נבדק איפה
- **TypeScript (בקוד שמטפל בבקשה):** zod על המבנה, גודל הבקשה, והמפענח הקיים של מצב היום מ-`ai-import`. כך ההודעות לצ׳אט ברורות.
- **RPC (`api_create_day_proposal`):**
  - בדיקות הרשאה: scope, ה-trip של הטוקן, ש-`day_id ∈ trip_id`.
  - מגבלות: `jsonb_array_length ≤ 40`, `octet_length(entries::text) ≤ 65536`, `title` לא ריק ועד 200 תווים, `entry_type` מתוך ה-enum, ושדות לפי החוזה הקיים בלבד. שדות לא מוכרים נזרקים.
  - מכסת ההצעות.
- **באישור:** `replace_day_entries` מריץ שוב את האימות הקיים שלו.
- **תצוגה:** כותרות והערות מוצגות כטקסט פשוט, בלי HTML ובלי המרה אוטומטית לקישורים. מותר שיופיעו בהן קישורים כטקסט. שדות קישור שכבר קיימים בחוזה, כמו `google_maps_url`, נפתחים כקישור רק כשהם http/https.

### מגבלות ידועות
- אם התשובה אבדה בין `reconfirm` לבין האישור, ההצעה נשארת `pending` עם ה-fingerprint החדש. האישור הבא יבדוק אותו שוב.
- שני מכשירים שמאשרים במקביל: אחד מחיל, והשני מקבל `already_applied` או `day_changed`.

### בדיקות חיוניות נוספות
1. משתמש משותף רגיל: apply, reject ו-reconfirm עובדים. INSERT/UPDATE ישירים דרך REST נחסמים.
2. הצעה `pending` שתוקפה עבר: התצוגה מראה „פג תוקף”, apply ו-reconfirm נדחים, והיא לא נספרת במכסה.
3. שינוי ביום בין הצגת ההשוואה לאישור:
   - מתקבל `day_changed` והיום לא משתנה.
   - `reconfirm` עם fingerprint ישן נדחה.
   - `reconfirm` עם ה-fingerprint שהוצג ואחריו אישור: ההחלפה מצליחה פעם אחת, והקריאה החוזרת מחזירה `already_applied`.

## תיקונים אחרונים (מאושרים)

### מה נחשב כהחלה של הצעה
- `applied` פירושו שקיים ב-`day_replace_runs` run עם `status='done'` עבור ה-`request_id` הנוכחי או עבור אחד מ-`superseded_request_ids`. במקרה הזה התשובה היא `already_applied`.
- run עם `day_changed` אינו הצלחה. ההצעה נשארת `pending`, אפשר לבצע `reconfirm`, והיא ממשיכה להיספר במכסת הממתינות.
- כל הבדיקות (apply, reconfirm, תצוגה ומכסה) משתמשות בפונקציה פנימית אחת, `_proposal_done(_id)`, שבודקת run במצב `done` על כל ה-request_ids של ההצעה.

### נעילות
- `_proposal_claim`, `reject_day_proposal` ו-`reconfirm_day_proposal` פועלות באותו סדר:
  1. `SELECT ... FROM public.day_replace_proposals WHERE id=_id FOR UPDATE`. נועלים קודם, לפני כל בדיקה.
  2. רק אחר כך בודקים מחדש את `can_access_trip`, `day_id ∈ trip_id`, `status='pending'`, `expires_at > now()`, `_proposal_done`, ושהטוקן לא בוטל ולא פג.
- בגלל הסדר הזה, דחייה, אישור ואישור מחודש שמגיעים במקביל ייבדקו כל אחד מול המצב שאחרי ההמתנה לנעילה.

### apply ו-`_seen_fingerprint`
- החתימה: `apply_day_proposal(_id uuid, _seen_fingerprint text)`.
- `_proposal_claim` דוחה עם `stale_view` אם `_seen_fingerprint <> proposal.fingerprint`. כלומר המשתמש ראה השוואה אחרת מזו שההצעה שמורה עליה, למשל כי בוצע `reconfirm` ממכשיר אחר.
- התחנות, ה-fingerprint וה-request_id שמבוצעים נלקחים תמיד מההצעה השמורה. `_seen_fingerprint` משמש לבדיקת התאמה בלבד.
- אם היום עצמו השתנה, `replace_day_entries` יחזיר `day_changed`.

### כל פונקציית SECURITY DEFINER חדשה
- `SET search_path = public`, ושמות טבלאות מלאים (`public.x`).
- בדיקה ש-`auth.uid() IS NOT NULL`, ובדיקה מפורשת של `can_access_trip`.
- `REVOKE EXECUTE ... FROM PUBLIC, anon` בכל אחת.
  - ל-`authenticated`: רק הפונקציות שהמשתמש צריך להריץ (`_proposal_claim` דרך `apply`, `reject`, `reconfirm`, `get_day_proposal_view`).
  - `api_create_day_proposal` ל-`service_role` בלבד. היא בודקת את הטוקן במקום את `auth.uid`.

### בדיקה נוספת
apply מחזיר `day_changed` → ההצעה עדיין `pending` ונספרת במכסה → reconfirm עם ה-fingerprint שהוצג מצליח → apply מחיל פעם אחת → apply חוזר מחזיר `already_applied` (גם דרך ה-request_id הקודם).

### דיווח
בסיום יופרדו מה שהורץ (בדיקות SQL ו-REST בטיול בדיקה, tsgo, build) ממה שנבדק בקוד בלבד (ממשק). ללא Google וללא דפדפן.
