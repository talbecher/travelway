# Wander Together

Build a private, mobile-first PWA trip planner for two travelers. The app is a personal shared tool — not a public product. Backend: Supabase. Include a PWA manifest so it's installable to the home screen.

━━━━━━━━━━━━━━━━━━━━━━━━━

DESIGN

━━━━━━━━━━━━━━━━━━━━━━━━━

Style: Japanese wabi-sabi minimalism. Calm, generous whitespace, flat surfaces.

Colors: background #F7F5F0 (warm off-white), text #1A1A18 (near-black), accent #C25B3A (terracotta) for active states and alerts only. Dark mode supported.

Typography: Inter, weights 400 and 500 only. Line-height 1.7. No gradients, no shadows.

Mobile-first: 390px wide. Bottom nav with 4 tabs. All tap targets 44px minimum.

UI labels in Hebrew. Content (place names, activity names) in English/Japanese.

Every screen needs: loading skeleton, beautiful empty state, error handling.

━━━━━━━━━━━━━━━━━━━━━━━━━

DATABASE SCHEMA (Supabase — no RLS)

━━━━━━━━━━━━━━━━━━━━━━━━━

trips: id, title, destination_country, start_date, end_date, num_travelers, total_budget_ils, entry_pin, currency_code (default 'JPY'), created_at

itinerary_days: id, trip_id FK, date, day_number, city_label, notes

day_entries: id, day_id FK, entry_type ENUM['flight','hotel_checkin','attraction','food','transport','note'], title, description, time_of_day, location_name, google_maps_url, icon_emoji, display_order, linked_recommendation_id FK NULLABLE

recommendations: id, trip_id FK, name, type ENUM['food','attraction','hotel'], city, address, google_maps_url, latitude, longitude, notes, status ENUM['wishlist','visited','skipped'], rating INT(1-5), review, created_at

hotels: id, trip_id FK, hotel_name, type ENUM['hotel','ryokan','other'], city, checkin_date, checkout_date, price_per_night_ils, total_cost_ils, booking_platform, confirmation_url, cancellation_deadline DATE, notes, post_stay_rating INT(1-5), post_stay_review

expenses: id, trip_id FK, amount_ils DECIMAL, amount_foreign DECIMAL, foreign_currency VARCHAR, category ENUM['food','attraction','transport','shopping','accommodation','other'], description, location_name NULLABLE, linked_recommendation_id FK NULLABLE, expense_date DATE, created_at

settings: id, trip_id FK, base_currency VARCHAR DEFAULT 'ILS', foreign_currency VARCHAR DEFAULT 'JPY', manual_exchange_rate DECIMAL

━━━━━━━━━━━━━━━━━━━━━━━━━

ENTRY SCREEN (before login)

━━━━━━━━━━━━━━━━━━━━━━━━━

