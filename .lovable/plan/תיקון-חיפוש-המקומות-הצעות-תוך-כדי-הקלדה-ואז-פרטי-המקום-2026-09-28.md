# תיקון חיפוש המקומות — הצעות תוך כדי הקלדה ואז פרטי המקום

## מה ישתנה למשתמש
- בזמן הקלדה בשדה חיפוש מקום יופיעו הצעות (שם + כתובת קצרה), גם כשהחיפוש הישן חסום במגבלת השימוש.
- רק אחרי לחיצה על הצעה נטענים פרטי המקום, ואז הטופס מתמלא כמו היום (שם, כתובת, מיקום, עיר, סוג, תמונה, דירוג Google).
- Enter בשדה החיפוש לא שולח את הטופס. חצים מסמנים הצעה, Enter בוחר רק הצעה מסומנת; בלי סימון — לא קורה כלום.
- כישלון בטעינת הפרטים: הודעה קצרה, ההצעות נשארות לניסיון חוזר, הטופס לא מקבל מקום חלקי. כישלון תמונה לא חוסם את הבחירה.
- בהצעות לא יוצג עוד דירוג (Autocomplete לא מחזיר אותו); הדירוג יגיע אחרי הבחירה.

## מסלולים שעוברים לשיטה החדשה (כל מופעי שדה החיפוש)
- הוספת/עריכת המלצה, מסך היום (4 מופעים), טופס מלון, „היינו כאן”.

## נשאר תלוי בחיפוש הישן (ידווח בנפרד)
- ייבוא AI — אימות אוטומטי בלי בחירת משתמש. לא יועבר להצעה הראשונה ולא ייחשב מתוקן.

## Technical details
- `src/lib/places.functions.ts` — שתי פונקציות שרת חדשות, המפתח נשאר בשרת; `searchPlaces` לא משתנה:
  - `autocompletePlaces({ input, sessionToken })` → POST `places:autocomplete`, `languageCode: he`, FieldMask `suggestions.placePrediction.placeId,suggestions.placePrediction.structuredFormat`. מחזיר `{ suggestions: {placeId, main, secondary}[], error? }`; סטטוס Google בלוג בלבד.
  - `getPlaceDetails({ placeId, sessionToken })` → GET `places/{id}?sessionToken=…`, FieldMask: `id,displayName,formattedAddress,location,primaryTypeDisplayName,photos,addressComponents,rating,userRatingCount`. מחזיר `PlaceResult` באותו מבנה (`extractCity`, `google_maps_url` קיימים).
  - rating/userRatingCount נשארים: RecForm שומר אותם בפועל (`setGoogleRating`/`setGoogleRatingCount`).
- הקשר גיאוגרפי: החיפוש הקיים לא שולח עיר, מדינה או הטיית מיקום — רק טקסט + `he`. לכן לא תתווסף הטיה או הגבלה חדשה.
- `src/components/PlacesSearch.tsx`:
  - seq מתעדכן מיד בכל שינוי קלט (כולל ניקוי וירידה מתחת ל־2 תווים) לפני ה־debounce של 400ms; מתחת ל־2 תווים — אין בקשה.
  - session token (`crypto.randomUUID()`) נוצר בהקלדה הראשונה ומשותף להצעות ולפרטים; אחרי תשובת Details (הצלחה או כישלון) ה־token נזרק, ניסיון חוזר ייצור סשן חדש; ניקוי/נטישה מבטלים את הסשן. החידוש אינו תלוי בתמונה.
  - בחירה: `pickingRef` ננעל מיד; בדיקת רלוונטיות (seq + דגל mounted) אחרי Details וגם אחרי התמונה, לפני `onSelect`. סגירת טופס/מעבר טיול מנתקים את הרכיב או מאפסים את seq, כך שתשובה מאוחרת נזרקת.
  - תמונה: `getPlacePhotoUrl` 400px פעם אחת; כישלון → `photo_url: null`, בלי Details נוסף.
  - נגישות: `role=combobox`, `aria-expanded`, `aria-controls`, `aria-activedescendant`, `role=listbox/option`; Enter תמיד `preventDefault`.
  - `onSelect` מקבל `SelectedPlace` זהה — אין שינוי בצרכנים.
- ללא שינוי: Discover, העשרת My Maps, מכסות, חיוב, סכמה, לוגיקת שמירה, הזנה ידנית.

## קריאות לבחירה אחת
- N קריאות Autocomplete (אחת לכל הפסקת הקלדה) + 1 Details + 1 תמונה. מכסות רלוונטיות: `AutocompletePlacesRequest` (Autocomplete) ו־`GetPlaceRequest` (Details), ו־`GetPhotoMediaRequest` לתמונה — בנפרד מ־`SearchTextRequest`. הגבולות בפרויקט לא ידועים ולא ינוחשו.

## אימות
- `bunx tsgo --noEmit`, `bun run build`.
- קריאות שרת חיות ל־autocomplete ול־details בזמן ש־searchText מחזיר 429 (ללא הדפסת המפתח).
- בדיקת דפדפן רק אם יש טיול בחשבון הבדיקה; אחרת הדוח יפריד בין מה שנבדק בפועל למה שאומת בקריאת קוד בלבד.
