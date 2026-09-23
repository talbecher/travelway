# תוכנית יישום — יישור קו רוחבי למובייל: גיליונות, טפסים, מקלדת ו־overflow

## מסקנת האבחון

הצילום תואם למבנה הקיים: `BottomSheet` מספק מעטפת בגובה `92dvh` וגוף גולל, אך טפסים ארוכים מוסיפים בתוכו פוטרים דביקים, גבהי `vh` ואזורי גלילה נוספים. התוצאה היא גלילה מקוננת, פעולה שמכסה תוכן, קפיצות מול המקלדת וחריגות רוחב מקומיות.

הפתרון יהיה בשתי שכבות בלבד:
1. תיקון התשתית המשותפת פעם אחת.
2. הסרת חריגות מקומיות רק בטפסים שמפרים את חוזה התשתית.

לא יתווסף `overflow-x-hidden` גלובלי שמסתיר את הבעיה, ולא ייעשה refactor עסקי.

## Inventory שנבדק

### ה־primitive הפעיל
- `src/components/BottomSheet.tsx` — Vaul `Drawer`; זהו ה־primitive הפעיל בכל האפליקציה. נמצאו **37 שימושים ב־19 קבצים**.
- `src/components/ui/drawer.tsx`, `ui/sheet.tsx`, `ui/dialog.tsx`, `ui/alert-dialog.tsx` — קיימים אך אין להם צרכנים ישירים במסכי האפליקציה. לא נרחיב את ההיקף אליהם ללא צורך; יתועד שלא להשתמש בהם לטופסי מובייל חדשים במקום `BottomSheet`.
- `DateField` משתמש ב־Popover מעל גיליון (`z-[1200]`); הוא אינו גיליון עצמאי אך הוא חלק מסדר השכבות.
- שני פאנלים בתצוגת המפה של יום הם overlays פנימיים למפה, לא dialogs; הם יישארו נפרדים.

### כל שימושי BottomSheet
- מעטפת: החלפת טיול (`__root__`), חיפוש גלובלי, ממיר מטבע, הוצאה מהירה.
- המלצות: הוספה/עריכת המלצה, הוספת/עריכת מלון, בחירת יום בשני נתיבים, בחירת נקודה במפה, התראת חפיפת מלונות.
- מסלול יום: אפשרויות הגעה, בחירת סוג/הוספת פריט, עריכת פריט, עדכון מיקום, הערה מהירה, ניווט אל, פרטי פריט, העברה ליום אחר, פעולות נוספות, תצוגת אופטימיזציה, טיפול במלון שאינו בטווח.
- ייבוא/ייצוא וגילוי: Import AI, Export AI, Import From My Maps, Discover.
- מסמכים: צפייה בברקוד/QR, הוספה/עריכת מסמך.
- צ׳קליסט: תפריט פריט, עריכת פריט.
- נוספים: דירוג, „היינו כאן”, גרסאות יום, בחירת גרסת מסלול, פרטי ייחוס לתמונת הבית.

### הטפסים המרכזיים שנבדקו
- `RecForm`, `HotelForm`, הוצאה מהירה ועריכת הוצאה.
- `EntryForm`: טיסה, מלון/לינה, מקום/אוכל, תחבורה, הערה, ניווט ומיקום.
- טופס מסמך, טופס צ׳קליסט, Import AI, My Maps, Discover, חיפוש גלובלי, דירוג ו„היינו כאן”.
- `PhotoUploader`, `PlacesSearch`, `DateField`, `BottomNav`, `GlobalFab`, מעטפת האפליקציה, CSS גלובלי ו־manifest.

## Root causes מדויקים

### משותפים
1. `BottomSheet` אמנם משתמש ב־`max-h-[92dvh]`, `flex` ו־`min-h-0`, אבל אין לו חלוקת API רשמית ל־header/body/footer. לכן כל טופס ממציא פוטר משלו בתוך הגוף הגולל.
2. ה־footer המקומי של `RecForm`, `HotelForm` ומסמכים הוא `sticky` בתוך ה־scroll body; הוא מכסה שדות ומניח ידנית `-mx-5` מול padding של `px-4`.
3. Vaul כבר כולל טיפול מובנה ב־`visualViewport`, body scroll lock, focus trap והחזרת focus. כרגע ה־primitive אינו מגדיר במפורש `fixed`/`repositionInputs`, ולכן החוזה מול המקלדת אינו ברור.
4. הכותרת וה־handle קבועים בפועל, אך אין כפתור סגירה עקבי ואין תיאור נגיש כאשר אין title.
5. אין חוזה שכבות מפורש ל־sheet רגיל, sheet מקונן ו־popover. חפיפת המלונות פותחת BottomSheet בתוך BottomSheet עם אותם ערכי z-index.
6. רוב ה־inputs הגולמיים יורשים 15px או משתמשים ב־12–14px. ב־iOS זה עלול לגרום zoom אוטומטי, הזזת viewport ותחושת overflow.

