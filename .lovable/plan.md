# שלב 1 מתוקן — שחזור מקלדת, Footer ו־overflow במקרי הייחוס

## מטרה וגבולות

לייצב את `BottomSheet` ושני מקרי הייחוס בלבד:
1. `RecForm` במסך ההמלצות.
2. הוספת הוצאה מהירה ועריכת הוצאה.

השלב לא ייחשב גמור לפי TypeScript ו־build בלבד. לאחר היישום תידרש בדיקה ידנית במכשיר Samsung של מחזורי focus, מקלדת, Back, גלילה, סגירה ופתיחה מחדש.

`documents.tsx` יישאר מחוץ לשלב 1 למרות שהצילום מוכיח בו overflow; הוא יופיע ראשון ברשימת ההמשך.

## ממצאים שאומתו בקוד

- מותקנת `vaul` בגרסה `1.1.2`.
- `fixed`, `repositionInputs`, `nested` ו־`Drawer.NestedRoot` נתמכים בגרסה המותקנת.
- כאשר `repositionInputs` פעיל, Vaul מאזין ל־`window.visualViewport.resize`.
- במסלול המקלדת Vaul כותב ישירות ל־`Drawer.Content`:
  - `style.height` בזמן פתיחת המקלדת.
  - `style.height = initialDrawerHeight` במסלול השחזור.
  - `style.bottom` לפי ההפרש בין `innerHeight` ל־`visualViewport.height`.
- במסלול זה Vaul אינו כותב `transform`; transition ה־transform שייך לפתיחה, סגירה וגרירה של הגיליון.
- עם `fixed`, החישוב מפחית את הפרש המקלדת מהגובה הנמדד באותו אירוע resize. לכן רצף אירועי resize ב־Android הוא נקודת חשד ממשית לכיווץ מצטבר או לשחזור חלקי, אך התוצאה בפועל תאומת במכשיר לפני בחירת התיקון.
- `initialDrawerHeight` נשמר ב־ref והחזרה אליו תלויה בזיהוי מצב המקלדת של Vaul ובאירוע resize נוסף.
- `BottomSheet` מוסיף במקביל `max-h-[92dvh]`. inline `height` של Vaul ו־`max-height` הדינמי אינם אותה מגבלה, ולכן יש לבדוק אם השילוב יוצר גובה ביניים או שטח ריק לאחר סגירת המקלדת.
- ה־Header, Body וה־Footer נמצאים באותה מעטפת flex. רק ה־Body מקבל `flex-1 min-h-0 overflow-y-auto`; ה־Footer אינו מחשב viewport בנפרד.
- ה־Footer המשותף מרונדר ב־portal אל יעד שנמצא בתוך `Drawer.Content`, ולכן הוא אמור להימדד כחלק מאותה מעטפת; יש לוודא שאין ליעד או לתוכן המועבר רוחב גדול מהגיליון.
- ב־`documents.tsx` נמצאו מוקדי overflow נפרדים, כולל QR קבוע בגודל `260px`, ברקוד צד־שלישי, אזור מסננים `min-w-max`, footer דביק עם margins שליליים ושדות בגודל טקסט קטן. הם לא יתוקנו בשלב זה.

## 1. אבחון לפני שינוי נוסף

יש לבדוק במכשיר Samsung ובכלי הפיתוח המרוחקים את `Drawer.Content` בזמן הרצף הבא: פתיחה ללא מקלדת → focus בשדה עליון → מעבר לשדה תחתון → Back לסגירת המקלדת → סגירת הגיליון → פתיחה מחדש.

בכל נקודת זמן לרשום בלבד:
- `visualViewport.height`, `window.innerHeight` ו־`getBoundingClientRect()` של הגיליון.
- inline `height`, `max-height`, `bottom` ו־`transform` על `Drawer.Content`.
- `clientHeight`, `scrollHeight` ו־`scrollTop` של ה־Body.
- גובה ה־Header וה־Footer.
- האלמנט הפעיל ומיקומו ביחס לשטח שבין Header ל־Footer.

