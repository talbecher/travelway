# Discover — בחירת יעד מדויקת מתוך הצעות

## מה ישתנה למשתמש
- במקום שדות „עיר” ו„מדינה” בטופס Discover: שדה אחד „איפה לחפש?” עם הצעות תוך כדי הקלדה (עיר, עיירה, שכונה, אזור, אגם).
- רק בחירה מפורשת מהרשימה הופכת את „חפש” לפעיל. שינוי הטקסט אחרי בחירה מבטל אותה. Enter לא שולח את הטופס.
- כשליעד אין תחימה תקינה: „לא התקבלה תחימה אמינה ליעד — בחרו יעד מצומצם יותר”. אין הרחבה אוטומטית.
- מילוי מראש מהטיול/היום (`defaultCity`) הופך לטקסט התחלתי בשדה בלבד — לא נחשב בחירה עד שבוחרים הצעה.

## סוגי יעד
- מתקבלים (בשרת, לפי `types` מ-Details): `locality`, `postal_town`, `sublocality`, `sublocality_level_1`, `neighborhood`, `colloquial_area`, `administrative_area_level_2`, `administrative_area_level_3`, `natural_feature`.
- נדחים: `country`, `administrative_area_level_1` (גדול מדי לתחימה), וכל מקום שאין לו אף אחד מהסוגים המותרים — כולל עסקים, אטרקציות ונקודות עניין.
- בהצעות: `includedPrimaryTypes` (עד 5) = `locality`, `sublocality`, `neighborhood`, `administrative_area_level_2`, `natural_feature`. השרת הוא הבדיקה הקובעת; הסינון בהצעות רק מצמצם רעש.

## זרימת הקריאות

```text
הקלדה (debounce 400ms, מינ' 2 תווים, session token)
  -> autocompletePlaces({ input, sessionToken, includedPrimaryTypes })   [N פעמים]
בחירת הצעה (בלקוח בלבד, ללא קריאת רשת)
  -> state: { placeId, label, sessionToken }
"חפש"
  -> discoverPlaces({ placeId, sessionToken, interests })
       1. Place Details (placeId, sessionToken)  — אימות + types/location/viewport/country
       2. SearchText לכל תחום עניין עם locationRestriction = viewport  [ללא שינוי]
       3. סינון: קוד מדינה של כל תוצאה == קוד המדינה של היעד
```

אימות בלי Details כפול: הלקוח לא קורא ל-Details בזמן הבחירה. ה-Details היחיד רץ בשרת בתוך `discoverPlaces`, עם אותו session token, וסוגר את הסשן. חיפוש חוזר לאותו יעד (למשל שינוי תחומי עניין) שולח את ה-`placeId` בלי token, ומבצע Details Essentials נוסף. אין מטמון.

## FieldMask ו-SKU (לפי תיעוד Places API New)
- Autocomplete: `suggestions.placePrediction.placeId,suggestions.placePrediction.structuredFormat` (ללא שינוי). SKU: Autocomplete Requests. סשן שמסתיים ב-Details מחויב לפי Details, ובקשות ההצעות בו לא מחויבות בנפרד. סשן נטוש (ניקוי, סגירה, בחירה בלי חיפוש) — כל בקשת הצעות מחויבת כ-Autocomplete Request. לכן לא מניחים שההצעות חינמיות.
- Details של היעד: `id,types,location,viewport,addressComponents`. כולם בשכבת Place Details Essentials (`id` הוא IDs Only). בלי `displayName`, `photos`, `rating` (Pro/Enterprise). את שם התצוגה לוקחים מההצעה שנבחרה.
- SearchText לכל תחום עניין: ללא שינוי (Text Search Enterprise בגלל rating/photos).
- תמונות: ללא שינוי (לפי דרישה, Place Photos).
- יש לאמת את שיוך השדות ל-SKU מול טבלת SKU העדכנית לפני המיזוג; לא מבצעים קריאות בתשלום בשלב התכנון.

## קריאות לחיפוש אחד (I = מספר תחומי העניין)

