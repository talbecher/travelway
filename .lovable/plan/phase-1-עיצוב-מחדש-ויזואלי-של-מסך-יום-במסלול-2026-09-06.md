# Phase 1 — עיצוב מחדש ויזואלי של מסך יום במסלול

**עיצוב בלבד. אפס שינויי לוגיקה.** כל הקריאות לדאטה, ה-DnD, המפה, ה-URL builders, הטפסים וה-sheet-ים נשארים בדיוק כפי שהם. לא מתקינים חבילות חדשות. TypeScript חייב לעבור.

הקובץ היחיד שנוגעים בו: `src/routes/itinerary.$dayId.tsx`.

## מה המשתמש יראה

### 1. כותרת Hero כהה עם תמונה (גובה קבוע 110px)

- אם יש פריט ראשון עם `photo_url` — התמונה כרקע מטושטשת (`cover/center`) + שכבת `rgba(0,0,0,0.55)`.
- **אם התמונה נכשלת בטעינה (`onError`) — fallback אוטומטי לגרדיאנט היעד** מ-`getDestinationTheme(trip.destination_country)` (state מקומי `heroFailedUrl`).
- שורה עליונה (RTL): מימין כפתור החזרה הקיים; משמאל כפתורי pill קטנים `[🗺 מפה] [⋯]` — רקע `rgba(255,255,255,0.18)`, לבן, גובה 28px, `rounded-full`, טקסט 11px. אזור מגע מורחב ל-44px דרך pseudo-element שקוף.
- אזור תחתון (`absolute bottom: 10px`): מימין "יום {n}" (22px, לבן, font-500) + תאריך "יום שישי, 10.08" (11px, white/70). משמאל — pill עיר (max-width 100px, truncate) עם עיפרון + מזג אוויר קומפקטי "☀️ 29° / 18°" (10px, white/70) אם קיים.
- שורת "ביקרתם ב-{n} מתוך {total}" נשארת (10px, white/60).
- עריכת העיר (editingCity) נשארת בדיוק כפי שהיא.

### 2. כרטיסי פריטים עשירים יותר

- מיכל: `var(--card)`, מסגרת 0.5px, רדיוס 12px, `overflow: hidden`, בלי padding על המיכל.
- **וריאנט A (יש photo_url):** תמונה ברוחב מלא בגובה קבוע 80px (`object-cover`) בראש הכרטיס, ומתחת כותרת (14px, 500) + אימוג'י, `📍 location` (11px), משך זמן וקטע הערות.
- **וריאנט B (בלי תמונה):** אייקון/אימוג'י 48×48 לצד כותרת + מיקום, padding נקי.
- **משך זמן (חדש, ויזואלי בלבד):** helper מקומי טהור `parseTime(t)`. מוצג **רק** כשגם לפריט וגם לפריט הבא יש `time_of_day` **וגם** ההפרש חיובי (>0). אחרת — לא מוצג כלום. פורמט: "⏱ 2h 30m" / "45 דקות", 10px muted.
- **קטע הערות:** 60 תווים ראשונים של `description` + "...", 10px, muted, נטוי.
- כל הכרטיס נשאר לחיץ לאותו handler; מסירים את קישור "לפרטים ›" ומוסיפים chevron עדין "›" בפינה.
- מחוון הביקור (נקודה ירוקה + ★) נשאר כפי שהוא.

### 3. פס טיימליין

- תווית שעה: רוחב קבוע 44px, יישור לימין, 11px; `var(--foreground)` כשיש שעה, `var(--muted-foreground)` כשאין.
- נקודה: 10px (צבעים לפי סוג כמו היום) + מסגרת לבנה 1.5px.
- קו מקווקו נשאר, opacity 0.4.

### 4. SegmentConnector קומפקטי — שורה אחת

