# סבב תיקון ממוקד לפני סגירת המטבעים

## 1. תיעוד המיגרציה
קובץ חדש `supabase/migrations/20260924060000_settings_base_currency_backfill.sql` (קובץ בלבד — לא מורץ שוב על המסד):
```sql
UPDATE public.settings SET base_currency = 'ILS'
WHERE base_currency IS NULL OR base_currency = '';

INSERT INTO public.settings (trip_id, base_currency, foreign_currency)
SELECT t.id, 'ILS', COALESCE(NULLIF(t.currency_code, ''), 'JPY')
FROM public.trips t
WHERE NOT EXISTS (SELECT 1 FROM public.settings s WHERE s.trip_id = t.id)
ON CONFLICT (trip_id) DO NOTHING;
```
לפני הכתיבה ייבדק שקיים אילוץ ייחודי על `settings.trip_id` (תנאי ל־ON CONFLICT). אם אין — ידווח לפני המשך.

## 2. עריכת הוצאה קיימת (`src/routes/budget.tsx`, EditExpenseForm)
- `isForeign = amount_foreign != null && !!foreign_currency`.
- פתיחה: זר → סכום `amount_foreign` ומטבע `foreign_currency`; אחרת → `amount_ils` במטבע הבסיס.
- `fxCurrency` = `foreign_currency` של ההוצאה בלבד; `tripTarget` משמש רק כאפשרות מעבר כשההוצאה נשמרה בבסיס (לא כמטבע פתיחה).
- `moneyChanged === false` → נשלחים בדיוק `expense.amount_ils`, `expense.amount_foreign`, `expense.foreign_currency`.
- המרה מחדש רק כש־moneyChanged; חסימה ללא שער תקין נשמרת.

## 3. ייצוא ל־AI (`src/lib/export-to-ai.ts`)
- `generateAIPrompt(tripId, baseCurrency = "ILS")` ו־`generateDayAIPrompt(tripId, dayId, baseCurrency = "ILS")`.
- שורות 267–269 → `formatMoney(x, baseCurrency)`; שאר התוכן והמבנה ללא שינוי (שורת מלון 318 נשארת — מחוץ להיקף).
- callers: `itinerary.index.tsx` ו־`itinerary.$dayId.tsx` מעבירים `useBaseCurrency()`, ומוסיפים אותו ל־queryKey של הייצוא.

## מחוץ להיקף
מלונות, מסמכים, סמלי רמת מחיר באוכל, ממיר ILS, עיצוב, מודל המטבע.

## בדיקות
`bunx tsgo --noEmit` ו־`bun run build`, ודיווח על כל אחד מהסעיפים.
