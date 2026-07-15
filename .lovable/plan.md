# תכנית: שדרוג מפה — clustering, קריאות ומסלול

## סדר עדיפויות מאושר
1. Clustering (הכי חשוב)
2. פינים לפי סטטוס (ביקרנו/דילגנו)
3. BottomSheet במובייל בלחיצה על פין
4. כפתור "התמקד עלי"
5. שיפור Polyline (משקל/צבע — **בלי חיצים**, כדי לא לפגוע ב-SSR)
6. Legend (מקרא)

## שינויים

### `src/components/RecsMap.tsx` (עמוד המלצות)
- **Clustering**: עטיפת ה-Markers ב-`MarkerClusterGroup` מ-`react-leaflet-cluster`. `maxClusterRadius: 45`, `disableClusteringAtZoom: 15`, `spiderfyOnMaxZoom: true`. אייקון cluster מותאם בגרדיאנט סגול עם ספירה.
- **סטטוס חזותי**: `pinIcon(type, name, status)` — לפינים "ביקרנו" תוספת עיגול ירוק קטן ✓ בפינה, שקיפות 0.85. ל"דילגנו" — עיגול אפור ✕, שקיפות 0.5, תווית עם `line-through`.
- **BottomSheet בלחיצה**: הסרת ה-Popup לחלוטין. `eventHandlers.click` על המרקר יקרא ל-`onAddToDay(id)` שכבר פותח את `MapPickCard` הקיים (עם תמונה, ניווט, הוסף ליום).
- **כפתור "התמקד עלי"**: קומפוננטה פנימית `LocateButton` — כפתור צף בפינה ימנית-תחתונה, לחיצה `map.setView(userPos, 15)`. בלי הרשאה — מציג טוסט קצר "אין הרשאת מיקום".
- **Legend**: כרטיס קטן קפיץ בפינה שמאלית-עליונה — צבעי סוגים ומשמעות סמלי ✓/✕. פתיחה/סגירה בקליק.

### `src/components/DayMap.tsx` (מפת יום במסלול)
- **Clustering**: אותה עטיפה, אבל עם `disableClusteringAtZoom: 14` (כדי שהקו יראה טוב ברמת יום).
- **Polyline משופר**: משקל 4 במקום 3, אטימות 0.85, צבע `#6C63FF` מלא (בלי `dashArray`), `lineCap: "round"`, `lineJoin: "round"`. **בלי חיצים** — הכיוון יובן מהמספור על הפינים (1→2→3…).
- **כפתור "התמקד למסלול"**: כפתור צף שממקד מחדש את bounds של כל התחנות.

### `src/styles.css`
- אין תוספות — CSS של `leaflet.markercluster` יובא ישירות ב-`RecsMap.tsx` וב-`DayMap.tsx` (`import "leaflet.markercluster/dist/MarkerCluster.css"` + `MarkerCluster.Default.css`). מודולים אלה נטענים דרך `React.lazy` והם client-only.

## SSR / הבנות טכניות
- `RecsMap` ו-`DayMap` כבר נטענים דרך `React.lazy` בתוך `<ClientOnly>` — הוספת `MarkerClusterGroup` בטוחה כי היא רצה רק בצד לקוח.
- **אין** שימוש ב-`L.polylineDecorator` (זה מה שגרם בעבר לבעיות SSR — נשמט לפי בקשת המשתמש).

## בדיקות
- `/recommendations` → מפה: פינים מתקבצים כשקרובים; קליק על אשכול = זום/פיזור; קליק על פין בודד = פתיחת BottomSheet של המלצה; פינים "ביקרנו" עם ✓ ירוק ו"דילגנו" עם ✕ אפור; מקרא נפתח וקריא.
- `/itinerary/{dayId}` → מפת יום: פינים ממוספרים 1→N; Polyline רציף וברור; קליק על פין גולל לכרטיס ברשימה (כבר קיים); כפתור התמקדות מחזיר את כל התחנות למסך.
- כפתור "התמקד עלי" בשני המפות עובד או מציג הודעת חוסר הרשאה.

## חבילות
כבר הותקנו:
- `react-leaflet-cluster@4.1.3`
- `leaflet.markercluster@1.5.3`
- `@types/leaflet.markercluster@1.5.6`

## אין שינויי DB
כל השדות (`status`, `latitude`, `longitude`, `photo_url`, `notes`) כבר קיימים.