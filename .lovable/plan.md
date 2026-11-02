# סבב 1א — יסודות CSS ומובייל (תצוגה בלבד)

## ממצאים לפני היישום
- קובץ ה-CSS הגלובלי הוא `src/styles.css`. אין `tailwind.config` בפרויקט (Tailwind v4) — לא ייווצר.
- **הסרגל העליון יושב בתוך `src/routes/__root.tsx`** (שורה 156), לא ברכיב נפרד. ההרשאה ל-`__root` היא רק ל-theme-color — לכן נדרש אישור (ראו "שאלה פתוחה").
- `__root.tsx` מכיל `min-h-screen` (שורות 44, 58, 155) — לא ישונה בלי אישור.
- שורת ההוספה המהירה (`itinerary.$dayId.tsx` שורה 1057) כבר כוללת safe-area תחתון; השדה שבה מכריח `!text-[13px]` — זה יגבר על כלל 16px הגלובלי.
- BottomNav כבר כולל ריפוד safe-area תחתון. theme-color כיום אחד בלבד (`#0F0F13`, כהה גם במצב בהיר).

## השוואת ערכים (הצעה: לשמר כשקרוב)
```text
טוקן           קיים      מוצע      החלטה
background     #FAF7F2   #F7F3EE   לשמר (קרוב)
surface/card   #FFFFFF   #FFFFFF   זהה
border         #EDE8E3   #ECE5DC   לשמר (קרוב)
foreground     #1C1917   #1F1B16   לשמר (קרוב)
muted-fg       #78716C   #6B635B   לשנות (כהה יותר, ניגודיות טובה יותר)
accent         #E8614D   #E2553F   לשמר (קרוב)
accent-text    —         #C8432E   חדש: --accent-text
accent-soft    —         #FCE9E4   חדש: --accent-soft
```
מצב כהה: הערכים הקיימים נשמרים; נוספים רק מקבילים לטוקנים החדשים (accent-text, accent-soft, צבעי קטגוריה) בגוונים שמתאימים לפלטה הכהה הנוכחית.

## שינויים ב-`src/styles.css`
1. טוקנים חדשים (בהיר+כהה) וחשיפתם ב-`@theme inline`: `--accent-text`, `--accent-soft`, צבעי קטגוריה `--cat-food-bg/fg`, `--cat-attraction-*`, `--cat-lodging-*`, `--cat-transport-*`, `--cat-booked-*`. ללא שינוי שימושים קיימים.
2. רדיוסים כמשתנים: `--radius-card: 18px`, `--radius-button: 14px`, `--radius-chip: 8px` (הקיימים `--radius*` לא משתנים).
3. מובייל:
   - `input, select, textarea { font-size: max(16px, 1em) }`.
   - `-webkit-tap-highlight-color: transparent` גלובלי; `:active` עדין (scale/opacity) ל-`button`, `[role=button]`, `a[href]` עם כלל עוקף ל-`prefers-reduced-motion`.
   - utility `chips-scroll` עם `overscroll-behavior-x: contain` + כלל גלובלי ל-`.overflow-x-auto`.
   - `@media (prefers-reduced-motion: reduce)` — ביטול אנימציות/מעברים לא חיוניים.
   - אין `100vh/100svh` ב-CSS הגלובלי כיום — אין מה להחליף.

## שינויי className במעטפת
- `BottomNav.tsx`: מינימום 44px לפריטי הניווט (אם חסר); safe-area כבר קיים.
- `GlobalFab.tsx`: מיקום הכפתור הצף עם `calc(... + env(safe-area-inset-bottom))` ו-44px מינימום.
- שורת ההוספה המהירה: safe-area קיים נשמר; הוספת `env(safe-area-inset-left/right)` לריפוד הצדדים.
- `__root.tsx`: שני מטא theme-color עם `media` — בהיר `#FAF7F2`, כהה `#191713`.

## שאלה פתוחה (נדרשת תשובה לפני יישום)
- האם מותר לשנות className בסרגל העליון ובמעטפת `min-h-screen`→`min-h-dvh` בתוך `__root.tsx`? בלי אישור — הסרגל העליון יישאר ללא safe-area עליון.
- האם להסיר את `!text-[13px]` משדה ההוספה המהירה (נדרש ל-16px ולמניעת זום ב-iPhone)?

## בדיקות
`bunx tsgo --noEmit`, `bun run build`, צילום 393×852 בהיר/כהה של בית ומסך יום.

## דוח
קבצים ששונו, ערכים שנשמרו, מקומות לא ברורים, והצהרה שלא שונו לוגיקה/נתונים.