### מקומיים
1. גלילה מקוננת: בחירת יום בהמלצות (`60vh`), Import AI (`46vh`), My Maps (`45vh`), Day Snapshots (`52vh`), Export AI (`35vh`), רשימת המלצות שמורות במסלול (`220px`) ורשימות Discover. רק רשימות קצרות שבאמת דורשות תת־גלילה ישמרו אותה, עם גבול דינמי ולא `vh` קשיח.
2. `PlacesSearch` מציג dropdown מוחלט עד `320px`; עם מקלדת הוא יכול לצאת מהאזור הגלוי. נדרש גובה תלוי מקום זמין ו־overscroll containment.
3. `PhotoUploader` מציג preview ביחס 16:9 על מלוא הרוחב; בטופס המלצה/מלון הוא יכול להגיע לכ־200px ולדחוף שדות. מאחר שאין לשנות את `PhotoUploader`, המגבלה תוחל בעטיפה המקומית של הטפסים בלבד: גובה 120–160px, `max-w-full`, `object-cover`, וללא שטח גדול אם התמונה נכשלת.
4. גרידים דו־עמודתיים בטיסות, תחבורה, תאריכי מלון ו־Discover חסרים בחלקם `min-w-0`; שורות פעולות ב־360px צריכות grid גמיש או מעבר לטור.
5. שמות, כתובות ושמות קבצים ארוכים אינם משתמשים תמיד ב־`break-words`/`min-w-0` לאורך כל שרשרת ה־flex.
6. `autoFocus` ב־RecForm ובחיפוש הגלובלי פותח מקלדת בזמן אנימציית הפתיחה; יש לדחות focus לאירוע סוף פתיחת Vaul, לא בעזרת timeout.
7. FAB מקומי בהמלצות כבר מוסתר לפי state של overlays, אך אין מנגנון רוחבי שמסתיר את BottomNav והפעולות הקבועות כאשר גיליון גלובלי פתוח. ה־overlay מכסה אותם חזותית, אך המעטפת אינה יודעת שקיימת שכבה פעילה.

## טבלת בעיה → מקור → פתרון

| בעיה | מקור | פתרון |
|---|---|---|
| שדות/כפתור שמירה לא נגישים | footer דביק בתוך body גולל | footer אמיתי מחוץ ל־scroll region + padding תחתון מובנה |
| מקלדת מסתירה שדה | autofocus מוקדם וחוזה Vaul לא מפורש | `fixed` + `repositionInputs`, focus אחרי פתיחה, 16px בשדות במובייל |
| גלילה כפולה | `max-h:*vh` + `overflow-y-auto` בתוך BottomSheet | להסיר nested scroll ברירת־מחדל; לשמור רק רשימות משנה תחומות ב־`dvh` |
| גלילה אופקית | grid/flex children ללא `min-w-0`, תוכן LTR ארוך | `min-w-0`, `max-w-full`, `break-words`, grid מסתגל ב־360px |
| preview גדול | `PhotoUploader` מלא־רוחב `aspect-video` | wrapper מקומי שמגביל ל־120–160px; אין שינוי בלוגיקת/רכיב ההעלאה |
| תמונה כושלת משאירה אזור | אין טיפול מקומי בכשל preview | הסתרת עטיפת ה־preview בטופס בלבד, ללא placeholder גדול |
| פוטר מכסה תוכן | `sticky bottom-0` מקומי עם margins ידניים | slot משותף ל־footer עם safe-area וחישוב padding מובנה |
| sheet מקונן עמום | שני Drawers באותה שכבה | prop `nested`/layer מפורש ושימוש ב־`Drawer.NestedRoot` אם נתמך בגרסה המותקנת |
| קפיצת עמוד מאחור | כמה מנגנוני scroll/focus אפשריים | להשאיר scroll lock בידי Vaul בלבד; לא לגעת ידנית ב־body |
| FAB/Nav תחת overlay | state מקומי ולא חוזה מעטפת | אירוע/מונה overlay משותף תצוגתי בלבד להסתרת chrome בזמן שכבה פעילה |
| QR ברוחב קשיח 260px | מדיה במסמך | `max-w-full` וגודל רספונסיבי בלי לשנות את ערך הברקוד |

## API מוצע ל־BottomSheet — לאחור תואם

כל ה־props הקיימים נשארים. יתווספו props אופציונליים בלבד:

