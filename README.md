# Food & Symptom Tracker

A complete, functional personal food and stomach-symptom tracking web application. Log what you eat daily, track how your stomach feels, and identify food-symptom patterns over time.

## Features

### Daily Entry (< 1 minute)
- **Quick Entry**: Open app → today selected → paste/upload food image → AI extracts → verify → add symptoms → save
- **Smart Extraction**: Handles MyFitnessPal-style screenshots with automatic meal categorization
- **Date Selection**: Navigate to any past date to add or edit entries
- **Image Support**: Paste (Cmd+V), drag-and-drop, or file upload
- **Nutrition Data**: Captures calories, macros when available from structured sources
- **Drink Detection**: Automatically tags drinks (coffee, water, juice) for analysis
- **Manual Entry**: Add foods without an image if needed

### Symptom Tracking
- **Free Text**: Describe exactly how you felt with timing details
- **Structured Fields**: Overall rating (great to very bad), bloating, gas, cramps, diarrhea, constipation severity
- **Event Timing**: Can tie symptoms to specific meals or times

### Data Management
- **Proper Schema**: Relational database with separation of raw data and AI interpretations
- **Food Normalization**: Maps entries to canonical concepts (e.g., "Dunkin Latte" → coffee, milk, sugar)
- **History Browsing**: View all past entries with search and filters (coming soon)

### Analysis (Planned)
- **Correlation Statistics**: Find foods associated with bad/good days (relative risk, confidence levels)
- **Delayed Reactions**: Check 24-48h lag windows
- **Food Combinations**: Identify problematic pairings
- **Evidence-Based**: Always shows sample sizes and never claims causation

### Weekly Reports (Planned)
- **Automated**: Runs every Monday via Vercel Cron
- **Comprehensive**: What you ate, how you felt, patterns, recommendations
- **AI-Powered**: Uses Gemini 2.5 Pro for high-quality insights

## Tech Stack

- **Framework**: Next.js 14 (App Router) + TypeScript
- **Database**: PostgreSQL via Prisma ORM
- **Auth**: NextAuth.js with Google OAuth (email allowlist) + credentials fallback
- **AI**: Google Gemini 2.5 (Flash for extraction, Pro for analysis)
- **Storage**: Vercel Blob for images
- **Styling**: Tailwind CSS + shadcn/ui components
- **Deployment**: Vercel (with Postgres, Blob, Cron)

## Local Setup

### Prerequisites
- Node.js 18+ and npm
- PostgreSQL database (local or remote)
- Google OAuth credentials (optional, can use credentials auth)
- Google Gemini API key (optional, has mock fallback)

### 1. Clone and Install

```bash
git clone <your-repo-url>
cd <repo-name>
npm install
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env.local` and fill in:

```bash
# Database (local Postgres, or Neon/Vercel pooled URL)
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/food_tracker_build
# On Vercel, set DATABASE_URL=${POSTGRES_PRISMA_URL} (pooled). Unpooled Neon
# hosts are rewritten to the -pooler endpoint at runtime.

# NextAuth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<generate-with-openssl-rand-base64-32>

# Google OAuth (optional)
GOOGLE_CLIENT_ID=<your-client-id>.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=<your-client-secret>
ALLOWED_EMAILS=your.email@gmail.com

# Google Gemini AI (optional — analysis interpretation only)
GEMINI_API_KEY=<your-gemini-api-key>
GEMINI_ANALYSIS_MODEL=gemini-3.8-flash

# Vercel Blob (auto-set in production, optional locally)
# BLOB_READ_WRITE_TOKEN=<vercel-blob-token>
```

### 3. Set Up Database

```bash
# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate dev

# (Optional) Seed with sample data — also creates/links food concepts
npm run seed

# Backfill concepts for entries saved before concept linking existed
npm run backfill-concepts
```

### 4. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deployment to Vercel

