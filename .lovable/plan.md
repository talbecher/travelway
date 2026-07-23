## הבעיה

`day_entries.linked_recommendation_id` הוא FK ל-`recommendations(id)`, אבל `syncHotelToItinerary` שולח לשם את `hotels.id` (טבלה אחרת) — ולכן כל insert של כניסת מלון למסלול נכשל עם 409 / FK violation. גם אם היה עובר, לא היה לנו קישור אמין לניקוי כפילויות בעת שינוי שם/תאריכים.

## מה נתקן

### 1. עמודה חדשה בטבלת `day_entries`
- הוספת `linked_hotel_id uuid null references public.hotels(id) on delete set null` + index.
- לא נוגעים ב-`linked_recommendation_id` הקיים (נשאר לשימוש להמלצות "רגילות").

### 2. `src/lib/hotels.ts` — `syncHotelToItinerary`
- להחליף את כל השימוש ב-`linked_recommendation_id: h.id` ב-`linked_hotel_id: h.id`.
- שלב המחיקה שרץ לפני ההוספה יימחק לפי:
  - `linked_hotel_id = h.id` (הקישור החדש והאמין), **וגם**
  - Fallback לפי כותרת (`לינה: X`, `יציאה מX`, `בוקר בX`) לרשומות ישנות מלפני העמודה החדשה או אחרי שינוי שם.
- אחרי המחיקה מכל ימי הטיול, ההוספה מחדש נשארת כמו היום (צ׳ק-אין 20:00, אמצע = בוקר 09:00 + לינה 20:00, צ׳ק-אאוט 09:00).
- הוספת פרמטר אופציונלי `previousName?: string` — כשה-form שומר מלון עם שם שהשתנה, נעביר גם אותו כדי שהמחיקה לפי כותרת תתפוס גם את השם הישן.

### 3. הוצאות — ללא כפילויות גם אחרי rename
- היום מוחקים לפי `description = h.hotel_name`; אם המשתמש שינה שם, ההוצאות הישנות נשארות.
- נעביר `previousName` גם ל-שלב ההוצאות: נמחק לפי השם החדש **וגם** לפי הישן (כשקיים) לפני שמכניסים מחדש לכל לילה.

### 4. `hotelHasItineraryEntries`
- לבדוק לפי `linked_hotel_id = hotelId` (במקום `linked_recommendation_id`), כך שכפתור "הוסף למסלול" יזהה נכון מלונות שכבר קיימים.

### 5. `HotelForm.save` ב-`src/routes/recommendations.tsx`
- כשמעדכנים מלון קיים ומריצים resync, להעביר `previousName = existing.hotel_name` ל-`syncHotelToItinerary`.
- לוודא ש-`addToItinerary` ב-`HotelCard` ממשיך לעבוד כמו קודם (בלי `previousName`).

## תוצאה מצופה

- לחיצה על "הוסף למסלול" עובדת בלי 409.
- הפעלה חוזרת של הוספה/עדכון של אותו מלון מוחקת את הכניסות/הוצאות הישנות שלו (גם אם השם או התאריכים השתנו) לפני יצירת החדשות — אין כפילויות.
- מלונות ישנים שנוצרו בעבר עם כותרות מוכרות ינוקו דרך ה-fallback לפי title.

## מחוץ להיקף

- שינוי מבנה זמנים/כותרות של כניסות המלון.
- שינוי UI.
- מיגרציה של רשומות היסטוריות (מילוי `linked_hotel_id` אחורנית) — לא נדרש; המחיקה fallback לפי title מכסה אותן.