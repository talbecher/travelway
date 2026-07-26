# Rename app to "TravelWay"

Style-only text replacements. No logic changes. Trip/user data untouched.

## Files

### 1. `public/manifest.webmanifest`
- `name`: `"TravelWay"`
- `short_name`: `"TravelWay"`
- `description`: `"TravelWay — your all-in-one travel planner"`

### 2. `src/components/SignInScreen.tsx`
- `<h1>` → `TravelWay`
- Tagline `מתכנן הטיולים שלך` → `Plan. Experience. Remember.`
- Keep travel SVG and Google button unchanged.

### 3. `src/routes/__root.tsx`
- `title` meta → `TravelWay`
- `description` meta → `TravelWay — your all-in-one travel planner`
- `og:title`, `twitter:title` → `TravelWay`
- `apple-mobile-web-app-title` → `TravelWay` (was `יפן 2026`)
- Keep og/twitter description consistent with new description.

### 4. `src/routes/documents.tsx`
- Route title `מסמכים · TripNote` → `מסמכים · TravelWay`

## Not changed
- Trip records in DB, city labels, itinerary content, user-entered text.
- Existing "יפן 2026" strings only appear as the app name in the two spots above; no other occurrences found.