Full-screen Japan-themed landing: centered SVG torii gate silhouette in terracotta (#C25B3A), below it the trip title "יפן 2026" in large type, dates "17.11 – 08.12", and a small haiku in italic ("Ancient gates stand still / Two travelers pass through / The map opens wide"). Below: 4-digit PIN input pad. Correct PIN → enter app. Wrong PIN → gentle shake animation. Both users share one PIN ("1717").

━━━━━━━━━━━━━━━━━━━━━━━━━

BOTTOM NAV — 4 TABS

━━━━━━━━━━━━━━━━━━━━━━━━━

🏠 בית  |  📅 מסלול  |  💰 תקציב  |  ⭐ המלצות

GLOBAL FAB: floating terracotta "+" button always visible above the bottom nav. Opens a bottom sheet: "הוסף הוצאה מהירה" with fields — Amount (number), Currency toggle (₪ / ¥), Category (dropdown), Location (optional text), Date (default today). On save: deducts from trip budget and updates Budget screen in real time.

GLOBAL HEADER WIDGET: small currency converter pill pinned to the top-right of every screen. Tap → opens a modal overlay (currency converter — see below).

━━━━━━━━━━━━━━━━━━━━━━━━━

TAB 1 — בית (HOME)

━━━━━━━━━━━━━━━━━━━━━━━━━

Top section: trip title, destination flag emoji, "יום X מתוך 21", days until departure countdown (if before start date).

Budget snapshot card: a compact donut ring showing % of budget spent. Center of ring: remaining balance in ₪. Below ring: two small stats — "הוצאנו" (spent) and "ליום" (daily allowance = remaining ÷ days left).

Hotel alerts section: scan all hotels. If any cancellation_deadline is within 7 days from today → show a compact alert card with red left border: hotel name, city, "ביטול עד [date]", days remaining. If none → this section is hidden.

Shortcut grid: 4 large icon tiles linking to the 4 main tabs. Labels: "מסלול הטיול", "תקציב", "המלצות", "מלונות" (deep-link to hotels section within recommendations or budget).

━━━━━━━━━━━━━━━━━━━━━━━━━

TAB 2 — מסלול (TRIP PLANNER)

━━━━━━━━━━━━━━━━━━━━━━━━━

SECTION A — Trip Setup (shown once, editable later via settings icon):

A clean wizard card at the top of this tab on first launch:

• Field: יעד (destination country/city — text)

• Field: תאריך יציאה → תאריך חזרה (date range picker)

• Field: מספר נוסעים (stepper 1–8)

• Field: תקציב כולל ב-₪ (number input)

• Button: "צור את הטיול" → generates the day grid below and saves to 'trips' table.

SECTION B — Day Grid (calendar journal):

A vertical scrollable list of all trip days, grouped by city label (editable). Each day: a compact row showing day number, date, city label, and a small icon strip showing what entry types are planned (flight icon, fork icon, etc.).

Tap any day → Day Detail screen (full screen):

• Header: "יום [N]", date, city label (editable inline), back button.

• Entry list: ordered cards for all day_entries. Each entry card shows: time_of_day (optional), icon_emoji, title, description snippet.

• "+ הוסף לאותו יום" button → opens entry type picker — a horizontal icon row:

  ✈️ טיסה → form: airline, flight number, departure airport, arrival airport, departure time, arrival time, notes

  🏨 לינה → form: hotel name (or pick from saved hotels), check-in time, notes

  ⛩ אטרקציה → form: name (or pick from recommendations), area, notes, time

  🍜 אוכל → form: restaurant name (or pick from recommendations), area, cuisine type, notes, time

  🚆 תחבורה → form: type (train/bus/taxi/walk), from, to, notes, duration

  📝 הערה → free text note

  When picking from recommendations: searchable dropdown filtered by city.

Pre-populate trip with: destination "Japan", Nov 17–Dec 8 2026, 2 travelers, budget ₪15,000.

Pre-populate all 21 days with city labels:

Days 1-6: Tokyo | Days 7-8: Kanazawa | Days 9-14: Kyoto | Days 15-16: Hiroshima | Day 17: Miyajima | Days 18-20: Osaka | Day 21: נסיעה הביתה

Pre-populate day entries for key days:

Day 1 (Nov 17): ✈️ טיסה — Tel Aviv TLV → Tokyo NRT, Emirates EK931, 22:00

Day 2 (Nov 18): ✈️ נחיתה — NRT, 17:30 local time | 🚆 רכבת Narita Express to Shinjuku

Day 7 (Nov 24): 🚆 Shinkansen Tokyo → Kanazawa, 2.5 hours

Day 9 (Nov 26): 🚆 Kanazawa → Kyoto

Day 15 (Dec 2): 🚆 Kyoto → Hiroshima Shinkansen

Day 18 (Dec 5): 🚆 Hiroshima → Osaka

Day 21 (Dec 8): ✈️ טיסה — Osaka KIX → Dubai DXB → Tel Aviv TLV, Emirates

━━━━━━━━━━━━━━━━━━━━━━━━━

TAB 3 — תקציב (BUDGET)

━━━━━━━━━━━━━━━━━━━━━━━━━

Top: large donut chart (not a bar). Segments by category (food, attraction, transport, shopping, accommodation, other) each a different muted color. Center: remaining balance in large type + "נשאר" label below. Below chart: total budget vs total spent, and daily allowance.

Category breakdown: horizontal bars below the donut, one per category. Each bar: category icon + name, ₪ amount, % of total. Tap a category → filtered expense log.

Expense log: chronological list, newest first. Each expense card: category icon, description, location (if set), date, amount in ₪ (and foreign currency if logged in ¥). Swipe left to delete with confirmation.

Hotels cost section (collapsible): total accommodation cost auto-calculated from all hotel records. List of hotels with nightly rate and total.

Budget settings (gear icon top-right): edit total budget ₪, edit exchange rate (manual override).

━━━━━━━━━━━━━━━━━━━━━━━━━

TAB 4 — המלצות (RECOMMENDATIONS)

━━━━━━━━━━━━━━━━━━━━━━━━━

Sub-tabs at top: 🍜 אוכל | ⛩ אטרקציות | 🏨 מלונות

Filter pills below sub-tabs: city filter (הכל / Tokyo / Kanazawa / Kyoto / Hiroshima / Miyajima / Osaka).

FOOD & ATTRACTIONS:

GPS sorting: on load, request geolocation. Sort places by distance (Haversine). Show distance in meters or km below each card. City filter overrides to show only that city.

Each card: name, type icon, city + neighborhood, distance, status badge (wishlist / visited / skipped), star rating (shown after visited). Two action buttons: "ניווט" (opens google_maps_url in new tab) and "הוסף ליום" (opens day picker to add to a day entry).

After marking visited: inline prompt for rating (1–5 stars) + short review.

"+ הוסף מקום" FAB → form: name, type, city, address, Google Maps URL (paste link), notes.

HOTELS sub-tab:

List of all hotels with: name, type badge (מלון/ריוקאן), city, check-in → check-out, nights count, total cost ₪, booking platform, confirmation link (tappable), cancellation deadline.

Cancellation status:

🟢 בטוח — deadline > 7 days away

🟡 שים לב — deadline 3–7 days away

🔴 דחוף — deadline ≤ 3 days away (red border on card)

Post-stay: after checkout date → rating + review fields appear.

"+ הוסף מלון" → full hotel form.

Pre-populate recommendations with 12 food spots and 12 attractions (use realistic Japanese names and coordinates for Tokyo, Kanazawa, Kyoto, Hiroshima, Miyajima, Osaka — at least 2 per city per type).

Pre-populate hotels: 7 hotels as specified in the itinerary (boutique hotel Tokyo 6 nights, ryokan Kanazawa 2 nights, hotel Kyoto 3 nights, ryokan Arashiyama Kyoto 3 nights, hotel Hiroshima 2 nights, ryokan Miyajima 1 night, hotel Osaka 3 nights).

━━━━━━━━━━━━━━━━━━━━━━━━━

CURRENCY CONVERTER (modal)

━━━━━━━━━━━━━━━━━━━━━━━━━

Accessible from the header pill on every screen. Opens as a bottom sheet modal.

Layout: two currency selectors (from / to) with swap button between them. Amount input field. Large converted amount result.

Default: ILS → JPY.

Live rates: fetch from https://api.exchangerate-api.com/v4/latest/ILS (free, no key needed). Show last updated time. If fetch fails → fall back to manual rate from settings.

Common pairs to show as quick-tap shortcuts below: ₪→¥, ¥→₪, $→¥, €→¥.

The modal also shows: "שער מוגדר ידנית" toggle — when on, uses the manual rate from settings instead of live rate.

━━━━━━━━━━━━━━━━━━━━━━━━━

MICRO-INTERACTIONS

━━━━━━━━━━━━━━━━━━━━━━━━━

• Saving an expense: budget donut and balance update with a smooth count-up animation.

• Marking a recommendation as visited: card status badge changes with a gentle fade.

• Completing a day entry: subtle strikethrough animation.

• Hotel deadline turning red: pulse animation on the badge once.

• All bottom sheets: smooth slide up from bottom, drag to dismiss.

• No bouncy effects. Calm, deliberate, quiet animations only.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://travelway.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/779c2280-6d33-4962-bbc5-72ed8503f7b4).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
