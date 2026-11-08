# תיקון אובדן מיקומים בהצעות החלפת יום מהצ'אט

## מצב נוכחי (נבדק בקוד)
- `normalizeProposalEntries` (`src/lib/day-proposals.server.ts`) מחזיר רק 6 שדות; המיקום נזרק כבר בשרת.
- `api_create_day_proposal` דוחה כל מפתח מחוץ ל־`entry_type, title, description, time_of_day, location_name, icon_emoji`.
- עמודת `fingerprint` בהצעה היא **טביעת מצב היום** (`_day_replace_fingerprint`), לא טביעת התוכן. התוכן (`entries`) מוגן מפני שינוי בטריגר `day_replace_proposals_guard`, ולכן "מה שהוצג = מה שמוחל" כבר נשען על אי־שינוי התוכן.
- `apply_day_proposal` מעביר את `entries` השמור ל־`replace_day_entries` כמו שהוא.

## הגישה
המיקום נקבע **פעם אחת, בעת יצירת ההצעה**, ונשמר בתוך התוכן הבלתי־ניתן לשינוי. המסך מציג את התוכן הזה, והאישור מחיל אותו כפי שהוא. אין חישוב מחדש בזמן הצפייה או ההחלה.

### 1. שדות מיקום שהצ'אט יכול לשלוח (אופציונליים)
- `latitude`, `longitude`: יתקבלו רק כזוג מלא, כמספרים סופיים בטווח (‎-90..90 / ‎-180..180), כשהזוג אינו 0,0. זוג חלקי, לא מספרי או מחוץ לטווח: **ההצעה נדחית** (`invalid_entries`) עם אינדקס התחנה. אין השמטה שקטה.
- `google_maps_url`: נשמר רק אם `resolveDayLocation` מזהה בו יעד מפורש ותקין: https, מארח google.com/maps או maps.google.com, `query`/`destination` מסוג lat,lng או `place_id`. קישורים מקוצרים, קואורדינטות viewport (`@`) או מארח אחר: השדה נזרק ומסומן כ"חסר". זה לא גורם לדחיית ההצעה.
- נאכף בשתי שכבות: zod/פרסר בשרת, ו־allowlist + בדיקות טווח ב־`api_create_day_proposal`.

### 2. שימור מיקום קיים: התאמה מדויקת בלבד
כשהצ'אט לא שלח מיקום לתחנה, `api_create_day_proposal` בודק את שורות היום הנוכחי:
- התאמה רק כש־`lower(btrim(title))` **וגם** `lower(btrim(coalesce(location_name,'')))` זהים, וכשיש **בדיוק** שורה תואמת אחת עם מיקום תקין. מועתקים `latitude`, `longitude` ו־`google_maps_url` של אותה שורה.
- שם שונה, מיקום שונה, או כמה שורות תואמות: לא מועתק דבר, והמקור מסומן "חסר". אין התאמה משוערת ואין Google.
- מיקום שהצ'אט סיפק במפורש גובר על השימור.
- לכל תחנה נשמר מקור: `existing` / `ai` / `missing`. המקור נשמר בעמודה נפרדת `location_sources text[]`, ולא בתוך `entries`, כדי ש־`replace_day_entries` יקבל בדיוק את המפתחות שהוא כבר מכיר.

**הבחנה בין שתי הטביעות:**
- `fingerprint` (מצב היום): ללא שינוי. ממשיך לזהות שינויים ביום, ו־`reconfirm` עובד כמו היום.
- התוכן (`entries` + `location_sources`): נקבע ביצירה. הטריגר הקיים יורחב כך שגם `location_sources` לא ניתן לשינוי. אם היום השתנה אחרי יצירת ההצעה, הקואורדינטות שנשמרו הן עדיין אלה שהמשתמש רואה, ואחרי reconfirm הן מוחלות כמו שהוצגו.

### 3. מסך האישור (`/day-proposals/$id`)
- תג קטן לכל תחנה: "מיקום נשמר מהיום הקיים", "מיקום מהצ'אט" או "ללא מיקום". בשורת הסיכום יופיע מספר התחנות ללא מיקום.
- ללא שינוי בכפתורים ובזרימה. האישור ממשיך לשלוח רק את `_seen_fingerprint`, והשרת מחיל את התוכן השמור.

### 4. OpenAPI / GPT Action
- הוספת `latitude`, `longitude` (number, אופציונליים, עם תיאור "זוג מלא בלבד") ו־`google_maps_url` (string, uri) לסכמת התחנה ב־`proposeDayReplacement`. אין שינויים אחרים. תצטרך להדביק את הסכמה מחדש ב־GPT.

## קבצים ופונקציות
- מיגרציה חדשה ב־`drizzle/migrations/`: עמודה `location_sources`, `CREATE OR REPLACE` ל־`api_create_day_proposal` (allowlist, אימות, שימור), ל־`get_day_proposal_view` (החזרת השדות והמקורות) ול־`day_replace_proposals_guard` (אי־שינוי של העמודה החדשה). **אין שינוי** ב־`replace_day_entries`, `prepare_day_replace`, `_day_replace_rows`, `_proposal_claim`, `apply_day_proposal`, `reconfirm`, בהרשאות או בגרנטים.
- `src/lib/day-proposals.server.ts`: הרחבת `bodySchema`/`ProposalEntry` ואימות מיקום באמצעות `resolveDayLocation`.
- `src/routes/day-proposals.$id.tsx`: תג מקור ומונה "ללא מיקום".
- קובץ ה־OpenAPI הקיים (מסמך ה־action).
- בדיקות: הרחבת קובץ הבדיקות הקיים של ההצעות.

## בדיקות ממוקדות
1. תחנה עם שם ומיקום זהים לשורה קיימת אחת: הקואורדינטות נשמרות, `existing`.
2. שם או `location_name` שונים: לא מועתק דבר, `missing`.
3. שתי שורות זהות בשמן: לא מועתק דבר.
4. זוג חלקי, NaN, מחרוזת, מחוץ לטווח או 0,0: ההצעה נדחית. קישור viewport, מקוצר או לא של Google: הקישור נזרק, `missing`.
5. מיקום מפורש מהצ'אט: נשמר, `ai`, וגובר על השימור.
6. ניסיון UPDATE ל־`entries` או ל־`location_sources`: נחסם.
7. אישור: `replace_day_entries` מקבל בדיוק את `entries` שהוחזרו בתצוגה, כולל הקואורדינטות.
8. רגרסיה: scope/טוקן/תפוגה/מכסה, idempotency (אישור כפול = `already_applied`), תחנות מוגנות ו־`stale_view`/reconfirm ללא שינוי.

## סיכונים
- אם `replace_day_entries` מסנן מפתחות לא מוכרים: כבר אומת שהוא מקבל lat/lng/url. נבדוק מחדש שאין מפתח נוסף לפני ה־build.
- הצעות קיימות שעדיין ממתינות יישארו בלי מקורות (`location_sources` ריק) ויוצגו כ"ללא מיקום". אין להן backfill.
- כל הדרישות ניתנות למימוש בתוך הגבולות, ללא שינוי בפונקציות המוגנות.
