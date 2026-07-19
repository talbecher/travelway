## מטרה
לאפשר להעלות תמונה מהמכשיר בעת הוספת/עריכת המלצה (אוכל, אטרקציה או מלון). אם יש כבר תמונה (למשל מגוגל), לבקש אישור לפני ההחלפה.

## שינויים

### 1. Storage bucket
- ליצור bucket ציבורי בשם `rec-photos` דרך `supabase--storage_create_bucket` (public=true).
- להוסיף מדיניות RLS ב-`storage.objects` דרך migration:
  - `SELECT` פתוח לכל (באקט ציבורי).
  - `INSERT`/`UPDATE`/`DELETE` רק ל-`authenticated`, וגם רק כשה-`owner = auth.uid()`.

### 2. קומפוננטה חדשה `src/components/PhotoUploader.tsx`
- Props: `value: string | null`, `onChange(url: string | null)`, `folder: "recs" | "hotels"`.
- מציג:
  - אם יש תמונה: תצוגה מקדימה (16:9), עם שני כפתורים — "החלף תמונה" ו-"הסר".
  - אם אין: כפתור "העלה תמונה מהמכשיר" עם אייקון מצלמה.
- `<input type="file" accept="image/*">` מוסתר.
- לפני החלפה של תמונה קיימת, `window.confirm("להחליף את התמונה הנוכחית?")`. אישור → העלאה.
- העלאה:
  1. ולידציה: type=image, גודל ≤ 5MB (אחרת toast שגיאה).
  2. שם קובץ: `{folder}/{uuid}.{ext}` (uuid ב-`crypto.randomUUID()`).
  3. `supabase.storage.from("rec-photos").upload(path, file)`.
  4. `getPublicUrl(path)` → `onChange(url)`.
  5. Toast הצלחה/שגיאה, מצב loading בזמן העלאה.
- לא מוחק את הקובץ הישן מה-Storage בהחלפה (כדי לפשט; קבצים יתומים אפשריים).

### 3. שילוב ב-`RecForm` (`src/routes/recommendations.tsx`)
- מתחת ל"הערות", לפני כפתור השמור, להוסיף שדה: "תמונה ראשית" עם `<PhotoUploader value={photoUrl} onChange={setPhotoUrl} folder="recs" />`.
- זמין רק כשהטופס גלוי (`manualMode || placeSelected`).
- אין שינוי בלוגיקת השמירה — `photoUrl` כבר נשמר ב-`payload.photo_url` וכבר מסונכרן ל-day_entries.

### 4. שילוב ב-`HotelForm`
- להוסיף אותו שדה "תמונה ראשית" (`folder="hotels"`) לפני "לינק אישור/פלטפורמה" באזור הגלילה של הטופס. שדה `photo_url` כבר נשמר.

## קבצים
- **חדש**: `src/components/PhotoUploader.tsx`
- **נערך**: `src/routes/recommendations.tsx` (הוספת השדה ב-RecForm ו-HotelForm)
- **חדש**: migration RLS ל-`storage.objects` על ה-bucket `rec-photos`
- **פעולת כלי**: יצירת bucket `rec-photos` ציבורי

## הערות טכניות
- Bucket ציבורי כדי שהתמונות יופיעו בכרטיסים ובמפה בלי URL חתום.
- ה-URL הציבורי נשמר ב-`recommendations.photo_url` / `hotels.photo_url` באותה עמודה שבה נשמרת תמונת Google — הכרטיסים והמפה כבר יודעים להציג אותה.
- אין שינוי לסכימה; העמודה קיימת.