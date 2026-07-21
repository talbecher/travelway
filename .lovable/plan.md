## מסך מסמכים — תוכנית מלאה

### 1. מיגרציה — טבלה `documents`
- שדות: `trip_id` (FK→trips, CASCADE), `title`, `type` (enum check: flight/hotel/attraction/insurance/visa/transport/other), `file_url`, `barcode_value`, `barcode_type` (qr/barcode128), `notes`, `amount_ils`, `is_paid`, `valid_date`, `display_order`, `created_at`.
- GRANTs: `SELECT,INSERT,UPDATE,DELETE` ל-`authenticated`; `ALL` ל-`service_role`.
- RLS: הפעלה + פוליסי אחד `FOR ALL` שמשתמש ב-`public.can_access_trip(trip_id)` (קיים כבר בפרויקט — עקבי עם שאר הטבלאות).

### 2. חבילות
- `bun add qrcode.react react-barcode`

### 3. Hook חדש — `src/hooks/use-documents.ts`
- `useDocuments(tripId)` — `queryKey: ["documents", tripId]`, סדר לפי `display_order, created_at`.
- `useAddDocument` / `useUpdateDocument` / `useDeleteDocument` — invalidate `["documents", tripId]`.
- כאשר מעדכנים ל-`is_paid=true` עם `amount_ils`: insert ל-`expenses` (category ממופה מסוג המסמך: flight→transport, hotel→hotel, attraction→attraction, transport→transport, השאר→other), description=title, ואז toast `"✅ הוצאה נוספה לתקציב"` + invalidate expenses.

### 4. Route חדש — `src/routes/documents.tsx`
- `createFileRoute("/documents")` עם head (title/description).
- שימוש ב-`useActiveTripId` + `useDocuments`.
- Header: כותרת "מסמכים", subtitle "כרטיסים, אישורים והזמנות", כפתור "+ הוסף מסמך" בפינה.
- פילטר סוגים אופקי-סקרוליבל: הכל / ✈️ טיסות / 🏨 מלונות / 🎭 אטרקציות / 🛡 ביטוח / 📋 ויזה / 🚆 תחבורה / 📄 אחר.
- רשימת כרטיסים לפי סוג:
  - **Flight** — סגנון boarding pass: כותרת עם ✈️, שורת TLV──✈──NRT (מנותח מ-title בפורמט `TLV→NRT` / `TLV-NRT` / `TLV NRT`; אם אין — מציגים רק את הכותרת), תאריך, badge תשלום, פעולות.
  - **Hotel** — סגנון room-key: 🏨 + שם, "צ'ק-אין: [date]", badge/סכום, פעולות.
  - **Other** — כרטיס נקי עם אימוג'י סוג, כותרת, notes, valid_date, badge, פעולות.
- Badge תשלום: ירוק `✓ שולם` (+סכום) / כתום `ממתין לתשלום`.
- פעולות בכל כרטיס: `💳 הצג ברקוד` (אם יש barcode_value), `📎 קובץ` (אם יש file_url — פותח בטאב חדש), `🗑 מחק` (עם confirm).

### 5. תת-קומפוננטות באותו קובץ
- **`BarcodeSheet`** (BottomSheet): רקע לבן מלא, מציג `<QRCodeSVG value size={280} />` או `<Barcode value format="CODE128" />`, כותרת המסמך למעלה, טקסט קטן "בהירות מסך מלאה" למטה, כפתור סגירה.
- **`DocumentForm`** (BottomSheet): שדות לפי הספק — סוג (segmented pills), כותרת, תאריך, הערות, ברקוד (input + toggle QR/Barcode128), קובץ מצורף (מעלה ל-bucket `rec-photos` תחת `documents/` כמו PhotoUploader אך גם PDF; שם קובץ + לינק אחרי העלאה), סכום ₪, טוגל "שולם?". כפתור שמירה sticky למטה.

### 6. חיווט מסך הבית
- `src/routes/index.tsx`: להפוך את הטייל "📄 מסמכים" ל-`<Link to="/documents">` פעיל (להסיר disabled/muted).

### 7. Route tree
- הקובץ החדש יירשם אוטומטית ב-`routeTree.gen.ts` על ידי הפלאגין.

### קבצים
- מיגרציה (טבלה + GRANT + RLS)
- `src/hooks/use-documents.ts` (חדש)
- `src/routes/documents.tsx` (חדש, כולל BarcodeSheet + DocumentForm)
- `src/routes/index.tsx` (חיווט טייל)
- `package.json` — הוספת `qrcode.react`, `react-barcode`
