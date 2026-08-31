# תכנית: זרימת "היינו כאן" במסך יום במסלול

מוסיפים למסך `itinerary.$dayId.tsx` אפשרות לסמן המלצות משויכות כ"ביקרנו" ולדרג אותן, תוך שימוש בשדות הקיימים בטבלת `recommendations` (`status`, `rating`, `review`). אין שינויי DB ואין תלות חדשה.

## מה נבנה

1. **שאילתת recs משויכים ברמת היום**
   - ב־`DayDetail`, לאחר טעינת `entries`, נחשב את רשימת `linked_recommendation_id` הייחודיים.
   - נבצע שאילתה אחת ל־`recommendations` עם `select("id, name, status, rating, review")` ו־`in("id", ...)`.
   - נייצר מפתח `recById` ונמסור אותו לרכיבי הצאצא.
   - השאילתה הקיימת בתוך `EntryDetails` תוסר כדי למנוע כפילות.

2. **אינדיקטור "ביקרנו" על כרטיסי פריטים**
   - ב־`SortableEntry`, עבור פריט עם `linked_recommendation_id` שמצב ה־`status` שלו הוא `visited`:
     - נקודה ירוקה קטנה (`8px`, `#10B981`) ליד הכותרת.
     - אם קיים דירוג, נציג `★{rating}` בצבע accent, גודל `text-[11px]`.

3. **סיכום ביקורים ב־Hero header**
   - מתחת לשורת התאריך, אם קיימים פריטים משויכים (`totalLinked > 0`):
     - נציג `"ביקרתם ב-{visitedCount} מתוך {totalLinked} מקומות"` בגודל `text-[12px] text-white/70`.

4. **כפתור "היינו כאן" ב־BottomSheet הפרטים**
   - בראש רשימת הפעולות ב־`EntryDetails` (מעל עריכה/מחיקה/העברה):
     - אם `status !== 'visited'`: כפתור accent מלא `📍 היינו כאן!`.
     - אם `status === 'visited'`: כפתור משני `✅ ביקרנו · ★{rating} · עריכת דירוג`.
   - לחיצה מעדכנת את ה־status ל־`visited`, מבטלת מטמון של `linked-recs` ו־`recs`, סוגרת את הפרטים, ופותחת את דף הדירוג.

5. **רכיב חדש: `RatingSheet.tsx`**
   - `BottomSheet` עם:
     - כותרת "איך היה {recName}?" ותת־כותרת "דירוג אופציונלי".
     - שורה של 5 כוכבים (★/☆) בגודל `44px` — בחירה בכוכב N מגדירה דירוג N, לחיצה חוזרת מאפסת.
     - פילים מהירים: `😍 מדהים`, `👍 טוב`, `😐 בסדר`, `👎 לא שווה` — ממופים ל־5/4/3/2.
     - שדה `textarea` לביקור חופשי (מקסימום 200 תווים).
     - כפתורים: `💾 שמור דירוג` (מעדכן `rating` ו־`review`, מבטל מטמון, מציג toast וסוגר) ו־`דלג` (סוגר בלבד).

6. **חיווט `RatingSheet` ב־`DayDetail`**
   - מצב `ratingTarget` עם `recId`, `recName`, `initialRating`, `initialReview`.
   - רינדור מותנה בתחתית הקומפוננטה.

## קבצים שיישתנו

- `src/routes/itinerary.$dayId.tsx` — שאילתת linked recs, אינדיקטורים, סיכום hero, כפתור "היינו כאן", פונקציית `handleMarkVisited`, מצב `ratingTarget`.
- `src/components/RatingSheet.tsx` — רכיב חדש.

## אין שינויים נדרשים

- אין טבלאות חדשות או שינויי DB.
- אין חבילות npm חדשות.
- אין שינויי UX במסך ההמלצות עצמו.
