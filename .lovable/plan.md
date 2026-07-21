# תיקוני מובייל לעמוד היום — סגנון בלבד

טווח: `src/routes/itinerary.$dayId.tsx` בלבד. אין שינוי בהאנדלרים, mutations, ניתוב, PlacesSearch או בניית URL של מפות.

## 1. כרטיס פעילות — פריסה נקייה
- גובה מינ' 72px, padding `14px 16px`, `flex items-start gap-3`.
- תמונה/אמוג'י בצד ימין (RTL start) בגודל `56×56`, rounded, shrink-0.
- כותרת: `text-[15px] font-semibold`. מיקום מתחת: `text-xs text-muted-foreground truncate`.
- Time pill: מעבר לפינה עליונה-שמאלית של הכרטיס (`absolute top-2 left-2`), רקע `bg-muted/60`.
- הסרה מפני הכרטיס: `ערוך`, `מחק`, `פתח במפה`.
- הוספת כפתור ⋯ (3 נקודות) בפינה תחתונה-שמאלית של הכרטיס. Tap פותח `BottomSheet` קטן עם 3 פריטים: `ערוך` · `פתח במפה` · `מחק` (אדום). כל פריט קורא לאותו handler קיים.

## 2. Segment connector בין כרטיסים
- כפתורים בגובה מינ' `36px`, רוחב מינ' `80px`, `text-[13px]`, `gap-2`.
- להראות רק 2 כפתורים לפי מרחק:
  - `< 1.5km`: `[🚶 ברגל ✓]` (מודגש accent) + `[🚌 תחבורה]`.
  - `≥ 1.5km`: `[🚌 תחבורה ✓]` + `[🚶 ברגל]`.
- להסיר את כפתור הרכב לחלוטין מה-connector.
- טקסט המרחק מעל הכפתורים: `text-[13px] text-muted-foreground`.

## 3. שורת תחתית — לפצל
הסרה מוחלטת של כפתורי `ברגל/תחבורה/מכונית` מה-bar (הם רק ב-connector).

א) **FAB צף** — `fixed bottom-[80px] right-4 z-40`, עיגול `56px`, `bg-[color:var(--accent)] text-white shadow-lg`, אייקון `+` בגודל 24. Tap פותח את picker סוג הפעילות הקיים (`openPicker`). להסיר כל FAB כתום קיים שגולש על התוכן.

ב) **Quick search sticky** — גובה `52px`, `bg-card border-t border-border`, `sticky bottom-0` (מעל bottom nav), padding עם `env(safe-area-inset-bottom)`. בפנים רק `PlacesSearch` ברוחב מלא עם placeholder "חיפוש מהיר בגוגל...". כפתור "⭐ המלצות" מוסר מכאן (הוא מכוסה ע"י ה-FAB → picker → "מההמלצות").

עדכון `pb` של רשימת הכרטיסים כך שהכרטיס האחרון לא ייחתך ע"י ה-search bar + FAB (`pb-[120px]`).

## 4. פאנל מפה — יחסים
- גובה ברירת מחדל `40vh` במקום `50vh`.
- Drag handle: `w-12 h-[5px] rounded-[3px] bg-[color:var(--border-strong)] mx-auto`.
- הוספת `shadow-[0_-4px_12px_rgba(0,0,0,0.06)]` מתחת/מעל לפאנל המפה כהפרדה.

## 5. Hero header
- גובה גובה מוגבל ל-`100px` (במקום 120).
- כפתור חזרה: touch target `40×40`, `rounded-full`.
- City pill (`עיר · עריכה`) עובר ל-`absolute bottom-2 right-3` של ה-hero (RTL start-bottom), במקום ליצוף באמצע.
- אחרי ה-hero: `border-b border-border` מפורש כמפריד מהמפה.

## מה לא נוגעים
mutations, DnD, PlacesSearch, `googleDirectionsUrl`, ניתוב, `DayMap`.