### Prerequisites
1. **Google OAuth Client** ([Google Cloud Console](https://console.cloud.google.com/))
   - Create OAuth client (Web application)
   - Authorized redirect URI: `https://your-app.vercel.app/api/auth/callback/google`
   - Save Client ID and Secret

2. **Gemini API Key** ([Google AI Studio](https://aistudio.google.com/apikey))

### Step-by-Step Deployment

1. **Connect Vercel to Origin**
   - Go to [Vercel Dashboard](https://vercel.com/dashboard)
   - New Project → Import from Git
   - Select "Cursor Origin" as source
   - Authorize and select your repository

2. **Add Storage**
   - In Vercel project → Storage → Create Database → Postgres
   - In Vercel project → Storage → Create Store → Blob

3. **Set Environment Variables**
   In Vercel project settings → Environment Variables:
   ```
   NEXTAUTH_URL=https://your-app.vercel.app
   NEXTAUTH_SECRET=<generate-random-secret>
   GOOGLE_CLIENT_ID=<your-client-id>
   GOOGLE_CLIENT_SECRET=<your-client-secret>
   ALLOWED_EMAILS=your.email@gmail.com,another@gmail.com
   GEMINI_API_KEY=<your-gemini-key>
   GEMINI_ANALYSIS_MODEL=gemini-3.8-flash
   DATABASE_URL=${POSTGRES_PRISMA_URL}
   # Pooled Prisma URL is required on Neon/Vercel. Unpooled DATABASE_URL is
   # rewritten to the -pooler host and opened via @prisma/adapter-neon.
   TIMEZONE=America/New_York
   CRON_SECRET=<random-string>
   ADMIN_USERNAME=<your-username>
   ADMIN_PASSWORD_HASH=<from scripts/generate-password-hash.js>
   ADMIN_EMAIL=you@example.com
   BLOB_READ_WRITE_TOKEN=<from Vercel Blob store>
   ```

4. **Deploy**
   - Commit and push to main branch
   - Vercel auto-deploys
   - First deployment may fail (missing migrations)

5. **Run Migrations**
   ```bash
   # Pull environment variables
   vercel env pull .env.local
   
   # Run migrations against production DB
   npx prisma migrate deploy
   ```

6. **Update OAuth Redirect**
   - Go back to Google Cloud Console
   - Update OAuth redirect URI to your actual Vercel URL

7. **Test**
   - Visit your Vercel app
   - Sign in with your allowed email
   - Add your first entry!

### Vercel Cron Setup

The weekly report cron job is configured in `vercel.json`:
```json
{
  "crons": [{
    "path": "/api/cron/weekly-report",
    "schedule": "0 9 * * 1"
  }]
}
```

Runs every Monday at 9 AM UTC. Vercel automatically secures this with `CRON_SECRET`.

## PWA Installation

### macOS (Safari/Chrome)
1. Open app in Safari
2. Click Share button → "Add to Dock"
3. App appears as standalone icon

### iOS/iPad (Safari)
1. Open app in Safari
2. Tap Share button
3. Scroll down → "Add to Home Screen"
4. Tap "Add"

## Project Structure

```
app/
├── api/
│   ├── auth/[...nextauth]/    # NextAuth handlers
│   ├── upload/                # Image upload endpoint
│   ├── extract/               # AI extraction endpoint
│   └── entries/               # Create/save entry endpoints
├── entry/                     # Daily entry page (main input)
├── history/                   # Browse past entries
├── analysis/                  # Food-symptom correlations
├── reports/                   # Weekly AI summaries
├── settings/                  # Export & configuration
└── page.tsx                   # Dashboard (home)

components/
├── ui/                        # shadcn/ui primitives
├── entry/                     # Entry form components
├── main-nav.tsx              # Navigation bar
└── session-provider.tsx      # Auth wrapper

lib/
├── ai/
│   ├── vision-provider.ts    # Gemini/mock extraction
│   └── food-normalization.ts # Concept mapping
├── auth.ts                   # NextAuth config
├── db.ts                     # Prisma client
└── utils.ts                  # Helpers

prisma/
└── schema.prisma             # Database schema

tests/
└── fixtures/
    └── myfitnesspal-example.png  # Test image
```

## Environment Variables Reference

### Required for Production
- `DATABASE_URL` - Postgres connection string (auto-set by Vercel)
- `NEXTAUTH_URL` - Your app URL
- `NEXTAUTH_SECRET` - Random secret (generate: `openssl rand -base64 32`)

### Authentication
- `GOOGLE_CLIENT_ID` - OAuth client ID
- `GOOGLE_CLIENT_SECRET` - OAuth client secret
- `ALLOWED_EMAILS` - Comma-separated list of authorized emails

### AI (Optional — analysis only)
- `GEMINI_API_KEY` - Get from Google AI Studio. Used only to interpret already-computed analysis/report stats.
- `GEMINI_ANALYSIS_MODEL` - Default: `gemini-3.8-flash` (retired `gemini-2.5-*` ids are remapped)
- Food extraction is on-device Tesseract.js + a deterministic MyFitnessPal parser. `VISION_PROVIDER` / `GEMINI_EXTRACTION_MODEL` are unused.

### Storage (Auto-set by Vercel)
- `BLOB_READ_WRITE_TOKEN` - Vercel Blob token

### Cron (Auto-set by Vercel)
- `CRON_SECRET` - Vercel cron authentication

## Testing

### Mock Mode (No API Keys Required)
Leave `GEMINI_API_KEY` unset:
- Screenshot / pasted-text extraction runs on-device (Tesseract.js + MFP parser)
- Manual food entry still works
- Analysis correlations stay rule-based; Gemini interpretation is skipped
- Perfect for development without API costs

### Test Fixture
`tests/fixtures/myfitnesspal-example.png` - Sample MyFitnessPal screenshot for testing extraction

### Saving
The entry Save button persists raw meals and symptoms in one Postgres transaction (target <2s). Food-concept linking is deterministic (rules only) and runs via `after()` and the weekly cron. Screenshots are read with Tesseract.js in the browser and parsed locally. Gemini is used only to interpret already-computed analysis/report stats. Correlation numbers stay deterministic; Gemini output is stored separately and can be regenerated. A retry after a 25s client timeout replaces meals for that date/slot instead of duplicating them.

## Cost Expectations

### Vercel Free Tier
- **Bandwidth**: 100 GB/month
- **Postgres**: 256 MB storage, 60 compute hours/month
- **Blob**: 1 GB storage, 10 GB bandwidth/month
- **Sufficient for**: Single-user personal tracking

### Google Gemini Free Tier
- **2.5 Flash**: 60 RPM, very generous token limits
- **2.5 Pro**: 10 RPM
- **For daily logging**: Essentially free within rate limits
- **Paid only if**: High-volume usage beyond free quotas

## Roadmap

### v1 (Current - Core Functionality)
- [x] Daily entry with image upload
- [x] AI extraction (Gemini vision + mock)
- [x] Food normalization
- [x] Symptom tracking
- [x] History search and filters
- [x] Per-food detail page
- [x] Analysis (relative risk, lag windows)
- [x] Weekly reports (manual + cron)
- [x] JSON / CSV export and JSON import
- [x] Authentication (Google OAuth + credentials)
- [x] Calendar-date storage + TIMEZONE for cron
- [x] Vercel deployment

### v2 (Future Enhancements)
- [ ] Advanced search and filters
- [ ] Interactive charts
- [ ] Recipe tracking
- [ ] Medication tracking
- [ ] Mobile app wrapper (Capacitor/Tauri)
- [ ] Multi-user/family sharing
- [ ] Food database integration
- [ ] Photo of actual meals

## Security

- Authentication required for all routes
- Email allowlist for OAuth (single-user focus)
- Secure HTTP-only session cookies
- All image URLs authenticated
- Rate limiting on login attempts
- No secrets in code (environment variables only)

## License

MIT

## Support

For issues or questions, please open a GitHub issue or contact the repository owner.

---

Built with ❤️ for personal health tracking.