| | לפני | אחרי |
|---|---|---|
| הצעות | 0 | N (debounce) |
| Details | 0 | 1 (Essentials) |
| SearchText לזיהוי היעד | 1 (Text Search Pro — `types`, `addressComponents`, `viewport`) | 0 |
| SearchText לתוצאות | I | I |
| תמונות | לפי דרישה | לפי דרישה |

כלומר: Text Search Pro אחד מוחלף ב-Details Essentials אחד וב-N בקשות הצעות. אם החיפוש מתבצע, הבקשות האלה כלולות בסשן.

## קבצים
- `src/lib/places.functions.ts` — ל-`autocompletePlaces` נוסף פרמטר אופציונלי `includedPrimaryTypes` (רשימה מותרת קבועה, עד 5). בלעדיו ההתנהגות זהה לחלוטין. `getPlaceDetails` לא משתנה.
- `src/components/PlacesSearch.tsx` — שני props אופציונליים:
  - `includedPrimaryTypes`.
  - `mode="suggestionOnly"`: בבחירה קוראים ל-`onPick({ placeId, label, sessionToken })` בלי Details ובלי תמונה, והטקסט נשאר בשדה. כל שינוי טקסט קורא ל-`onPick(null)`.
  - ברירת המחדל לא משתנה לצרכנים הקיימים.
- `src/lib/discover.functions.ts` — הקלט משתנה ל-`{ placeId, sessionToken?, interests }` (ולידציה: placeId בתבנית בטוחה, אורך מוגבל). שלב הזיהוי ב-SearchText והשוואות השמות (`matchesTerm` לעיר ולמדינה) מוחלפים ב:
  - Details.
  - בדיקת סוג מותר.
  - חובת viewport, עם הודעה קיימת.
  - קוד מדינה מ-`addressComponents` (`country.shortText`).
  
  `textQuery` לכל תחום עניין: `${INTEREST_QUERY} ${label}`, כאשר ה-label מגיע מ-Details. ה-label נגזר מרכיב הכתובת הראשי (`locality`/`sublocality`/`natural_feature`) בלי `displayName`. אם אין label, החיפוש נעשה רק לפי מונח העניין, ו-locationRestriction עושה את התחימה. סינון המדינה בתוצאות עובר להשוואה של `shortText`. פיילוט, קטגוריות, דירוג, מספר תוצאות ותמונות לא משתנים.
- `src/components/discover/DiscoverSheet.tsx` — שני השדות מוחלפים ב-`PlacesSearch` במצב `suggestionOnly`. state הבחירה מתאפס בניקוי, בסגירה ובמעבר טיול. כל תשובת mutation מסומנת ב-seq, כדי שתשובה מאוחרת תיזרק. ההיסטוריה האחרונה (`discover-recent`) נשמרת עם placeId + label.
- `src/routes/recommendations.tsx`, `src/routes/itinerary.$dayId.tsx` — רק העברת טקסט התחלתי במקום `defaultCity`/`defaultCountry`, אם נדרש.

ללא שינוי: סכמה, ספריות, הרשאות פיילוט, שמירה, מנגנון התמונות.

## סיכונים ומגבלות
- לחלק מהאגמים או האזורים אין viewport, או שה-viewport שלהם גדול מאוד. במקרה כזה מוצגת הודעה, ואין הרחבה.
- `includedPrimaryTypes` מוגבל ל-5 סוגים. יעדים מסוג `postal_town` או `colloquial_area` עלולים לא להופיע בהצעות, אף שהשרת יקבל אותם.
- מונח חיפוש בעברית יחד עם label בשפה אחרת עלול לשנות את איכות התוצאות. התחימה ב-locationRestriction נשארת הקובעת.
- רשומות „אחרונים” ישנות שמבוססות על עיר+מדינה לא יתאימו לפורמט החדש. הן יוצגו כטקסט התחלתי בלבד ולא כבחירה.
- token שפג או נוצל, כשמבצעים חיפוש שני, נשלח בלי token. החיוב לפי Details רגיל.

## אימות אחרי היישום
`bunx tsgo --noEmit` ו-`bun run build`. את הממשק בודקים ידנית. אין בדיקות דפדפן ואין קריאות Google בתשלום מצדי.
