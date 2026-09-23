# שלב 1 מצומצם — BottomSheet ושני מקרי ייחוס

## מטרה

לייצב את תשתית ה־BottomSheet במובייל ולהוכיח אותה בשני טפסים בלבד:
1. `RecForm` במסך ההמלצות.
2. טופס הוספת/עריכת הוצאה.

בסיום השלב עוצרים. שאר הגיליונות והטפסים נשארים ללא שינוי ומועברים לרשימת ההמשך.

## מה אומת מראש

- מותקנת `vaul` בגרסה `1.1.2`.
- הטיפוסים המותקנים כוללים `fixed`, `repositionInputs`, `nested` ו־`Drawer.NestedRoot`.
- המימוש המותקן של Vaul כבר מאזין ל־`window.visualViewport.resize` כאשר `repositionInputs` פעיל, משנה את גובה הגיליון מול המקלדת ומטפל ב־focus ובגלילה.
- Vaul כבר מספק focus trap, נעילת גלילת העמוד, סגירה והחזרת focus. לא יתווסף מנגנון חלופי ולא תהיה נגיעה ידנית ב־`document.body`.
- `src/routes/__root.tsx` כבר כולל `width=device-width, initial-scale=1, viewport-fit=cover`. לכן viewport metadata לא ישתנה בשלב זה.
- `BottomSheet` הנוכחי כבר משתמש ב־`92dvh`, אך אין לו footer חיצוני רשמי, `min-w-0` או `overscroll-contain`.
- `RecForm` כולל footer דביק בתוך גוף הגלילה ותצוגת תמונה גדולה דרך `PhotoUploader`.
- טופס ההוצאה המהירה נמצא ב־`GlobalFab.tsx`; טופס עריכת ההוצאה נמצא ב־`budget.tsx`. השינוי בהם יהיה רק במבנה הטופס/submit הדרוש לשימוש ב־footer החדש, לא במעטפת ה־FAB או בהתנהגות הגלובלית שלו.

## 1. חוזה BottomSheet לאחור־תואם

ה־API הקיים נשמר:

```ts
open: boolean
onOpenChange: (open: boolean) => void
title?: string
children: ReactNode
```

נוסיף props אופציונליים בלבד:

```ts
description?: string
footer?: ReactNode
contentClassName?: string
bodyClassName?: string
```

מבנה היעד:

```text
Drawer.Overlay — fixed
Drawer.Content — flex column, גובה אוטומטי עד תקרת visual viewport
├─ Handle/Header — shrink-0, אינו גולל
├─ Body — min-h-0 min-w-0 overflow-y-auto overscroll-contain
└─ Footer? — shrink-0, מחוץ ל־Body, עם safe-area
```

### פרטי התשתית

- `Drawer.Root` יקבל במפורש `fixed` ו־`repositionInputs`, משום ששניהם נתמכים בגרסה המותקנת.
- לא יתווסף listener חדש ל־`visualViewport`; נשתמש בטיפול הקיים של Vaul.
- `Drawer.NestedRoot` לא ייכנס בשלב זה, משום ששני מקרי הייחוס אינם דורשים nested sheet.
- הגובה יישאר דינמי על בסיס `dvh`, עם `max-height` ולא גובה קשיח, כדי שגיליון קצר יישאר קצר.
- ה־Body יקבל `min-h-0`, `min-w-0`, `overflow-y-auto`, `overscroll-contain` ו־`max-w-full`.
- ה־Footer יקבל safe-area תחתון וגבול עליון, ויישב מחוץ לאזור הגלילה.
- לא יתווסף `overflow-x-hidden` ל־`html`, `body` או מעטפת האפליקציה. כל חריגת רוחב תתוקן במקור.
- focus trap, dismissal, body scroll lock והחזרת focus יישארו התנהגות Vaul הקיימת.

## 2. RecForm בלבד

קובץ: `src/routes/recommendations.tsx`