```ts
type BottomSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  contentClassName?: string;
  bodyClassName?: string;
  nested?: boolean;
  initialFocus?: "none" | "first";
  onOpenAutoFocus?: (event: Event) => void;
};
```

בנוסף יינתן `BottomSheetFooter` קטן מבוסס context/portal, כדי שטופס שה־state שלו פנימי (`RecForm`, `HotelForm`) יוכל להצהיר על כפתור submit מקומי אך שהכפתור ירונדר פיזית באזור footer שמחוץ לגלילה. כך אין צורך להרים state עסקי למסך האב.

מבנה היעד:

```text
Overlay — fixed, כל ה־visual viewport
└─ Surface — max-height דינמי, width: 100%, min-width: 0
   ├─ Header — handle + title + close, shrink-0
   ├─ Body — min-h-0, min-w-0, overflow-y-auto, overscroll-contain
   └─ Footer? — shrink-0, border, safe-area, לעולם לא מכסה את Body
```

ברירת המחדל תישאר תואמת: caller ללא footer ימשיך לעבוד. גובה הגיליון יהיה `height:auto` עד תקרה המבוססת `dvh/svh`; אין גובה קשיח אחיד. נשתמש קודם ב־CSS ובטיפול `visualViewport` שכבר קיים ב־Vaul. לא יתווסף listener JavaScript חדש אלא אם בדיקה במכשיר אמיתי תוכיח כשל שנותר לאחר הגדרת `fixed`/`repositionInputs`.

## שלב A — תשתית משותפת

1. לעדכן `BottomSheet` למבנה header/body/footer, `min-w-0`, `overscroll-contain`, safe-area בפוטר, כפתור סגירה נגיש ותיאור נגיש.
2. להגדיר במפורש את התנהגות Vaul מול מקלדת ו־focus; להשאיר body lock והחזרת focus בידי הספרייה.
3. להוסיף ב־`styles.css` רק כללי תשתית נחוצים: viewport fallback (`svh`→`dvh`), touch scrolling, overflow containment, ו־16px לבקרי טופס בתוך sheet במובייל. לא להסתיר overflow אופקי גלובלית.
4. לעדכן viewport metadata ב־`__root.tsx` רק אם נדרש ל־Android resize (`interactive-widget=resizes-content`), תוך שמירת `viewport-fit=cover`; iOS לא יסתמך על metadata זה.
5. להגדיר סדר שכבות עקבי ולחשוף מצב overlay למעטפת כדי להסתיר BottomNav/FAB בזמן sheet פעיל, בלי לשנות handlers של המסכים.

## שלב B — התאמת החריגים

- `recommendations.tsx`: להעביר את שמירת RecForm ל־footer slot; להסיר sticky מקומי; לבטל autofocus בזמן האנימציה; לתקן שתי רשימות בחירת יום; להגביל preview בעטיפה מקומית; לשמור סדר שדות ותוכן.
- `HotelForm.tsx`: footer slot, preview קומפקטי, `min-w-0` בגריד תאריכים, nested sheet תקין להתראת חפיפה.
- `GlobalFab.tsx` ו־`budget.tsx`: footer משותף לטופסי הוצאה, 16px במובייל, grid בטוח לסכום/מטבע; ללא שינוי בשמירה.
- `documents.tsx`: להסיר sticky/pb ידניים, להעביר שמירה לפוטר, להגביל QR/שם קובץ לרוחב.
- `itinerary.$dayId.tsx`: footers לטפסי העריכה הארוכים, `min-w-0` בגרידי טיסה/תחבורה, התאמת רשימת ההמלצות השמורות וה־PlacesSearch, ושמירת כל פעולות המסלול.
- `ImportAISheet.tsx`, `ImportFromMyMapsSheet.tsx`, `DaySnapshotsSheet.tsx`, `ExportAISheet.tsx`: להסיר `vh` מקומי היכן שהגוף המשותף מספיק; תת־גלילה תישאר רק לתצוגת קוד/רשימה עצמאית ותוגבל לפי מקום זמין.
- `DiscoverSheet.tsx`: להעביר את שורת הסיכום ל־footer המשותף; להשאיר גלילה פנימית רק לרשימת „להוסיף גם ליום” הקצרה; לפרק את שני הכפתורים לטור ב־360px אם אינם נכנסים.
- `GlobalSearch.tsx`, `PlacesSearch.tsx`, `RatingSheet.tsx`, `HayinuKanSheet.tsx`, `checklist.tsx`: focus מתוזמן נכון, 16px בשדות, footer משותף היכן שנדרש, ושבירת טקסט בטוחה.
- callers קצרים (ממיר, החלפת טיול, תפריטי פעולה, ייחוס תמונה) ייהנו מתיקון התשתית ללא refactor מקומי.

