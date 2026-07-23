## Goal
Update only `src/lib/export-to-ai.ts` to enhance the AI export prompt with a planning-status stats section and an extra analysis question about empty/sparse days, while extending the returned `ExportStats` object.

## Changes

### 1. Extend `ExportStats` type
Add three new fields to the exported type:
```ts
export type ExportStats = {
  totalDays: number;
  entryCount: number;
  emptyDays: number;
  sparseDays: number;   // days with exactly 1 entry
  plannedDays: number;  // days with ≥1 entry
  avgEntries: number;   // entries / plannedDays, rounded to 1 decimal
  hotelCount: number;
  charCount: number;
};
```

### 2. Compute planning metrics
After the `entriesByDay` map is built, calculate:
- `plannedDays` = number of days whose entry array length is ≥ 1
- `emptyDays` = number of days whose entry array length is 0 (already exists; keep behavior)
- `sparseDays` = number of days whose entry array length is exactly 1
- `avgEntries` = `entries.length / plannedDays`, rounded to 1 decimal place (`Math.round((avg * 10)) / 10`); if `plannedDays` is 0, fallback to `0`.

### 3. Insert planning status section
After the existing budget block (`💰 תקציב כולל`, `💸 הוצאנו עד כה`, `📊 נשאר`) and before the itinerary section, add:
```
📊 מצב התכנון הנוכחי:
- ימים עם תוכנית: {plannedDays} מתוך {totalDays}
- ימים ריקים לחלוטין: {emptyDays}
- ימים עם פחות מ-2 פעילויות: {sparseDays}
- ממוצע פעילויות ביום מתוכנן: {avgEntries}
```

### 4. Insert the 6th analysis question
After the existing `🗓 5. תזמון חכם` block and before the `✅ סיכום מבוקש:` section, add:
```
🗺 6. תכנון ימים חסרים ויום-דליל
- במסלול יש {emptyDays} ימים ריקים ו-{sparseDays} ימים דלילים.

לכל יום ריק, אנא הצע 3-4 פעילויות מומלצות לפי העיר שאני אהיה בה:
- שם המקום
- מדוע הוא מומלץ (ייחודיות, מיקום, חוויה)
- מחיר משוער (חינם / ¥ / ¥¥ / ¥¥¥)
- כמה זמן לתכנן (שעה / חצי יום / יום שלם)

לימים עם פחות מ-2 פעילויות, הצע פעילויות שמשלימות את מה שכבר תוכנן — באותו אזור, באותו קצב.
```

### 5. Update the returned `stats` object
Return the new fields alongside the existing ones:
```ts
return {
  prompt,
  stats: {
    totalDays: days.length,
    entryCount: entries.length,
    emptyDays,
    sparseDays,
    plannedDays,
    avgEntries,
    hotelCount: hotels.length,
    charCount: prompt.length,
  },
};
```

## Verification
- TypeScript typecheck should pass.
- The UI in `src/routes/itinerary.index.tsx` will ignore the new stats fields unless explicitly updated, which is out of scope per the request; no other files are touched.