- להסיר את ה־footer הדביק מתוך גוף הטופס.
- לתת לטופס `id` יציב ולהעביר ל־`BottomSheet.footer` כפתור `type="submit"` עם `form="..."`; כך אותו `onSubmit` ואותו handler נשארים ללא שינוי.
- ה־footer יוצג באותם תנאים שבהם כפתור השמירה מוצג כיום.
- לא לשנות סדר שדות, תוכן, validation, place selection, Google Places, manual mode, payload או save flow.
- להסיר כל גובה `vh` או גלילה סביב הטופס עצמו; ה־Body המשותף יהיה אזור הגלילה היחיד.
- לקבוע ל־input/select/textarea בתוך הטופס `text-base` במובייל ולשמור את הגודל הקיים במסכים רחבים אם נדרש.
- להוסיף `min-w-0`/`max-w-full` לעטיפות הרלוונטיות כדי למנוע scrollbar אופקי ב־360px.
- לעטוף את `PhotoUploader` מקומית כך שהתמונה הקיימת תוגבל לגובה 120–160px, ברוחב מרבי מלא וב־`object-cover`, ללא שינוי ב־`PhotoUploader`, במקור התמונה או בתהליך ההעלאה.
- לא לשנות את סדר השדות או להפוך את התמונה ל־hero.

## 3. טופסי הוצאה בלבד

קבצים:
- `src/components/GlobalFab.tsx` — הוספת הוצאה מהירה בלבד; אין שינוי ב־GlobalFab עצמו, במיקום או במנגנון overlay.
- `src/routes/budget.tsx` — עריכת הוצאה בלבד.

בכל אחד:

- לתת לטופס `id` יציב.
- להעביר את כפתור השמירה ל־`BottomSheet.footer` כ־submit חיצוני המחובר באמצעות `form` לאותו טופס.
- להשאיר את אותו `onSubmit`, אותו handler, אותם ערכים, validation, `assertOnline`, mutations ו־invalidation.
- להסיר footer דביק אם קיים; לא להוסיף scroll container פנימי סביב הטופס.
- לקבוע `text-base` לבקרי input/select/textarea במובייל.
- להוסיף `min-w-0` ו־`max-w-full` לעטיפות וגרידים רק היכן שנדרש למניעת overflow ב־360px.
- `autoFocus` יוסר רק אם הוא פותח את המקלדת לפני שהגיליון התייצב; לא יתווסף timeout או focus manager חדש.

## קבצים מותרים לשינוי בשלב זה

- `src/components/BottomSheet.tsx`
- `src/routes/recommendations.tsx`
- `src/components/GlobalFab.tsx`
- `src/routes/budget.tsx`

`src/styles.css` ישתנה רק אם אי אפשר לבטא כלל מקומי נדרש ב־classes; אין שינוי גלובלי ל־overflow. `src/routes/__root.tsx` לא ישתנה.

## מחוץ להיקף

- אין שינוי ב־BottomNav, במנגנון overlay גלובלי או ב־viewport metadata.
- אין שינוי בטפסי מסלול, מלון, מסמכים, Discover, ייבוא/ייצוא, חיפוש, דירוג, checklist או שאר callers.
- אין שינוי בסכמה, נתיבים, queries, mutations, validation, payloads, cache, invalidation, מפות, Discover, ייבוא, גרירה, offline או לוגיקת תמונות.
- אין שינוי בסדר השדות או בתוכן הטפסים.
- אין בדיקות דפדפן ואין צילומי מסך בשלב זה.

## אימות מותר

```text
bunx tsgo --noEmit
bun run build
```

## דוח הסיום של שלב 1

הדוח יכלול בלבד:
- הקבצים ששונו.
- חוזה ה־BottomSheet החדש.
- הגדרות Vaul שאומתו והופעלו.
- חיבור RecForm וטופסי ההוצאה ל־footer החדש.
- האם נותרה גלילה מקוננת או חריגת רוחב בשני מקרי הייחוס לפי בדיקת קוד ו־build בלבד.
- רשימת שאר ה־callers הדורשים התאמה בשלב הבא, ללא עריכתם.

## רשימת המשך — לא לעריכה בשלב 1

- `HotelForm` והתראת חפיפת המלונות המקוננת.
- טפסי המסלול וכל גיליונות יום המסלול.
- מסמכים ו־QR.
- Discover ושורת הסיכום.
- Import AI, Export AI ו־My Maps.
- חיפוש גלובלי ו־PlacesSearch.
- דירוג, „היינו כאן”, גרסאות יום וגרסת מסלול.
- checklist, ממיר מטבע, החלפת טיול וייחוס תמונה.