## שלב C — ניקוי overflow רוחבי

1. לתקן כל מקור חריגה שנמצא: children של flex/grid, כתובות ושמות קבצים, QR, dropdown של PlacesSearch ושורות פעולות.
2. להוסיף `min-w-0` לאורך השרשרת, `max-w-full` למדיה/inputs/selects ו־`break-words` לטקסט חופשי.
3. ב־360px להפוך שורות שאינן מצטמצמות בבטחה ל־grid/column; לשמור שטחי לחיצה של 44–48px.
4. לא לשנות את `PhotoUploader`; רק עטיפות הטפסים יקבעו גובה preview. אין hero ואין placeholder גדול.

## קבצים צפויים לשינוי

**תשתית:**
- `src/components/BottomSheet.tsx`
- `src/styles.css`
- `src/routes/__root.tsx` — רק viewport/chrome overlay אם נדרש

**התאמות מקומיות:**
- `src/routes/recommendations.tsx`
- `src/components/HotelForm.tsx`
- `src/components/GlobalFab.tsx`
- `src/routes/budget.tsx`
- `src/routes/documents.tsx`
- `src/routes/checklist.tsx`
- `src/routes/itinerary.$dayId.tsx`
- `src/components/ImportFromMyMapsSheet.tsx`
- `src/components/ImportAISheet.tsx`
- `src/components/ExportAISheet.tsx`
- `src/components/discover/DiscoverSheet.tsx`
- `src/components/DaySnapshotsSheet.tsx`
- `src/components/GlobalSearch.tsx`
- `src/components/PlacesSearch.tsx`
- `src/components/RatingSheet.tsx`
- `src/components/HayinuKanSheet.tsx`

שאר 37 ה־callers ישונו רק אם אימות ממוקד יראה חריגה; לא יבוצע refactor גורף.

## שמירת הלוגיקה

- לא משתנים schema, migrations, RLS, routes, queries, mutations, keys, cache, invalidation, validation או payloads.
- handlers קיימים ו־`assertOnline` נשארים; כפתורי footer יפעילו את אותם submit/handlers באמצעות `form` id או callback קיים.
- אין שינוי ב־Discover/pilot, מפות, Leaflet, ייבוא, גרירה, מקור תמונה או העלאה.
- אין שינוי בתוכן הטפסים; שינוי סדר יתבצע רק אם נחוץ חזותית כדי לשמור שדות עיקריים לפני מדיה.

## סיכונים והגנות

- **iOS Safari/PWA:** zoom על input קטן, layout viewport מול visual viewport, safe-area בזמן מקלדת והחזרת offset. הגנה: 16px, Vaul visualViewport המובנה, `dvh/svh`, ללא timeout.
- **Android Chrome:** שינוי גובה בפתיחת מקלדת ובדיקת `interactive-widget`; footer חייב להישאר מעל המקלדת בלי resize כפול.
- **nested sheets:** focus trap, overlay order וסגירת השכבה העליונה בלבד; ייבדק תרחיש חפיפת מלונות.
- **landscape:** גובה קצר מאוד; אין `vh` פנימי קשיח ואין footer שמעלים את הגוף.
- **PWA standalone:** safe-area עליון/תחתון ושחזור scroll/focus לאחר סגירה.

## מטריצת בדיקה ידנית לאחר כל שלב

| סביבה | רוחב/כיוון | תרחישים |
|---|---|---|
| iOS Safari | 360 ו־390, portrait | פתיחה/סגירה, focus ראשון/אחרון, מעבר Next, גלילה עם מקלדת, safe-area |
| iOS PWA | 390 portrait + landscape | אותם תרחישים ללא chrome, סגירת מקלדת ושחזור גובה |
| Android Chrome | 360 ו־390 portrait + landscape | resize מול מקלדת, back לסגירת מקלדת/גיליון, scroll chaining |
| Desktop | צר ורחב | אין הגדלת מדיה ל־hero, focus trap, Escape והחזרת focus |

בכל סביבה: RecForm עם תמונה ובלעדיה/תמונה כושלת; HotelForm; הוצאה מהירה; מסמך עם קובץ/QR; כל סוגי EntryForm; Import AI/My Maps; Discover עם שורת סיכום; nested conflict; RTL/dark mode; ללא scrollbar אופקי; BottomNav/FAB מוסתרים בזמן overlay.

## אימות טכני בכל שלב

```text
bunx tsgo --noEmit
bun run build
```

בדיקות דפדפן וצילומי מסך לא יורצו כעת. בשלב היישום הן יורצו רק כחלק ממטריצת האימות הידנית ובאישור ההיקף של אותו שלב.
