# Use uploaded TravelWay logo everywhere

Upload the provided logo as a Lovable asset and swap it into every place the app currently shows a logo/icon.

## Steps

1. **Store the logo as a project asset**
   - Run `lovable-assets create` on `/mnt/user-uploads/Gemini_Generated_Image_ppol67ppol67ppol.png` → `src/assets/travelway-logo.png.asset.json`.
   - Also copy the PNG into `public/` at two sizes for PWA/favicon use: `public/favicon.png`, `public/icon-192.png`, `public/icon-512.png` (overwriting the existing icon PNGs so the manifest keeps working).
   - Delete `public/favicon.ico` so no stale Lovable icon is served.

2. **Sign-in screen** (`src/components/SignInScreen.tsx`)
   - Replace the inline `<TravelSvg />` suitcase illustration with an `<img>` using the imported asset URL. Keep the "TravelWay" heading and tagline.

3. **Root `<head>`** (`src/routes/__root.tsx`)
   - Update the `links` array: replace the `favicon.ico` entry with `{ rel: "icon", type: "image/png", href: "/favicon.png" }`. Keep `apple-touch-icon` → `/icon-192.png`.

4. **Manifest** — no code change needed; `public/icon-192.png` and `public/icon-512.png` get overwritten with the new logo.

## Not changed
- App header (no logo currently rendered there).
- Trip/hero card content, destination flags, in-app illustrations unrelated to brand.
- Text labels — "TravelWay" wording stays as-is.
