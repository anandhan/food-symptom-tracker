# v1 verification report (only what was run)

**When:** 2026-10-06  
**App URL:** http://localhost:43123  
**DB:** PostgreSQL 16 at `localhost:5432/food_tracker_dev`  
**Login used:** seed user `testuser` / `password123` (dev seed only)

---

## Build and tests (this run)

```
npm test
  Test Suites: 3 passed, 3 total
  Tests:       44 passed, 44 total

npm run build
  ✓ Compiled successfully
  ✓ Generating static pages (22/22)
```

New tests in `__tests__/dates-export.test.ts`:
- Calendar dates stored as UTC midnight (`2026-10-05T00:00:00.000Z`)
- `getCalendarDateInTimezone(2026-10-06T03:00Z, America/New_York)` → `2026-10-05`
- JSON export payload + CSV escape + import validation

---

## What I implemented this pass

1. **Calendar dates + TIMEZONE**
   - `lib/dates.ts`: parse/format YYYY-MM-DD as UTC midnight
   - Browser `LocalDateRedirect` sets `?date=` from the client local calendar
   - Cron / analysis / reports use `TIMEZONE` (default `America/New_York`)
   - Create/save/import/export/history/food/analysis use calendar helpers

2. **Dashboard widgets** (`lib/dashboard-stats.ts` + `app/page.tsx`)
   - Top foods, foods on bad days, foods on good days, 14-day symptom trend, latest weekly report

3. **Export/import** (already on main; tests + browser open of files this run)

---

## Browser verification (Chrome via `scripts/verify-browser.mjs` + `scripts/verify-import.mjs`)

| Item | Result | How |
|------|--------|-----|
| Login (username/password) | Pass | Signed in as testuser; landed on `/` |
| Dashboard widgets | Pass | Saw Today Oct 6, 2026; Top Foods (Water 14 days, Coffee with milk 7…); foods on bad days (Cereal with milk, Orange, Tomato soup, Pizza — 3 bad days each); foods on good days (Water 10, Coffee/Toast/Eggs/Chicken salad 6–7); symptom trend pills; latest weekly report empty at that moment (no report yet) |
| History food search | Pass | `chicken` → **Showing 21 of 28 entries** |
| History notes search | Pass | `bloating` → **Showing 16 of 28 entries** |
| History rating filter | Pass | Overall Feeling **Bad** → **Showing 1 of 28 entries** |
| Per-food `/food?food=Coffee` | Pass | Times Eaten, same-day rate, next-day rate, comparison, history list |
| Image **file upload** extraction | Pass | Fixture uploaded; Breakfast/Lunch/Dinner/Snacks filled with brand, serving, calories/macros; latte / espresso / coconut water tagged Drink; save dialog **Entry saved successfully!** |
| Image **Cmd+V paste** | Not re-tested this run | Code still listens for paste on `document`; only file input was exercised |
| Date-mismatch warning | Not seen this run | UI exists in `entry-form.tsx` (image date vs selected date + Switch). Screenshot of the extracted Oct 6 form did **not** show the yellow warning |
| Settings JSON export | Pass | Opened `food-tracker-export-*.json`: `version=1.0`, **28 entries**, meals/foodItems, symptomRecord |
| Settings CSV ZIP | Pass | Unzipped: `daily_entries.csv`, `meals.csv`, `food_items.csv` (**300 data rows** + header), `symptoms.csv` (**28 rows**), `food_concepts.csv` (**0 data rows** — seed does not create concepts) |
| JSON import | Pass | Dialogs: “Import 28 entries?” then **Successfully imported 28 entries!** |
| Weekly report generate | Pass | Reports page showed **Week of** after Generate |
| Mobile 390×844 dashboard | Pass | Screenshot taken |

**Today date in this VM:** Chrome’s local timezone is **UTC**, so the dashboard showed **Today Oct 6, 2026**. The unit test is what proves America/New_York would still be Oct 5 at `2026-10-06T03:00:00.000Z`. I did not have a browser TZ set to New York for this pass.

---

## Screenshot list (`/opt/cursor/artifacts/screenshots/`)