ההחלטה על התיקון תתבסס על ההתנגשות שנצפתה:
- אם Vaul משאיר `height`/`bottom` זמני — לתקן את מחזור השחזור במעטפת המקומית או לבחור הגדרת Vaul יציבה יותר.
- אם `92dvh` מגביל את גובה השחזור — לשנות את אסטרטגיית הגובה של המעטפת כך שיהיה מקור גובה יחיד.
- אם אירועי resize חוזרים גורמים להפחתה מצטברת — להימנע משילוב ההגדרות שגורם לכך, בלי להוסיף listener מקביל.
- אם הבעיה היא flex sizing — לתקן את חלוקת הגובה בין Header, Body ו־Footer בלבד.

לא יתווסף listener חדש ל־`visualViewport`, timeout, focus manager או workaround לפני שהמדידות מזהות את המסלול המדויק.

## 2. חוזה BottomSheet לאחור־תואם

ה־API הקיים יישמר, כולל התוספות שכבר הוגדרו:

```ts
open: boolean
onOpenChange: (open: boolean) => void
title?: string
description?: string
footer?: ReactNode
contentClassName?: string
bodyClassName?: string
children: ReactNode
```

גם `BottomSheetFooter` יישאר נתמך עבור טופס שמנהל את ה־state שלו בתוך `children`.

מבנה היעד:

```text
Drawer.Overlay — fixed
Drawer.Content — מקור גובה יחיד, ברוחב viewport תקין
├─ Header — shrink-0, אינו גולל
├─ Body — min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain
└─ Footer — shrink-0, מחוץ לגלילה ובתוך הגובה הגלוי, עם safe-area
```

קריטריונים מחייבים:
- אחרי סגירת המקלדת הגיליון חוזר לגובה שלפני פתיחתה.
- לא נשארים שטח ריק גדול, Body מכווץ או inline style זמני שגוי.
- ה־Footer נשאר מחוץ לגלילה אך בתוך הגובה הגלוי.
- focus trap, סגירה, scroll lock והחזרת focus נשארים בידי Vaul.
- Back ראשון סוגר מקלדת ומשאיר את הגיליון פתוח; Back נוסף שומר את התנהגות הסגירה הקיימת.
- פתיחה מחדש אינה משמרת גובה או scroll offset מקריים מהמופע הקודם.

## 3. גלילה ופוקוס בשני מקרי הייחוס

ב־`RecForm`, הוספת הוצאה ועריכת הוצאה:
- ה־Body המשותף יהיה אזור הגלילה היחיד סביב הטופס.
- ה־Footer החיצוני יישאר מחובר לאותו `form` ולאותו submit handler באמצעות `id`/`form`.
- שדה שמקבל focus יימצא באזור שבין Header ל־Footer, והמשתמש יוכל לגלול לכל שדה כשהמקלדת פתוחה.
- מעבר בין סכום, קטגוריה, תיאור, קישור ושדות תחתונים לא ישנה את מבנה הגיליון.
- `input`, `select` ו־`textarea` יישארו לפחות 16px במובייל.
- לא יתווספו גובה `vh` פנימי, scroll container נוסף או `autoFocus` שפותח מקלדת לפני התייצבות הגיליון.
- תמונת ההמלצה תישאר בגובה 120–160px, `max-width: 100%` ו־`object-fit: cover`, ללא שינוי במקור או בהעלאה.

## 4. איתור ותיקון overflow אופקי

בשני מקרי הייחוס תיבדק כל שרשרת ה־DOM:
- `Drawer.Content`, Header, Body ו־Footer.
- יעד ה־portal ותוכן ה־Footer.
- form ועטיפות `flex`/`grid`.
- inputs, selects, כתובות ו־URLs ב־LTR.
- `PhotoUploader`, כפתורי הקטגוריה ושורת סכום/מטבע.

