בעמוד פירוט יום (`/itinerary/$dayId`) משתנה כותרת ה-Hero כך שמספר היום והתאריך יוצגו בשורה אחת באותו גודל טקסט.

שינוי מדויק:
- מבנה קיים: "יום 3" בפונט 28px בשורה נפרדת, ומתחתיו "יום חמישי 19 בנובמבר" בפונט 12px.
- מבנה חדש: שורה אחת — "יום 3 - יום חמישי, 19 בנובמבר" בפונט 28px.
- מיקום: נשאר באותו מקום בכותרת, מעל כפתור "תצוגת מפה" וצ'יפ העיר.
- המפריד: מקף עם רווחים סביבו (" - ").
- התאריך: נשמר `hebDateLong(day.date)` עם נקודה-פסיק אחרי יום השבוע (הפונקציה כבר מחזירה "יום חמישי, 19 בנובמבר").

קובץ לשינוי: `src/routes/itinerary.$dayId.tsx`, שורות 306–310.

דוגמת קוד החלפה:
````text
לפני:
<div className="pt-1 pr-1">
  <div className="text-white text-[28px] font-semibold leading-none">
    יום {day.day_number}
  </div>
  <div className="text-white/70 text-[12px] mt-1.5">{hebDateLong(day.date)}</div>
  <DayWeatherLine ... />
</div>

אחרי:
<div className="pt-1 pr-1">
  <div className="text-white text-[28px] font-semibold leading-none">
    יום {day.day_number} - {hebDateLong(day.date)}
  </div>
  <DayWeatherLine ... />
</div>
````

בדיקה: טעינת עמוד יום בתצוגה מקדימה תציג כותרת בשורה אחת ללא חיתוך או חפיפה עם כפתור "תצוגת מפה" וצ'יפ העיר.