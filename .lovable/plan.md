# תיקון ממוקד — שחזור BottomSheet ב־RecForm ב־Samsung

## ממצאים מאומתים בקוד

- `Drawer.Content` הוא `flex flex-col` ומוגדר כאלמנט הקבוע של הגיליון.
- בתוך ה־DOM שלו ה־Header, ה־Body ויעד ה־Footer הם אחים ישירים; `Context.Provider` אינו יוצר אלמנט DOM.
- ה־Body הוא האח האמצעי ומוגדר `flex-1 min-h-0 min-w-0 overflow-y-auto`.
- יעד ה־portal מופיע מיד אחרי ה־Body, מוגדר `shrink-0`, ואינו `sticky` או `fixed`.
- אין אלמנט flex נוסף אחרי יעד ה־Footer בתוך `Drawer.Content`.
- לכן מיקום ה־portal וחלוקת ה־flex בקוד הנוכחי אינם מסבירים שטח ריק *מתחת* ל־Footer.
- `repositionInputs` עדיין פעיל ללא תנאי בכל `BottomSheet`. ב־Vaul 1.1.2 הוא כותב `height` ו־`bottom` inline ל־`Drawer.Content` בזמן שינויי `visualViewport`; הכשל שנצפה ב־Samsung לאחר סגירת המקלדת מתאים ל־inline styles שלא שוחזרו נכון.
- אין אפשרות לשחזר את מקלדת Samsung מתוך סביבת הפיתוח. מקור התקלה הסופי יאומת במכשיר לאחר הפריסה; התיקון יבודד את מסלול Vaul החשוד רק ב־RecForm.

## השינוי

### `src/components/BottomSheet.tsx`

- להוסיף prop אופציונלי ולאחור־תואם, למשל `repositionInputs?: boolean`, עם ברירת מחדל `true`.
- להעביר את הערך ל־`Drawer.Root` במקום להפעיל `repositionInputs` ללא תנאי.
- להשאיר ללא שינוי את מבנה ה־DOM המחייב:

```text
Drawer.Content — flex flex-col
├─ Header — shrink-0
├─ Body — flex-1 min-h-0 min-w-0 overflow-y-auto
└─ Footer target — shrink-0, היעד האחרון וללא position sticky
```

- לא להוסיף listener, timeout, טיפול ידני ב־`visualViewport`, גובה קשיח, `overflow-hidden` או שינוי לכל הגיליונות.
- לא לשנות את focus trap, הסגירה, נעילת הרקע והחזרת ה־focus שמספק Vaul.

### `src/routes/recommendations.tsx`

- להעביר `repositionInputs={false}` רק לשני גיליונות שמארחים `RecForm`:
  - הוספת המלצה.
  - עריכת המלצה.
- לא לכבות את ההתנהגות בגיליונות אחרים במסך, לרבות בחירת יום, מלון, Discover או ייבוא.
- לשמור את `BottomSheetFooter` בתוך `RecForm`, את יעד ה־portal אחרי ה־Body, ואת אותו `form`, submit handler, validation, mutation ומצבי שמירה.
- לא לשנות שדות, סדר, תמונה, תוכן או לוגיקה עסקית.

## אימות

להריץ רק:

```text
bunx tsgo --noEmit
bun run build
```

בדיקת הקוד תאשר:
- יעד ה־Footer הוא הילד האחרון בפועל של מעטפת ה־flex.
- אין `sticky` ב־Footer ואין אזור flex אחריו.
- ברירת המחדל של כל שאר הגיליונות נשארת `repositionInputs=true`.
- רק שני מופעי `RecForm` מקבלים `false`.

לאחר הפריסה תבוצע בדיקת Samsung: פתיחת מקלדת, מעבר שדות, Back לסגירתה, בדיקת חזרת ה־Footer לתחתית ופתיחה חוזרת. אם השטח הריק נעלם, המקור הוא מסלול ה־inline `height`/`bottom` של Vaul; אם לא, יידרשו מדידות DOM מהמכשיר לפני שינוי נוסף.

## גבולות

ייערכו רק:
- `src/components/BottomSheet.tsx`
- `src/routes/recommendations.tsx`

לא ייערכו טופסי הוצאה, callers אחרים, סגנונות גלובליים, viewport metadata, schema, queries, mutations, cache או לוגיקת שמירה.