בכל שכבה יתווספו רק לפי הצורך `min-w-0`, `w-full`, `max-w-full`, שבירת טקסט או עמודת `minmax(0,1fr)`.

ייבדקו במיוחד:
- `w-screen`/`100vw` בתוך container עם padding.
- רוחב או `min-width` קבועים.
- margins שליליים ו־translate.
- grid שהעמודות וה־gap שלו רחבים מההורה.
- URL או כתובת LTR ארוכים.
- Footer שמרונדר ביחס למעטפת רחבה מהגיליון.

לא יתווסף `overflow-x-hidden` גלובלי ולא יוסתר scrollbar מקומי לפני זיהוי ותיקון הילד החורג.

## 5. קבצים מותרים לשינוי

- `src/components/BottomSheet.tsx`
- `src/routes/recommendations.tsx`
- `src/components/GlobalFab.tsx` — רק `QuickExpenseForm`, ללא שינוי במנגנון ה־FAB/overlay
- `src/routes/budget.tsx` — רק טופס עריכת הוצאה

`src/styles.css` ישתנה רק אם כלל מקומי הכרחי אינו ניתן לביטוי במחלקות, וללא כלל overflow גלובלי.

לא ייערכו `src/routes/__root.tsx`, viewport metadata, `BottomNav`, מנגנון overlay גלובלי או caller נוסף.

## 6. שימור לוגיקה

אין שינוי בסכמה, נתיבים, queries, mutations, validation, payloads, cache, invalidation, מפות, Discover, ייבוא, גרירה, offline, העלאת תמונות, סדר השדות או תוכן הטפסים.

## 7. אימות טכני

יורצו רק:

```text
bunx tsgo --noEmit
bun run build
```

הפקודות מאמתות תקינות טכנית בלבד ואינן הוכחה לפתרון בעיית המקלדת או ה־overflow.

## 8. מטריצת קבלה ידנית ב־Samsung

יש לבצע ברוחב המכשיר בפועל:

1. לפתוח הוספת המלצה ללא מקלדת ולגלול עד סוף הטופס.
2. להתמקד בשדה עליון, לעבור לשדה תחתון ולסגור את המקלדת.
3. לוודא שהגיליון חוזר לגובהו, ללא שטח ריק וללא תוכן חתוך.
4. לסגור ולפתוח מחדש את אותו גיליון ולוודא שהגובה והגלילה אופסו.
5. בטופס הוצאה להתמקד ברצף בסכום, קטגוריה, תיאור וקישור.
6. בכל focus לוודא שהשדה וכפתור השמירה נגישים ושמבנה הגיליון אינו משתנה.
7. לסגור מקלדת עם Back ולוודא שהגיליון נשאר פתוח ומשחזר גובה.
8. ללחוץ Back שוב ולאמת את התנהגות הסגירה הקיימת.
9. לבדוק שאין scrollbar אופקי ואין תוכן רחב מה־viewport בכל מצב.

אם אחד התרחישים נכשל, שלב 1 נשאר פתוח. דוח הסיום יציין במפורש שה־build עבר אך האימות במכשיר נכשל או ממתין; אין להכריז שהבעיה נפתרה ללא תוצאת Samsung.

## 9. רשימת המשך — ללא עריכה בשלב 1

1. `src/routes/documents.tsx` — ראשון לטיפול: טופס מסמך, QR/Barcode, footer דביק וה־overflow שהוכח בצילום.
2. `HotelForm` והתראת חפיפת המלונות המקוננת.
3. טפסי המסלול וכל גיליונות יום המסלול.
4. Discover ושורת הסיכום.
5. Import AI, Export AI ו־My Maps.
6. חיפוש גלובלי ו־PlacesSearch.
7. דירוג, „היינו כאן”, גרסאות יום וגרסת מסלול.
8. checklist, ממיר מטבע, החלפת טיול וייחוס תמונה.
