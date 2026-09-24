# סימון "הוזמן" וסנכרון למסמכים

## מה המשתמש יראה
- כפתור "סמן כהוזמן" בכרטיס מקום עם דדליין שלא הוזמן (מסך ההמלצות), ובשורת הדדליין בבית.
- לחיצה פותחת גיליון קטן (BottomSheet הקיים) עם שעה, קישור והערה — ממולאים בערכים הקיימים.
- שמירה: המקום מסומן ✅ הוזמן, ההתראה נעלמת מכל המקומות, ונוצר/מתעדכן מסמך אחד במסך המסמכים. משוב "סומן כהוזמן".

## מיגרציה (קובץ מתועד)
- `documents.linked_recommendation_id uuid NULL` עם FK ל־`recommendations(id) ON DELETE SET NULL` (`ADD COLUMN IF NOT EXISTS`, FK בתוך בדיקת קיום אילוץ).
- אינדקס ייחודי חלקי `(linked_recommendation_id) WHERE NOT NULL` (`IF NOT EXISTS`).
- פונקציה `public.mark_recommendation_booked(_rec_id, _booking_time, _booking_url, _booking_note)` — **SECURITY INVOKER** (RLS הקיים חל), plpgsql = טרנזקציה אחת:
  1. `SELECT trip_id, name, type FROM recommendations WHERE id=_rec_id` — אם אין שורה (RLS חוסם/לא קיים) → שגיאה.
  2. UPDATE ההמלצה: שלושת השדות + `booking_status='booked'` (booking_deadline לא נגע).
  3. `INSERT INTO documents (...) ON CONFLICT (linked_recommendation_id) WHERE ... DO UPDATE` שמעדכן רק `title`, `notes`, `trip_id`? — לא: מעדכן רק `title` ו־`notes` (+`file_url` רק אם ריק? לא — קישור ההזמנה נשמר ב־notes כדי לא לדרוס קובץ שהועלה). `trip_id` נלקח מההמלצה בשרת, לא מהלקוח.
  4. כישלון בכל שלב מבטל הכל — אין המלצה booked בלי מסמך.
- GRANT EXECUTE ל־authenticated בלבד.

## מיפוי המסמך (לפי הסכמה הקיימת)
- `title` = שם המקום; `type` = `attraction` (סוג קיים; לאוכל גם `attraction` כ"הזמנה"? — ל־food: `other`).
- `trip_id` = של ההמלצה (בשרת); `linked_recommendation_id` = id ההמלצה.
- אין עמודת שעה/קישור ייעודית: `notes` בנוי מבלוק "🎟 הזמנה: שעה · קישור · הערה". `valid_date` = `booking_deadline` רק ביצירה ראשונה.
- בעדכון: לא נוגעים ב־`file_url`, `barcode_*`, `amount_ils`, `is_paid`, `valid_date`, `display_order`.

## מקור שמירה משותף
- `src/lib/booking.ts`: `markRecommendationBooked(recId, {time,url,note})` קורא ל־RPC, ו־`useMarkBooked()` (mutation + invalidate + toast + מניעת לחיצה כפולה דרך isPending).
- `src/components/MarkBookedSheet.tsx`: גיליון עם 3 השדות, ולידציית URL בסיסית כמו ב־RecForm.
- RecForm: כשהסטטוס עובר ל־booked, אחרי עדכון השדות הרגילים — קריאה ל־`markRecommendationBooked` (אותו RPC; עדכון כפול של אותם ערכים זהה). ביטול הסימון מעדכן רק את הסטטוס — המסמך והקישור נשמרים.

## רענון (query keys קיימים)
`["recs"]`, `["hotels"]` לא נדרש, `["documents", tripId]`, ו־keys של הבית שמבוססים על recs (הדדליינים מחושבים מ־recs).

## מניעת כפילות ואבטחה
- אינדקס ייחודי + ON CONFLICT → מסמך אחד לכל המלצה גם בסימון מחדש.
- RLS קיים: `recs` ו־`documents` דורשים `can_access_trip`; trip_id של המסמך נגזר מההמלצה בתוך הפונקציה, כך שאין קישור בין טיולים.
- מחיקת המלצה → SET NULL; מחיקת מסמך רק ידנית.

## קבצים
- מיגרציה חדשה; טיפוסים מתעדכנים אוטומטית.
- חדש: `src/lib/booking.ts`, `src/components/MarkBookedSheet.tsx`.
- `src/routes/recommendations.tsx`: כפתור ב־PlaceCard + RecForm קורא למקור המשותף.
- `src/routes/index.tsx`: כפתור בשורת הדדליין (רק לפריטי recommendation).
- `src/hooks/use-documents.ts`: הוספת `linked_recommendation_id` לטיפוס.

## בדיקות
`bunx tsgo --noEmit`, `bun run build`.
