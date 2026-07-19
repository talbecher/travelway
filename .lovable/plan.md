## הבעיה
יצירת bucket ציבורי חסומה ע"י מדיניות ה-workspace, וההגדרה להפעיל public buckets נמצאת ב-Workspace Settings → Privacy & Security (דורש הרשאת admin/owner ב-workspace, לא בפרויקט). אם אתה לא מוצא את זה — כנראה שאין לך הרשאה, או שאתה בתפריט הפרויקט במקום ה-workspace.

**פתרון מוצע**: לעקוף לגמרי — להשתמש ב-bucket **פרטי** עם URLs חתומים ארוכי-טווח, במקום bucket ציבורי. חוויית המשתמש זהה.

## שינויים

### 1. Storage bucket
- ליצור bucket בשם `rec-photos` עם `public=false` (מותר תמיד).
- RLS ב-`storage.objects`:
  - `INSERT/UPDATE/DELETE` ל-`authenticated` על bucket זה.
  - `SELECT` ל-`authenticated` (כדי לאפשר יצירת signed URLs).

### 2. `PhotoUploader.tsx` (חדש)
- Props: `value: string | null`, `onChange(url: string | null)`, `folder: "recs" | "hotels"`.
- אם כבר יש תמונה → `window.confirm("להחליף את התמונה הנוכחית?")` לפני העלאה.
- ולידציה: image only, ≤ 5MB.
- שם קובץ: `{folder}/{uuid}.{ext}`.
- העלאה ל-`rec-photos`, ואז `createSignedUrl(path, 60*60*24*365*10)` (10 שנים) → `onChange(url)`.
- Toast הצלחה/שגיאה + מצב loading.
- כפתורים: "העלה תמונה מהמכשיר" / "החלף" / "הסר".

### 3. שילוב
- **`RecForm`** ב-`src/routes/recommendations.tsx`: שדה "תמונה ראשית" עם `PhotoUploader folder="recs"` מתחת ל"הערות". `photoUrl` כבר נשמר ב-payload ומסונכרן ל-day_entries.
- **`HotelForm`**: אותו שדה עם `folder="hotels"` באזור הגלילה של הטופס.

## קבצים
- **חדש**: `src/components/PhotoUploader.tsx`
- **נערך**: `src/routes/recommendations.tsx`
- **חדש**: migration ל-RLS על `storage.objects` עבור `rec-photos`
- **כלי**: יצירת bucket פרטי `rec-photos`

## הערות
- ה-signed URL נשמר בעמודה הקיימת `photo_url` — הכרטיסים והמפה כבר מציגים ממנה, בלי שינוי.
- Signed URL ל-10 שנים אפקטיבית = "קבוע" לצרכי האפליקציה.
- אין צורך יותר להפעיל public buckets ב-workspace.