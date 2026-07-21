## הבאג
ב־`DocumentFormSheet` (src/routes/documents.tsx, שורות 386–399) נעשה שימוש שגוי ב־`useState(() => {...})` במקום `useEffect`. `useState` עם initializer רץ פעם אחת בלבד בעליית הקומפוננטה — לכן כשפותחים מסמך שני לעריכה, שדות הטופס לא מתרעננים ונשארים עם הערכים של המסמך הראשון. בשמירה זה דורס את המסמך השני עם התוכן של הראשון.

בנוסף, ה־initial state של כל `useState` קורא ל־`editing?.xxx` — בזמן mount `editing` הוא `null`, אז גם בפתיחה ראשונה של עריכה זה עובד רק "במקרה" (בגלל שה־sheet לא נפרק בין פתיחות).

## התיקון
בקובץ אחד: `src/routes/documents.tsx` — `DocumentFormSheet` בלבד.

1. להחליף את הבלוק `useState(() => { ... })` (שורות 386–399) ב־`useEffect` שרץ כש־`open` או `editing?.id` משתנים, ומאפס את כל השדות מתוך `editing` (או ברירות מחדל כשמדובר במסמך חדש).
2. להוסיף `import { useEffect } from "react"` (מצטרף ל־import הקיים).
3. לוודא ש־`useEffect` תלוי ב־`[open, editing?.id]` כדי שמעבר בין שני מסמכים שונים לעריכה יגרור reset נכון, וגם פתיחה חוזרת של הסהיט תאתחל.
4. שאר הלוגיקה (upload, save, mutations) נשארת כמו שהיא.

אין שינוי סכימה, אין נגיעה בכרטיסים או ב־BarcodeSheet.