- שורה אחת בין שני כרטיסים, `dir="ltr"`: `→ {distance}  [🚶] [🚌] [🗺] [🚄]?`
- מרחק: "→ 2.6 ק״מ" ב-11px muted, עם `shrink`/truncate — **אם צריך, טקסט המרחק מתכווץ ראשון, השורה אף פעם לא נשברת (flex-nowrap, נבדק ב-390px)**.
- כפתורי אייקון עגולים 28×28 ויזואלית, עם אזור מגע 44px דרך padding שקוף: `bg: var(--surface-2)`, מסגרת 0.5px; המוצע/פעיל — `bg: var(--accent)`, לבן.
- 🚶 = URL הליכה הקיים, 🚌 = transit הקיים, 🗺 = Rome2Rio הקיים, 🚄 = NAVITIME (רק ביפן).
- **כל ה-URLs וה-href נשארים בדיוק כפי שהם.**

### 5. פס תחתון נקי

- שורת החיפוש: גובה 40px, רדיוס 20px, `bg: var(--surface)`, מסגרת 0.5px, placeholder "חיפוש מהיר בגוגל...", גופן 13px (מיושם דרך wrapper `[&_input]:...` בלי לגעת ב-PlacesSearch). `padding-bottom: env(safe-area-inset-bottom)` נשמר.
- ה-FAB: עיגול 56px, handler קיים (`openPicker`).
- מסירים את כפתורי "הערה מהירה" ו-"נווט אל" הצפים — הם **מתווספים לתפריט ⋯ הקיים** עם ה-handlers הקיימים בלבד (`setNoteOpen`, `setNavigateOpen`; ה-sheets כבר קיימים ונשארים).
- רשימת הפריטים: `pb-[120px]` כדי שה-FAB לעולם לא יכסה תוכן.

### 6. פישוט כפתורי הכותרת

- ב-Hero נשארים גלויים רק `[🗺 מפה]` ו-`[⋯]`.
- בתפריט ⋯: "ייצא ל-AI", "ייבא מ-AI", "גרסאות ונקודות שחזור" (קיימים) + "הערה מהירה" ו-"נווט אל" (handlers קיימים). **מועבר רק מה שכבר מחובר לפונקציה קיימת — שום לוגיקה חדשה.**

## כללי mobile-first (מחייב)

- כל אזור מגע ≥ 44×44px (ויזואל קטן + hit-area מורחב).
- שום גלילה אופקית ב-390px; connector בשורה אחת תמיד.
- אין גופן מתחת ל-10px; טקסט ארוך — truncate עם ellipsis.
- תמונות: `object-cover` עם גובה קבוע מפורש.
- Hero: גובה קבוע 110px.

## מה לא נוגעים בו

DayMap והלוגיקה שלו · useDayWeather (קריאת ה-hook) · useSortable/sensors · PlacesSearch · תוכן EntryDetails sheet · RatingSheet · handleMarkVisited · moveEntry · כל בוני ה-URLs · ערכי ה-href של SegmentConnector · שאילתות/מוטציות.

## פרטים טכניים

- עריכה יחידה של `src/routes/itinerary.$dayId.tsx`: `DayWeatherLine` (סגנון קומפקטי), בלוק ה-Hero, `SortableEntry`, `SegmentConnector`, פס תחתון + FAB, תפריט ⋯.
- `parseTime` — פונקציה מקומית טהורה בתוך הקובץ.
- משך הזמן: העברת `nextTime` כ-prop ל-`SortableEntry` מה-map הקיים (קריאה בלבד).
- תמונת ה-Hero: `entries.find(e => e.photo_url)` — נתון שכבר נטען; `onError` → `heroFailedUrl` → גרדיאנט.
- הסרת שבב "עומס היום" מה-Hero (הספק מגדיר במדויק את תוכן ה-Hero) — יחד איתו מוסרים imports של `dayLoadSummary`/`DAY_LOAD_LABEL`/`hebDateLong` שלא יהיו בשימוש.
- סגנון: inline styles + טוקנים (`var(--card)` וכו') כמו שאר הקובץ.
- בדיקה: typecheck + Playwright במובייל (390px) — hero עם/בלי תמונה, שני וריאנטי כרטיסים, connector בשורה אחת, DnD עובד מהידית.