| File | What it shows (this run unless noted) |
|------|----------------------------------------|
| `01-login.png` | Login with Google + username/password on one screen |
| `02-dashboard.png` | Today Oct 6, stats, top/bad/good foods, trend, weekly report slot |
| `03-history-search-food.png` | Food search `chicken`, 21/28 |
| `04-history-search-notes.png` | Notes search `bloating`, 16/28 |
| `05-history-severity-filter.png` | Rating filter Bad, 1/28 |
| `06-mobile-view.png` | Dashboard at 390×844 |
| `08-per-food-detail.png` | Coffee detail: counts, rates, comparison, history |
| `09-settings-export.png` | Download JSON / CSV ZIP / import input |
| `10-exported-json.png` | Opened JSON (version, entries, meals) |
| `11-exported-csv.png` | Opened `food_items.csv` (date, meal, food, drink, macros) |
| `12-reports-generated.png` | Weekly report after Generate |
| `13-extraction-meals.png` | Same extraction view as 16 |
| `16-extraction-success.png` | Extracted MFP meals with brand/serving/nutrition/drinks |
| `17-import-restore.png` | Settings after successful import dialogs |

Older leftover files from prior agents (`14-extraction-details.png`, `15-date-warning.png`, `99-error.png`, `extraction-working.png`, `03-entry-form.png`, `06-edit-entry-before.png`, `07-edit-entry-after.png`) were **not** re-taken as the source of truth this run.

---

## Deferred / not claimed

- **Cmd+V paste** not exercised in this Chrome script (file upload was).
- **Date-mismatch warning** not visible on the extraction screenshot this run.
- **`food_concepts.csv` empty** after seed-only data (concepts are written on save+normalize).
- Dashboard “latest weekly report” was empty **before** I generated a report on the Reports page.
- Live Gemini (no `GEMINI_API_KEY` in this environment). Mock path was used (`VISION_PROVIDER=mock`).

---

## Vercel deploy checklist

### 1. Postgres
- Vercel → Storage → **Postgres** (or Neon). Copy `DATABASE_URL` / `POSTGRES_PRISMA_URL`.
- Schema provider is already `postgresql`.

### 2. Blob
- Vercel → Storage → **Blob**. Sets `BLOB_READ_WRITE_TOKEN`.
- Without it, uploads go to local `uploads/` (dev only).

### 3. Environment variables (Production)

```
DATABASE_URL=<Vercel Postgres or Neon URL>
NEXTAUTH_URL=https://YOUR-DOMAIN.vercel.app
AUTH_URL=https://YOUR-DOMAIN.vercel.app
NEXTAUTH_SECRET=<openssl rand -base64 32>
AUTH_SECRET=<same value>
ALLOWED_EMAILS=you@gmail.com
GOOGLE_CLIENT_ID=<from Google Cloud>
GOOGLE_CLIENT_SECRET=<from Google Cloud>
ADMIN_USERNAME=<your username>
ADMIN_PASSWORD_HASH=<node scripts/generate-password-hash.js 'password'>
ADMIN_EMAIL=you@gmail.com
VISION_PROVIDER=gemini
GEMINI_API_KEY=<Google AI Studio>
GEMINI_EXTRACTION_MODEL=gemini-2.5-flash
GEMINI_ANALYSIS_MODEL=gemini-2.5-pro
TIMEZONE=America/New_York
CRON_SECRET=<random>
BLOB_READ_WRITE_TOKEN=<from Blob store>
```

`VISION_PROVIDER` falls back to mock if `GEMINI_API_KEY` is unset.

### 4. Google OAuth redirect URIs
In Google Cloud Console → OAuth 2.0 Web client:

- `https://YOUR-DOMAIN.vercel.app/api/auth/callback/google`
- `http://localhost:43123/api/auth/callback/google` (local)

### 5. Migrate
After the first deploy (or when `DATABASE_URL` is known):

```bash
npx prisma migrate deploy
```

Do **not** run the seed script in production (it creates `testuser` / `password123`). Use `ADMIN_*` env vars for password login.

### 6. Cron
`vercel.json` already has:

```json
{ "crons": [{ "path": "/api/cron/weekly-report", "schedule": "0 9 * * 1" }] }
```

Monday 09:00 UTC. The route requires `Authorization: Bearer $CRON_SECRET`. Vercel Cron should send that header when `CRON_SECRET` is set. Week bounds are computed with `TIMEZONE` (default America/New_York).
