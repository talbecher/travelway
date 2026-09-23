# Phase 1B — done

- [x] Image onError/onLoad handlers (7 imgs: recs card, day-entry card/header/details, lodging picker, Live Now, Nearby)
- [x] todayLocal() in format.ts; swapped in useTripIsActive + index.tsx (stats, todayDay, nextDay)
- [x] Remaining todayISO() sites inspected — intentionally unchanged
- [x] Build passed; broken-image runtime-verified; TZ contexts spot-checked

# Pre-trip home visual upgrade

- [x] Destination-focused opening image with local fallback
- [x] Day selector with stable manual selection and horizontal-only reveal
- [x] Saved-places preview from the active trip's existing records
- [x] Secondary preparation, budget, and tools presentation
- [x] Build, type check, browser verification, and screenshots

# Day screen + map fix round — done

- [x] Compact stop cards (72px thumb, icon-only fallback, 2-line meta, edit + more menu, drag handle only in sort mode)
- [x] Header: relevant hero image selection (no food/document), low panorama in list, compact in map; smaller tabs; fix date/city clipping
- [x] Map: real available-height sizing, no nav/FAB/attribution overlap, segment framing of the 2 endpoints only, stable zoom
- [x] Arrival details: remove air-distance walking estimates, "אפשרויות הגעה" row, cleaned sheet, correct from/to direction
- [x] Routing feasibility research + concrete proposal (separate deliverable)
- [x] Build and TypeScript checks; visual browser checks were explicitly waived

# Active-trip home redesign

- [x] Active-only panoramic opening with today imagery and contextual weather
- [x] Unified “today” card with timed, untimed, empty, missing, loading, and error states
- [x] Compact active-trip actions, nearby places, budget, checklist, and deadlines
- [x] Preserve pre-trip/post-trip behavior and existing handlers
- [x] Build and TypeScript checks

# Active-trip home polish

- [x] Improve active-trip image contrast and show weather only for a reliable day city
- [x] Replace today rows with an RTL itinerary sequence using original full-list numbering
- [x] Compact the empty-day state and active quick actions
- [x] Run TypeScript and build checks

# Destination photo attribution sheet

- [x] Replace the on-image Google credit line with a compact info button
- [x] Show structured Google Maps and photographer attribution in the existing bottom sheet
- [x] Run TypeScript and build checks

# Active home and day location polish

- [x] Add a visible city/area editor below the day header in list and map modes
- [x] Separate the displayed day area, weather city, and destination-photo search location
- [x] Refine active-trip weather and photo-info placement
- [x] Tighten the active today sequence and update remaining-stop copy
- [x] Run TypeScript and build checks

# Discover — סבב 1 (פיילוט, תצוגה מקדימה)

- [x] פונקציית שרת discoverPlaces: אימות, הרשאת פיילוט, זיהוי יעד, חיפוש לכל תחום, סינון ודירוג ממתן
- [x] תחימה ב-locationRestriction לפי viewport היעד + אימות עיר/מדינה מובנה
- [x] גיליון Discover וכרטיס תוצאה, בחירה מרובה ושמירה מנוטרלת
- [x] כניסה במסך ההמלצות מאחורי feature flag כבוי כברירת מחדל
- [x] בנייה ובדיקת טיפוסים

# Discover — שיפורי זרימה (סבב 4)

- [x] checkPilotAccess + הסתרת Discover ממשתמשים לא מורשים בשני המסכים
- [x] מצבי כרטיס „נשמר ✓” / „ביום זה ✓” וניתנות לבחירה לפי הקשר
- [x] פעולה משולבת „שמרו והוסיפו ליום” עם טיפול פר־מקום וכשל חלקי
- [x] שבבי פילטר מקומיים (תחומים, הסתר שמורים, הסתר ביום) + ספירת מוסתרים
- [x] שורת סיכום דביקה המחליפה את כפתור השמירה
- [x] bun run build ו־bunx tsgo --noEmit

# רענון UI למסך היום — עיצוב A2 (ללא שינוי לוגיקה)

- [x] כותרת נקייה על רקע חם (הסרת תמונת רקע — תצוגתית בלבד), מספר יום בולט + תאריך, כפתורים ≥44px
- [x] כרטיסי תחנות לבנים, גבול חם עדין, רדיוס 16, בלי צל כבד
- [x] ציר זמן coral מימין עם מספרים אמיתיים, אין קו אחרי התחנה האחרונה, pointer-events מושתקים
- [x] גשר „אפשרויות הגעה" coral בהיר, min-height 56, גמיש, מתחבר לציר
- [x] סרגל הוספה תחתון: + ≥48px, safe-area נשמר; יום ריק בשפת A2
- [x] בלי שינוי handlers/queries/mutations/routes/drag/map/Discover/BottomNav; רק tsgo + build

# מסך ההמלצות — ניסוח Discover וגישה קבועה להוספה

- [x] להבהיר את ניסוחי ההמלצות שנשמרו מ־Discover בלי לשנות recent/sessionStorage
- [x] להשאיר FAB הוספה יחיד במסך, מותאם להמלצות ולמלונות
- [x] להסתיר את ה־FAB בכל overlay פעיל, כולל Discover
- [x] להשאיר בסוף הרשימה רק את שתי פעולות הייבוא
- [x] להוסיף פעולת הוספה ישירה למצבי ריק אמיתיים
- [x] להריץ רק TypeScript ו־build

# שלב 1 — BottomSheet במובייל (מקלדת, Footer, overflow)

- [x] `BottomSheet`: הוסר `fixed`, נוסף איפוס מופע אחרי סגירה, Header/Body/Footer באותה מעטפת
- [x] `RecForm`: הוסרו margins שליליים בתוך גוף הגלילה והוסר `autoFocus` בפתיחה
- [x] טופסי הוצאה: כפתור שמירה ב־Footer חיצוני עם אותו submit
- [x] TypeScript ו־build עברו
- [ ] אימות ידני במכשיר Samsung (באחריות המשתמש)
