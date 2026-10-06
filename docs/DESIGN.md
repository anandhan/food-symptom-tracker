# Food & Symptom Tracker - Design Document

## 1. Architecture and Tech Stack

### Overview
A single-user progressive web application for tracking daily food intake and stomach symptoms, with AI-assisted data entry and statistical analysis to identify food-symptom correlations over time.

### Tech Stack Selection

#### Frontend & Backend Framework
**Next.js 14+ (App Router) + TypeScript**
- **Reasoning**: 
  - Full-stack React framework with excellent developer experience
  - App Router provides modern server components and streaming
  - API Routes for backend logic without separate server
  - Built-in image optimization
  - Excellent deployment story (Vercel, Docker, self-hosted)
  - Strong TypeScript support throughout
  - Native PWA support via next-pwa plugin

#### Database
**PostgreSQL via Prisma ORM**
- **Reasoning**:
  - Robust relational database perfect for structured tracking data
  - ACID compliance ensures data integrity
  - Excellent support for complex queries needed for correlation analysis
  - JSON columns for flexible metadata storage
  - Prisma provides type-safe database access with auto-generated types
  - Easy migrations and schema versioning
  - Works well with Vercel Postgres, Railway, Supabase, or self-hosted

#### Authentication
**NextAuth.js v5 (Auth.js) with Google OAuth + Allowlist**
- **Reasoning**:
  - Google OAuth as primary authentication method (familiar, secure, no password management)
  - Email allowlist via `ALLOWED_EMAILS` env var restricts access to specific Gmail addresses
  - Username/password fallback for when Google auth unavailable or for local development
  - Session management with secure HTTP-only cookies
  - CSRF protection built-in
  - Single-user setup with multi-email support (user's own devices)

#### Image Storage
**Vercel Blob Storage**
- **Reasoning**:
  - Native integration with Vercel deployments
  - Simple API for upload/download
  - Automatic CDN distribution
  - Signed URLs for security
  - No additional infrastructure needed
  - Generous free tier for single-user app

#### AI/OCR Layer
**Provider-pluggable Vision LLM with Google Gemini**
- **Primary**: Google Gemini 2.5 models
  - **Extraction/Normalization**: `gemini-2.5-flash` (fast, cost-effective, vision-capable)
  - **Weekly Reports**: `gemini-2.5-pro` (higher quality analysis and narration)
- **Fallback**: Mock/manual mode when no API key present
- **Reasoning**:
  - Gemini 2.5 Flash excels at vision and text extraction with low latency
  - Gemini 2.5 Pro provides superior reasoning for weekly analysis
  - Cost-effective: Flash is very affordable for high-volume extraction
  - Strong multimodal understanding for food context
  - Official Google Gen AI SDK with TypeScript support
  - Both models configurable via separate env vars
  - JSON mode for structured meal categorization
  - Provider abstraction allows future extensions
  - Mock mode ensures app is testable without API costs

#### UI Components
**Tailwind CSS + shadcn/ui**
- **Reasoning**:
  - Modern, utility-first CSS framework
  - shadcn/ui provides accessible, customizable React components
  - Responsive design primitives
  - Excellent mobile support
  - Fast development without heavy component library lock-in

#### Scheduled Jobs
**Vercel Cron**
- **Reasoning**:
  - Native Vercel integration for weekly reports
  - Simple cron expression configuration in vercel.json
  - No additional infrastructure or services needed
  - Automatic CRON_SECRET injection for security

#### PWA Support
**next-pwa + service worker**
- **Reasoning**:
  - Enables "Add to Home Screen" on iOS/macOS
  - Offline capability for viewing history
  - Native-like experience
  - Fast loading with pre-caching

### Deployment Target

**Vercel** (Primary deployment platform)
- **Repository**: Cursor Origin (not mirrored to GitHub)
- **Database**: Vercel Postgres (powered by Neon)
- **Image Storage**: Vercel Blob Storage
- **Scheduled Jobs**: Vercel Cron
- **Authentication**: Google OAuth + NextAuth.js
- **HTTPS**: Automatic with custom domain support
- **Deployment**: Automatic on push to main branch

**Connection Setup**:
1. Vercel supports importing from Cursor Origin repositories
2. Authorize Vercel to access Origin during project creation
3. Select repository from Origin (no GitHub mirror needed)
4. Configure environment variables in Vercel dashboard
5. Automatic deployments on every push

**Why Vercel**:
- Zero-configuration database and storage
- Excellent Next.js integration (built by same team)
- Generous free tier for single-user apps
- Built-in analytics and monitoring
- Edge network for fast global access

---

## 2. Database Schema

### Core Principles
- **Separation of raw data from AI interpretations**: All AI-generated content (OCR extractions, normalizations, analyses) stored separately with model/version/timestamp for reprocessing
- **Temporal tracking**: Explicit timestamps and date fields for correlation analysis
- **Food normalization**: Preserve exact user input while mapping to canonical concepts
- **Audit trail**: Track when entries are created/modified

### Tables

#### `users`
```sql
id                 UUID PRIMARY KEY
email              VARCHAR(255) UNIQUE  -- For Google OAuth users
username           VARCHAR(255) UNIQUE  -- For credentials users
password_hash      VARCHAR(255)         -- bcrypt, nullable for OAuth-only
name               VARCHAR(255)
auth_provider      VARCHAR(50)          -- 'google', 'credentials'
google_id          VARCHAR(255)         -- Google user ID
created_at         TIMESTAMP DEFAULT NOW()
updated_at         TIMESTAMP DEFAULT NOW()

CONSTRAINT email_or_username_required CHECK (email IS NOT NULL OR username IS NOT NULL)
```
Supports both OAuth and credentials authentication. Typically 1-3 users (user's own emails/accounts).

#### `daily_entries`
```sql
id                 UUID PRIMARY KEY
user_id            UUID NOT NULL REFERENCES users(id)
date               DATE NOT NULL  -- The date this entry represents
created_at         TIMESTAMP DEFAULT NOW()
updated_at         TIMESTAMP DEFAULT NOW()
notes              TEXT  -- General notes for the day

UNIQUE(user_id, date)
INDEX ON (user_id, date DESC)
```
One entry per user per date. Main container for all daily data.

#### `uploaded_images`
```sql
id                 UUID PRIMARY KEY
daily_entry_id     UUID NOT NULL REFERENCES daily_entries(id) ON DELETE CASCADE
storage_key        VARCHAR(500) NOT NULL  -- Blob storage key or file path
mime_type          VARCHAR(100)
file_size          INTEGER
uploaded_at        TIMESTAMP DEFAULT NOW()
original_filename  VARCHAR(255)

INDEX ON (daily_entry_id)
```
Stores metadata for uploaded food list images.

#### `ocr_extractions`
```sql
id                 UUID PRIMARY KEY
image_id           UUID REFERENCES uploaded_images(id) ON DELETE SET NULL
daily_entry_id     UUID NOT NULL REFERENCES daily_entries(id) ON DELETE CASCADE
raw_ocr_text       TEXT  -- Raw OCR output
extracted_data     JSONB  -- Structured extraction {breakfast: [...], lunch: [...], ...}
model_name         VARCHAR(100)  -- e.g., "gpt-4-vision", "claude-3-sonnet"
model_version      VARCHAR(50)
confidence_score   FLOAT
extracted_at       TIMESTAMP DEFAULT NOW()

INDEX ON (daily_entry_id)
```
AI extraction results. Preserved for audit and reprocessing.

#### `meals`
```sql
id                 UUID PRIMARY KEY
daily_entry_id     UUID NOT NULL REFERENCES daily_entries(id) ON DELETE CASCADE
meal_type          VARCHAR(20) NOT NULL  -- breakfast, lunch, dinner, snacks, drinks
notes              TEXT  -- Meal-specific notes
created_at         TIMESTAMP DEFAULT NOW()

INDEX ON (daily_entry_id, meal_type)
```
Meal containers within a day.

#### `food_items`
```sql
id                 UUID PRIMARY KEY
meal_id            UUID NOT NULL REFERENCES meals(id) ON DELETE CASCADE
raw_text           VARCHAR(500) NOT NULL  -- Exactly as entered/extracted
quantity           VARCHAR(100)  -- e.g., "2 cups", "1 serving" - optional
order_index        INTEGER  -- Display order within meal
created_at         TIMESTAMP DEFAULT NOW()
updated_at         TIMESTAMP DEFAULT NOW()

INDEX ON (meal_id)
INDEX ON (raw_text)  -- For searching
```
Individual food entries as typed/extracted. Raw text preserved.

#### `food_concepts`
```sql
id                 UUID PRIMARY KEY
name               VARCHAR(255) UNIQUE NOT NULL  -- Canonical name: "coffee", "milk", "tomato"
category           VARCHAR(100)  -- Optional: dairy, grain, vegetable, etc.
aliases            TEXT[]  -- Common variations: ["coffee", "Coffee", "espresso"]
created_at         TIMESTAMP DEFAULT NOW()
merged_into_id     UUID REFERENCES food_concepts(id)  -- If merged with another concept
is_active          BOOLEAN DEFAULT TRUE

INDEX ON (name)
INDEX ON (aliases) USING GIN  -- PostgreSQL array search
```
Normalized food concepts for analysis. Supports merging duplicate concepts.

#### `food_item_concepts`
```sql
id                 UUID PRIMARY KEY
food_item_id       UUID NOT NULL REFERENCES food_items(id) ON DELETE CASCADE
food_concept_id    UUID NOT NULL REFERENCES food_concepts(id) ON DELETE CASCADE
confidence         FLOAT  -- AI confidence in this mapping
assigned_by        VARCHAR(50)  -- 'ai', 'user', 'rule'
assigned_at        TIMESTAMP DEFAULT NOW()

UNIQUE(food_item_id, food_concept_id)
INDEX ON (food_item_id)
INDEX ON (food_concept_id)
```
Many-to-many relationship. "Coffee with milk" maps to both {coffee} and {milk}.

#### `symptom_records`
```sql
id                 UUID PRIMARY KEY
daily_entry_id     UUID NOT NULL REFERENCES daily_entries(id) ON DELETE CASCADE
free_text_notes    TEXT NOT NULL  -- User's description
overall_rating     VARCHAR(20)  -- great, good, okay, bad, very_bad
bloating           VARCHAR(20)  -- none, mild, moderate, severe
gas                VARCHAR(20)
cramps_pain        VARCHAR(20)
diarrhea           BOOLEAN
constipation       BOOLEAN
created_at         TIMESTAMP DEFAULT NOW()
updated_at         TIMESTAMP DEFAULT NOW()

INDEX ON (daily_entry_id)
INDEX ON (overall_rating)
```
One symptom record per daily entry. Combines free text with structured fields.

#### `symptom_events`
```sql
id                 UUID PRIMARY KEY
symptom_record_id  UUID NOT NULL REFERENCES symptom_records(id) ON DELETE CASCADE
meal_id            UUID REFERENCES meals(id) ON DELETE SET NULL  -- Optional link to meal
description        VARCHAR(500)  -- "Bloating after lunch", "Cramps at 7 PM"
approximate_time   TIME  -- When symptom occurred
severity           VARCHAR(20)  -- none, mild, moderate, severe
symptom_type       VARCHAR(50)  -- bloating, gas, cramps, diarrhea, constipation, other
created_at         TIMESTAMP DEFAULT NOW()

INDEX ON (symptom_record_id)
INDEX ON (meal_id)
```
Individual symptom occurrences with optional time and meal linkage. AI can suggest from notes.

#### `weekly_reports`
```sql
id                 UUID PRIMARY KEY
user_id            UUID NOT NULL REFERENCES users(id)
start_date         DATE NOT NULL
end_date           DATE NOT NULL
generated_at       TIMESTAMP DEFAULT NOW()
summary_text       TEXT  -- AI-generated narrative summary
observed_data      JSONB  -- Structured stats: food counts, symptom frequencies
ai_interpretation  JSONB  -- AI insights separately from raw data
model_name         VARCHAR(100)
model_version      VARCHAR(50)

INDEX ON (user_id, start_date DESC)
```
Auto-generated weekly summaries. Clearly separates observations from interpretations.

#### `analysis_snapshots`
```sql
id                 UUID PRIMARY KEY
user_id            UUID NOT NULL REFERENCES users(id)
analysis_type      VARCHAR(100)  -- 'food_correlation', 'symptom_trend', etc.
date_range_start   DATE
date_range_end     DATE
results            JSONB  -- Statistical analysis results
generated_at       TIMESTAMP DEFAULT NOW()

INDEX ON (user_id, analysis_type, generated_at DESC)
```
Historical analysis results for comparison over time.

### Key Relationships
- One `daily_entry` has one `symptom_record`, multiple `meals`, multiple `uploaded_images`
- Each `meal` has multiple `food_items`
- Each `food_item` maps to multiple `food_concepts` (many-to-many)
- Each `symptom_record` can have multiple `symptom_events`
- All AI-generated content (`ocr_extractions`, `weekly_reports`, `analysis_snapshots`) stored with model provenance

---

## 3. Major Screens and User Flow

### 3.1 Dashboard (Home)
**URL**: `/`

**Purpose**: Quick overview and entry point

**Components**:
- **Today's Status Card**: "Entry complete" or "Add today's entry" button
- **Last 7 Days Summary**: Visual timeline showing good/bad days with color coding
- **Quick Stats Section**:
  - Total days tracked
  - Good vs. bad days (pie chart or simple ratio)
  - Most frequently logged foods (top 10)
- **Foods to Watch**: Foods with strongest association to bad symptoms
- **Foods Going Well**: Foods frequently eaten on good days
- **Latest Weekly Report**: Link to most recent analysis with date range

**Navigation**: 
- Prominent "Add Entry" button
- Links to History, Analysis, Reports, Settings

**Mobile**: Stacked cards, simplified stats

---

### 3.2 Daily Entry Screen
**URL**: `/entry` (defaults to today) or `/entry?date=2024-01-15`

**Purpose**: Primary data input - must be fast (~1 minute to complete)

**Flow**:
1. **Date Picker** at top (defaults to today, can select any past date)
2. **Food Input Section**:
   - Large upload area: "Drop image or paste (Cmd+V)"
   - File picker button as alternative
   - Accepts: JPG, PNG, HEIC (iOS photos)
   
3. **After Image Upload**:
   - Show uploaded image preview
   - Loading indicator: "Extracting foods with AI..."
   - Display extracted results organized by meal type
   
4. **Extracted Results Display**:
   ```
   Breakfast
   - Coffee with milk [x delete] [↓ move to...]
   - Toast [x] [↓]
   + Add item
   
   Lunch
   - Chicken salad [x] [↓]
   + Add item
   
   [Continue for Dinner, Snacks, Drinks...]
   ```
   - Each item editable inline (click to edit text)
   - Delete button removes item
   - Move dropdown to change meal category
   - Add button for manual entries
   - Drag-to-reorder (optional enhancement)

5. **Manual Entry Mode** (if no image):
   - Meal type selector tabs: Breakfast / Lunch / Dinner / Snacks / Drinks
   - Text input: "Add food item..." with Enter to add
   - List of added items with edit/delete

6. **Symptom Section** (always visible below food):
   - **Free Text Area** (primary): 
     - Placeholder: "How did your stomach feel today? Be specific about timing..."
     - Preserves exact user text
   - **Quick Rating** (optional structured fields):
     - Overall: 😊 Great | 🙂 Good | 😐 Okay | ☹️ Bad | 😣 Very Bad
     - Bloating: None / Mild / Moderate / Severe
     - Gas: None / Mild / Moderate / Severe
     - Cramps/Pain: None / Mild / Moderate / Severe
     - Checkboxes: □ Diarrhea / loose stool, □ Constipation
   - **AI Suggestion** (after free text entry):
     - "I noticed you mentioned bloating after lunch. Would you like to log this as a timed event?"
     - [Yes - add event] [No, just keep in notes]

7. **Save Button**: "Save Entry" (prominent, sticky on mobile)

**Edge Cases**:
- Editing existing entry: Pre-populate all fields
- Multiple images: Support adding second image, merge extractions
- OCR failure: Fallback to manual entry with error message
- No API key: Skip AI extraction, show manual entry immediately

**Performance**: 
- Image upload with progress bar
- AI extraction with timeout (30s max, fallback to manual)
- Optimistic UI updates

---

### 3.3 History Screen
**URL**: `/history`

**Purpose**: Browse, search, and edit past entries

**Layout**:
- **Search Bar** at top:
  - Search foods: "coffee", "tomato"
  - Search symptoms: "bloating", "cramps"
  - Date range picker: "From: ... To: ..."
  
- **Filters** (chips/toggles):
  - All Days / Good Days / Bad Days
  - By meal: Breakfast / Lunch / Dinner / Snacks / Drinks
  - By symptom severity: None / Mild / Moderate / Severe

- **Entry List** (reverse chronological):
  ```
  Jan 15, 2024 - ☹️ Bad
  Breakfast: Coffee, Toast
  Lunch: Chicken salad, Rice
  Symptoms: Bloating after lunch, cramps in evening
  [View Details] [Edit]
  
  Jan 14, 2024 - 🙂 Good
  Breakfast: Oatmeal, Banana
  ...
  ```

- **Per-Entry Actions**:
  - View Details: Expand to show full foods, image, all symptoms
  - Edit: Open entry screen pre-filled
  - Delete: Confirmation dialog

- **Per-Food View** (when clicking a food):
  - Modal: "Coffee - Logged 45 times"
  - Days with good symptoms: 30 (67%)
  - Days with bad symptoms: 15 (33%)
  - Timeline of when eaten
  - [View Full Analysis]

**Pagination**: 30 entries per page, infinite scroll on mobile

**Export Button**: Download data (see section 6)

---

### 3.4 Analysis Screen
**URL**: `/analysis`

**Purpose**: Statistical food-symptom correlations

**Sections**:

1. **Date Range Selector**: Last 7/30/90 days, or custom range

2. **Foods Associated with Bad Days**:
   ```
   ⚠️ Milk - Possible Strong Association
   Appeared on 20 days. Moderate/severe symptoms on 15 days (75%).
   On days without milk: symptoms on 25% of days.
   Relative risk: 3.0x
   Confidence: Medium (20 samples)
   [Details] [View Timeline]
   
   ⚠️ Tomato - Possible Association
   Appeared on 12 days. Symptoms on 8 days (67%).
   On days without: 25%.
   Relative risk: 2.7x
   Confidence: Low (12 samples) - need more data
   ```

3. **Foods Associated with Good Days**:
   ```
   ✅ Oatmeal - Appears Well Tolerated
   Eaten on 30 days. Symptoms on 6 days (20%).
   Overall symptom rate: 35%.
   Relative risk: 0.57x (protective pattern)
   Confidence: Medium (30 samples)
   ```

4. **Delayed Reactions** (24-48h window):
   - Same analysis but checking next-day symptoms
   - "Milk showed delayed association: symptoms more common 1 day after consumption"

5. **Problematic Combinations**:
   ```
   🔀 Coffee + Dairy - Possible Combination Effect
   Together on 8 days, symptoms on 7 days (88%).
   Coffee alone: 40% symptom rate
   Dairy alone: 50% symptom rate
   Together: 88% symptom rate
   ```

6. **Symptom Trends**:
   - Bar chart: Bloating, Gas, Cramps, Diarrhea, Constipation over time
   - Which meal types precede symptoms most often
   - Time-of-day patterns

7. **Data Sufficiency Indicator**:
   - "You have 45 days of data. Analyses become more reliable after 30+ days."
   - "Coffee: 45 samples ✅ | Quinoa: 3 samples ⚠️ need more"

**Evidence Display**:
- Always show sample sizes
- Never claim causation ("association", "pattern", "correlation")
- Confidence levels: Low (<10 samples), Medium (10-30), High (>30)
- Link to raw data: Click any food → see all days it appeared

**Computation**:
- Deterministic statistics from raw data
- AI used only for natural language narration
- Calculations: frequencies, rates, relative risk, confidence intervals
- Minimum sample threshold: Warn if <10 occurrences

**Refresh Button**: "Recalculate with current data"

---

### 3.5 Weekly Reports Screen
**URL**: `/reports`

**Purpose**: View and compare auto-generated weekly summaries

**List View**:
```
Week of Jan 8-14, 2024 - Generated Jan 15, 2024
Overall: Mixed week with 3 good days, 4 bad days
[View Report]

Week of Jan 1-7, 2024 - Generated Jan 8, 2024
Overall: Mostly good week
[View Report]
```

**Report Detail View** (`/reports/[id]`):

**Header**: Week of Jan 8-14, 2024

**Section 1: Observed Data** (Deterministic stats)
- Days tracked: 7/7
- Overall ratings: 3 Good, 2 Okay, 2 Bad
- Foods logged: 45 total items, 22 unique foods
- Most frequent foods: Coffee (7), Rice (5), Chicken (4)
- Symptom frequencies:
  - Bloating: 4 days (3 moderate, 1 severe)
  - Gas: 2 days (mild)
  - Cramps: 3 days (2 moderate, 1 severe)
- Best days: Jan 9, Jan 12 (no symptoms)
- Worst days: Jan 10, Jan 13 (multiple severe symptoms)

**Section 2: AI Interpretation** (Clearly labeled)
*This section contains AI-generated insights based on the observed data:*

- **Patterns This Week**:
  - "Milk appeared on 5 days, with symptoms occurring on 4 of those days. Consider a temporary reduction to test correlation."
  - "Coffee + dairy combination preceded bloating on 3 occasions."
  - "Oatmeal breakfasts correlated with better morning comfort."
  
- **Foods to Consider Reducing**:
  - Milk (strong pattern this week)
  - Tomatoes (moderate pattern, consistent with previous weeks)
  
- **Foods Appearing Well Tolerated**:
  - Chicken (eaten 4 times, no issues)
  - Rice (eaten 5 times, only 1 issue)
  
- **Comparison to Previous Weeks**:
  - "Milk pattern strengthening (last week: 60% symptom rate, this week: 80%)"
  - "Overall symptom frequency decreased from 65% to 57%"
  
- **Recommendations**:
  - "Consider a 1-week trial without milk to test the association"
  - "Continue with oatmeal breakfasts"
  - "Need more data on: Quinoa (only 1 occurrence)"

**Section 3: Evidence Links**:
- [View all days this week]
- [View detailed analysis]
- [Export this report as PDF]

**Actions**:
- Generate New Report Now button (for current week)
- Compare with another week (select from dropdown)

---

### 3.6 Settings Screen
**URL**: `/settings`

**Sections**:

1. **Account**:
   - Name, email (display only for single-user)
   - Change password
   - Logout

2. **Data Export**:
   - **Export All Data**: Downloads ZIP containing:
     - `export.json` (full database export)
     - CSVs: `daily_entries.csv`, `food_items.csv`, `symptom_records.csv`, etc.
     - `images/` folder with all uploaded images
   - **Import from Export**: Upload `export.json` to restore data

3. **AI Configuration**:
   - Provider: OpenAI / Anthropic / Mock (for testing)
   - API Key: [input field, masked]
   - Test Connection button

4. **Analysis Settings**:
   - Minimum sample threshold: 5/10/15 occurrences
   - Relative risk threshold for flagging: 1.5x/2.0x/2.5x
   - Lag window for delayed reactions: 0-24h / 0-48h

5. **Weekly Report Schedule**:
   - Enabled / Disabled
   - Day of week: Monday, Tuesday, etc.
   - Time: 9:00 AM

6. **Delete All Sample Data** (if present):
   - Button: "Remove Sample Data"
   - Confirmation: "This will delete all sample entries. Your future data will be preserved."

7. **Danger Zone**:
   - Delete All My Data (requires confirmation)

---

## 4. OCR/AI Extraction

### Process Flow

1. **Image Upload**:
   - User uploads image or pastes from clipboard
   - Frontend: Compress if >5MB, convert HEIC to JPEG if needed
   - Upload to blob storage, get URL
   - Create `uploaded_images` record

2. **OCR Extraction Request**:
   - Backend API endpoint: `POST /api/extract`
   - Receives: `imageId`, `dailyEntryId`, `imageUrl`
   - Selects provider based on env var (OpenAI/Anthropic/Mock)

3. **Vision LLM Call**:
   
   **Prompt Template**:
   ```
   You are helping extract a daily food log from an image.
   The image contains a list of foods eaten throughout the day, 
   possibly handwritten or typed.
   
   Extract and organize the foods into these categories:
   - Breakfast
   - Lunch
   - Dinner
   - Snacks
   - Drinks
   
   Rules:
   - List each food item separately (don't combine into compound items unless clearly grouped)
   - If quantities are mentioned, include them (e.g., "2 cups rice")
   - If timing is ambiguous, use best judgment based on typical meal patterns
   - If text is unclear, mark as [unclear: partial_text]
   
   Return valid JSON in this exact format:
   {
     "breakfast": ["coffee with milk", "toast"],
     "lunch": ["chicken salad", "rice", "water"],
     "dinner": ["pasta", "tomato sauce", "garlic bread"],
     "snacks": ["apple", "peanuts"],
     "drinks": ["tea", "orange juice"],
     "raw_ocr_text": "exact text you read from the image",
     "confidence": 0.85
   }
   ```

   **Gemini Implementation**:
   ```typescript
   import { GoogleGenerativeAI } from '@google/generative-ai';
   
   const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
   const model = genAI.getGenerativeModel({ 
     model: process.env.GEMINI_EXTRACTION_MODEL || 'gemini-2.5-flash',
     generationConfig: {
       responseMimeType: "application/json"
     }
   });
   
   // Read image from URL and convert to base64
   const imageResponse = await fetch(imageUrl);
   const imageBuffer = await imageResponse.arrayBuffer();
   const base64Image = Buffer.from(imageBuffer).toString('base64');
   
   const result = await model.generateContent([
     prompt,
     {
       inlineData: {
         data: base64Image,
         mimeType: 'image/jpeg'
       }
     }
   ]);
   
   const text = result.response.text();
   const extracted = JSON.parse(text);
   ```

4. **Parse and Store**:
   - Parse JSON response from Gemini
   - Create `ocr_extractions` record with model name (e.g., "gemini-2.5-flash") and version
   - Return structured data to frontend

5. **Frontend Display**:
   - Create `meals` records for each meal type
   - Create `food_items` for each extracted item
   - Display in editable list (React state)
   - User corrects, adds, deletes, moves items
   - On save, persist to database

### Fallback Strategy

**Mock Provider** (when no API key):
```typescript
function mockExtract(imageMetadata: ImageMetadata) {
  return {
    breakfast: ["[Manual entry required - no AI key]"],
    lunch: [],
    dinner: [],
    snacks: [],
    drinks: [],
    raw_ocr_text: "Mock extraction - please enter foods manually",
    confidence: 0.0,
    model_name: "mock",
    model_version: "1.0"
  };
}
```

**Error Handling**:
- API timeout (30s): Fall back to manual entry
- Rate limit: Queue for retry, allow manual entry
- Invalid image: "Could not read image, please enter manually"
- Invalid JSON response: Log error, return empty extraction

### Provider Abstraction

**Interface**:
```typescript
interface VisionProvider {
  name: string;
  extractFoods(imageUrl: string): Promise<ExtractionResult>;
}

interface ExtractionResult {
  breakfast: string[];
  lunch: string[];
  dinner: string[];
  snacks: string[];
  drinks: string[];
  raw_ocr_text: string;
  confidence: number;
}
```

**Configuration** (env vars):
```
VISION_PROVIDER=gemini|mock
GEMINI_API_KEY=<your-key>
GEMINI_EXTRACTION_MODEL=gemini-2.5-flash  # For OCR/extraction
GEMINI_ANALYSIS_MODEL=gemini-2.5-pro      # For weekly reports
```

**Factory Pattern**:
```typescript
function getVisionProvider(): VisionProvider {
  const provider = process.env.VISION_PROVIDER || 'gemini';
  switch (provider) {
    case 'gemini': 
      if (!process.env.GEMINI_API_KEY) {
        console.warn('GEMINI_API_KEY not set, falling back to mock');
        return new MockVisionProvider();
      }
      return new GeminiVisionProvider();
    case 'mock': 
      return new MockVisionProvider();
    default: 
      throw new Error(`Unknown provider: ${provider}`);
  }
}
```

---

## 5. Food/Symptom Correlation Analysis

### Core Principle
**Deterministic statistics computed from raw data, with AI only used to narrate/interpret.** Never claim causation. Always show evidence and sample sizes.

### Statistical Methods

#### 5.1 Basic Frequencies
For each food concept:
- Total days in analysis period: `N_total`
- Days food appeared: `N_food`
- Days with bad symptoms: `N_bad_symptom`
- Days with food AND bad symptoms: `N_food_and_bad`
- Days with food AND good symptoms: `N_food_and_good`

#### 5.2 Conditional Probability
```
P(bad symptoms | food present) = N_food_and_bad / N_food
P(bad symptoms | food absent) = (N_bad_symptom - N_food_and_bad) / (N_total - N_food)
```

#### 5.3 Relative Risk
```
RR = P(bad symptoms | food present) / P(bad symptoms | food absent)

Interpretation:
- RR > 2.0: Strong positive association (problematic)
- RR 1.5-2.0: Moderate positive association
- RR 0.8-1.2: No meaningful association
- RR < 0.8: Negative association (protective/neutral)
```

#### 5.4 Confidence Scoring
Based on sample size and consistency:
```typescript
function getConfidenceLevel(samples: number, consistency: number): ConfidenceLevel {
  if (samples < 10) return "low";
  if (samples < 30) return "medium";
  if (samples >= 30 && consistency > 0.7) return "high";
  return "medium";
}

// Consistency: how often the pattern holds
consistency = N_food_and_bad / N_food
```

#### 5.5 Lag Window Analysis
Check delayed reactions by looking at next-day symptoms:
```typescript
for each food occurrence on day D:
  check symptoms on day D (same-day)
  check symptoms on day D+1 (next-day)
  check symptoms on day D+2 (if analyzing 48h window)
  
compute:
  RR_same_day = ...
  RR_next_day = ...
  
if RR_next_day > RR_same_day + threshold:
  flag as "delayed reaction pattern"
```

#### 5.6 Combination Analysis
For pairs of foods that co-occur frequently:
```typescript
find all pairs (Food A, Food B) where:
  co_occurrence_count >= 5 times
  
compute:
  RR(A and B together) vs. baseline
  RR(A and B together) vs. RR(A alone)
  RR(A and B together) vs. RR(B alone)
  
if RR(A and B) > max(RR(A), RR(B)) * 1.5:
  flag as "combination effect"
```

### Implementation

**Database Query Example**:
```sql
-- Get food-symptom correlation for a specific food concept
WITH food_days AS (
  SELECT DISTINCT de.date
  FROM daily_entries de
  JOIN meals m ON m.daily_entry_id = de.id
  JOIN food_items fi ON fi.meal_id = m.id
  JOIN food_item_concepts fic ON fic.food_item_id = fi.id
  WHERE fic.food_concept_id = $1
    AND de.date BETWEEN $2 AND $3
),
bad_symptom_days AS (
  SELECT de.date
  FROM daily_entries de
  JOIN symptom_records sr ON sr.daily_entry_id = de.id
  WHERE sr.overall_rating IN ('bad', 'very_bad')
    AND de.date BETWEEN $2 AND $3
)
SELECT
  (SELECT COUNT(*) FROM daily_entries WHERE date BETWEEN $2 AND $3) as total_days,
  (SELECT COUNT(*) FROM food_days) as food_days,
  (SELECT COUNT(*) FROM bad_symptom_days) as bad_days,
  (SELECT COUNT(*) FROM food_days fd JOIN bad_symptom_days bsd ON fd.date = bsd.date) as food_and_bad_days;
```

**Analysis Service** (TypeScript):
```typescript
interface CorrelationResult {
  foodConcept: FoodConcept;
  totalDays: number;
  daysWithFood: number;
  daysWithSymptoms: number;
  daysWithFoodAndSymptoms: number;
  relativeRisk: number;
  confidence: "low" | "medium" | "high";
  interpretation: string;
}

async function analyzeFoodSymptomCorrelation(
  userId: string,
  startDate: Date,
  endDate: Date
): Promise<CorrelationResult[]> {
  const results: CorrelationResult[] = [];
  
  // Get all food concepts eaten in this period
  const foodConcepts = await getFoodConceptsInPeriod(userId, startDate, endDate);
  
  for (const food of foodConcepts) {
    const stats = await getCorrelationStats(food.id, startDate, endDate);
    
    const pBadGivenFood = stats.foodAndBadDays / stats.foodDays;
    const pBadGivenNoFood = 
      (stats.badDays - stats.foodAndBadDays) / (stats.totalDays - stats.foodDays);
    
    const relativeRisk = pBadGivenFood / pBadGivenNoFood;
    
    const confidence = getConfidenceLevel(
      stats.foodDays,
      pBadGivenFood
    );
    
    // AI interpretation (separate from stats)
    const interpretation = await generateInterpretation({
      food: food.name,
      stats,
      relativeRisk,
      confidence
    });
    
    results.push({
      foodConcept: food,
      ...stats,
      relativeRisk,
      confidence,
      interpretation
    });
  }
  
  // Sort by relative risk descending
  return results.sort((a, b) => b.relativeRisk - a.relativeRisk);
}
```

**AI Interpretation Service** (using Gemini):
```typescript
import { GoogleGenerativeAI } from '@google/generative-ai';

async function generateInterpretation(data: CorrelationData): Promise<string> {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  // Use extraction model for quick interpretations
  const model = genAI.getGenerativeModel({ 
    model: process.env.GEMINI_EXTRACTION_MODEL || 'gemini-2.5-flash' 
  });
  
  const prompt = `
    Given these statistics about a food and symptoms:
    - Food: ${data.food}
    - Eaten on ${data.stats.foodDays} out of ${data.stats.totalDays} days
    - Symptoms occurred on ${data.stats.foodAndBadDays} of those ${data.stats.foodDays} days (${(data.pBadGivenFood * 100).toFixed(0)}%)
    - On days without this food, symptoms occurred ${(data.pBadGivenNoFood * 100).toFixed(0)}% of the time
    - Relative risk: ${data.relativeRisk.toFixed(2)}x
    - Confidence: ${data.confidence} (based on ${data.stats.foodDays} samples)
    
    Write a 1-2 sentence interpretation for the user.
    - Never claim causation (use "association", "pattern", "correlation")
    - Be clear about confidence level
    - Suggest action if RR > 2.0 and confidence >= medium
    - If confidence is low, note that more data is needed
    
    Examples:
    - "Milk showed a strong association with symptoms (RR: 3.0x). Consider a trial elimination period to test this pattern."
    - "Coffee appeared on 12 days with symptoms on 5 days (42%), slightly above baseline (35%). More data needed to determine significance."
  `;
  
  const result = await model.generateContent(prompt);
  return result.response.text().trim();
}
```

### Minimum Sample Thresholds
- **Flag for removal**: >= 10 occurrences, RR >= 2.0, confidence >= medium
- **Flag for monitoring**: >= 5 occurrences, RR >= 1.5
- **Well tolerated**: >= 15 occurrences, RR < 0.8
- **Insufficient data**: < 5 occurrences → "Need more data"

### Evidence Display
Always show:
- Sample size: "Eaten on X out of Y days"
- Symptom rate with food: "Symptoms on X of those Y days (Z%)"
- Baseline symptom rate: "Overall symptom rate: W%"
- Relative risk: "A.Bx higher/lower risk"
- Confidence: "Low/Medium/High confidence based on N samples"
- Link to timeline: "View all days with [food]"

---

## 6. Weekly Analysis (Scheduled)

### Trigger Mechanism

**Vercel Cron Configuration** (`vercel.json`):
```json
{
  "crons": [{
    "path": "/api/cron/weekly-report",
    "schedule": "0 9 * * 1"
  }]
}
```
Runs every Monday at 9 AM UTC.

**API Route**: `/api/cron/weekly-report`
```typescript
export async function GET(request: Request) {
  // Verify cron secret (Vercel sets CRON_SECRET header)
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }
  
  // Generate report for all users
  const users = await prisma.user.findMany();
  for (const user of users) {
    await generateWeeklyReport(user.id);
  }
  
  return Response.json({ success: true });
}
```

**Fallback for Non-Vercel Deployments**:
- Manual trigger button on Reports page
- Optional: node-cron for self-hosted setups

### Report Generation Process

```typescript
async function generateWeeklyReport(userId: string): Promise<WeeklyReport> {
  const endDate = new Date(); // Today
  const startDate = subDays(endDate, 7); // 7 days ago
  
  // 1. Gather observed data (deterministic)
  const observedData = await gatherObservedData(userId, startDate, endDate);
  
  // 2. Run statistical analysis
  const correlations = await analyzeFoodSymptomCorrelation(userId, startDate, endDate);
  
  // 3. Generate AI interpretation
  const aiInterpretation = await generateWeeklyAIInsights({
    observedData,
    correlations,
    userId,
    startDate,
    endDate
  });
  
  // 4. Store report
  const report = await prisma.weeklyReport.create({
    data: {
      userId,
      startDate,
      endDate,
      observedData: observedData as any,
      aiInterpretation: aiInterpretation as any,
      summaryText: aiInterpretation.summary,
      modelName: "gpt-4",
      modelVersion: "2024-01"
    }
  });
  
  return report;
}
```

### Observed Data Collection (Deterministic)
```typescript
async function gatherObservedData(
  userId: string,
  startDate: Date,
  endDate: Date
) {
  const entries = await prisma.dailyEntry.findMany({
    where: { userId, date: { gte: startDate, lte: endDate } },
    include: {
      meals: { include: { foodItems: true } },
      symptomRecords: true
    }
  });
  
  // Count everything
  const foodCounts: Record<string, number> = {};
  const symptomCounts = {
    bloating: { none: 0, mild: 0, moderate: 0, severe: 0 },
    gas: { none: 0, mild: 0, moderate: 0, severe: 0 },
    cramps: { none: 0, mild: 0, moderate: 0, severe: 0 },
    diarrhea: 0,
    constipation: 0
  };
  
  const ratingCounts = {
    great: 0,
    good: 0,
    okay: 0,
    bad: 0,
    very_bad: 0
  };
  
  const bestDays: Date[] = [];
  const worstDays: Date[] = [];
  
  for (const entry of entries) {
    // Count foods
    for (const meal of entry.meals) {
      for (const food of meal.foodItems) {
        foodCounts[food.rawText] = (foodCounts[food.rawText] || 0) + 1;
      }
    }
    
    // Count symptoms
    const symptom = entry.symptomRecords[0];
    if (symptom) {
      ratingCounts[symptom.overallRating]++;
      symptomCounts.bloating[symptom.bloating]++;
      // ... etc
      
      if (symptom.overallRating === 'great' || symptom.overallRating === 'good') {
        bestDays.push(entry.date);
      }
      if (symptom.overallRating === 'bad' || symptom.overallRating === 'very_bad') {
        worstDays.push(entry.date);
      }
    }
  }
  
  return {
    daysTracked: entries.length,
    totalDaysInPeriod: 7,
    foodCounts,
    symptomCounts,
    ratingCounts,
    bestDays,
    worstDays,
    mostFrequentFoods: Object.entries(foodCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([food, count]) => ({ food, count }))
  };
}
```

### AI Interpretation Generation (using Gemini)
```typescript
import { GoogleGenerativeAI } from '@google/generative-ai';

async function generateWeeklyAIInsights(context: WeeklyContext) {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  // Use analysis model for high-quality weekly reports
  const model = genAI.getGenerativeModel({ 
    model: process.env.GEMINI_ANALYSIS_MODEL || 'gemini-2.5-pro',
    generationConfig: {
      responseMimeType: "application/json"
    }
  });
  
  const prompt = `
    Generate a weekly food and symptom summary for the user.
    
    OBSERVED DATA (facts only):
    ${JSON.stringify(context.observedData, null, 2)}
    
    CORRELATION ANALYSIS:
    ${JSON.stringify(context.correlations, null, 2)}
    
    Generate a JSON response with these sections:
    
    {
      "summary": "One sentence overall summary",
      "patterns_this_week": [
        "Pattern 1 with evidence",
        "Pattern 2 with evidence"
      ],
      "foods_to_consider_reducing": [
        { "food": "Milk", "reason": "Strong association this week (RR: 3.0x, 5/6 days with symptoms)" }
      ],
      "foods_appearing_well_tolerated": [
        { "food": "Rice", "reason": "Eaten 5 times, symptoms on only 1 day" }
      ],
      "comparison_to_previous_weeks": [
        "Comparison 1",
        "Comparison 2"
      ],
      "recommendations": [
        "Recommendation 1",
        "Recommendation 2"
      ],
      "data_gaps": [
        "Need more data on: Quinoa (only 1 occurrence)"
      ]
    }
    
    IMPORTANT:
    - Never claim causation (use "association", "pattern", "correlation")
    - Always cite evidence (sample sizes, percentages, relative risk)
    - Be clear when data is insufficient
    - Compare to previous weeks if available
    - Suggest specific actions for strong patterns (RR > 2.0, medium+ confidence)
    - Acknowledge foods that appear safe
  `;
  
  const result = await model.generateContent(prompt);
  const text = result.response.text();
  return JSON.parse(text);
}
```

### Report Storage
All reports stored in `weekly_reports` table with:
- Separation of `observed_data` (facts) from `ai_interpretation` (insights)
- Model name and version for provenance
- Full timestamp for historical comparison

### Notification (Optional Future Enhancement)
- Email summary to user
- In-app notification: "Your weekly report is ready"
- Push notification for PWA

---

## 7. Data Export and Import

### Export Format

**ZIP Archive** containing:
```
food-tracker-export-2024-01-15/
├── export.json              # Full database export
├── metadata.json            # Export info (date, version, user)
├── images/                  # All uploaded images
│   ├── abc123.jpg
│   ├── def456.jpg
├── csv/
│   ├── daily_entries.csv
│   ├── meals.csv
│   ├── food_items.csv
│   ├── food_concepts.csv
│   ├── food_item_concepts.csv
│   ├── symptom_records.csv
│   ├── symptom_events.csv
│   ├── weekly_reports.csv
│   └── analysis_snapshots.csv
└── README.txt               # Export info and structure
```

### Export Implementation

**API Endpoint**: `POST /api/export`
```typescript
export async function POST(request: Request) {
  const userId = await getAuthenticatedUserId(request);
  
  // 1. Query all user data
  const data = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      dailyEntries: {
        include: {
          meals: { include: { foodItems: true } },
          symptomRecords: { include: { symptomEvents: true } },
          uploadedImages: true
        }
      },
      weeklyReports: true,
      // ... all related data
    }
  });
  
  // 2. Generate JSON export
  const exportJson = JSON.stringify(data, null, 2);
  
  // 3. Generate CSVs
  const csvFiles = {
    'daily_entries.csv': generateDailyEntriesCSV(data.dailyEntries),
    'food_items.csv': generateFoodItemsCSV(data.dailyEntries),
    // ... etc
  };
  
  // 4. Collect images
  const imageFiles = await collectImages(data.dailyEntries);
  
  // 5. Create ZIP
  const zip = new JSZip();
  zip.file('export.json', exportJson);
  zip.file('metadata.json', JSON.stringify({
    exportDate: new Date().toISOString(),
    version: '1.0',
    userId: userId
  }));
  
  const csvFolder = zip.folder('csv');
  for (const [filename, content] of Object.entries(csvFiles)) {
    csvFolder.file(filename, content);
  }
  
  const imagesFolder = zip.folder('images');
  for (const [filename, blob] of imageFiles) {
    imagesFolder.file(filename, blob);
  }
  
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  
  return new Response(zipBlob, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="food-tracker-export-${new Date().toISOString()}.zip"`
    }
  });
}
```

### Import Implementation

**API Endpoint**: `POST /api/import`
```typescript
export async function POST(request: Request) {
  const userId = await getAuthenticatedUserId(request);
  const formData = await request.formData();
  const file = formData.get('export') as File;
  
  // 1. Extract ZIP
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  
  // 2. Read export.json
  const exportJson = await zip.file('export.json').async('string');
  const data = JSON.parse(exportJson);
  
  // 3. Validate structure
  validateImportData(data);
  
  // 4. Restore to database (within transaction)
  await prisma.$transaction(async (tx) => {
    // Delete existing data (optional - ask user)
    // await tx.dailyEntry.deleteMany({ where: { userId } });
    
    // Restore daily entries
    for (const entry of data.dailyEntries) {
      await tx.dailyEntry.create({
        data: {
          userId,
          date: new Date(entry.date),
          notes: entry.notes,
          meals: {
            create: entry.meals.map(meal => ({
              mealType: meal.mealType,
              foodItems: {
                create: meal.foodItems
              }
            }))
          },
          // ... etc
        }
      });
    }
    
    // Restore images
    const imagesFolder = zip.folder('images');
    for (const [filename, file] of Object.entries(imagesFolder.files)) {
      const blob = await file.async('blob');
      await uploadImageToStorage(blob, filename);
    }
  });
  
  return Response.json({ success: true });
}
```

---

## 8. PWA Configuration

### Manifest (`/public/manifest.json`)
```json
{
  "name": "Food & Symptom Tracker",
  "short_name": "Food Tracker",
  "description": "Track your meals and stomach symptoms",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#3b82f6",
  "icons": [
    {
      "src": "/icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/icons/icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    },
    {
      "src": "/icons/icon-maskable-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable"
    }
  ],
  "categories": ["health", "lifestyle"],
  "screenshots": [
    {
      "src": "/screenshots/dashboard.png",
      "sizes": "1280x720",
      "type": "image/png"
    }
  ]
}
```

### Service Worker (via next-pwa)
```javascript
// next.config.js
const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development'
});

module.exports = withPWA({
  // ... other Next.js config
});
```

### Install Prompt (iOS/macOS Safari)
```typescript
// components/InstallPrompt.tsx
export function InstallPrompt() {
  const [showPrompt, setShowPrompt] = useState(false);
  
  useEffect(() => {
    // Check if already installed
    const isInstalled = window.matchMedia('(display-mode: standalone)').matches;
    
    // Check if iOS Safari
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    
    if (!isInstalled && isIOS) {
      setShowPrompt(true);
    }
  }, []);
  
  if (!showPrompt) return null;
  
  return (
    <div className="fixed bottom-4 left-4 right-4 bg-blue-600 text-white p-4 rounded-lg shadow-lg">
      <p className="text-sm mb-2">Install this app for quick access:</p>
      <ol className="text-xs space-y-1 mb-3">
        <li>1. Tap the Share button in Safari</li>
        <li>2. Scroll down and tap "Add to Home Screen"</li>
        <li>3. Tap "Add"</li>
      </ol>
      <button onClick={() => setShowPrompt(false)} className="text-xs underline">
        Dismiss
      </button>
    </div>
  );
}
```

---

## 9. Authentication & Security

### Authentication Strategy

**Primary: Google OAuth with Email Allowlist**
- User signs in with Google account
- Email checked against `ALLOWED_EMAILS` environment variable
- Only allowlisted emails can access the app
- Supports multiple emails (e.g., personal Gmail + work Gmail for same user)
- No password to manage, leverages Google's security

**Fallback: Username/Password**
- Available when Google OAuth not configured
- Used for local development
- Bcrypt hashing with salt rounds: 12
- Rate limiting on login attempts (5 tries per 15 minutes)

### Initial Setup Flow

**First Launch**:
1. User visits app (no users in database)
2. Show setup page with options:
   - "Sign in with Google" (if GOOGLE_CLIENT_ID configured)
   - "Create Local Account" (fallback)
3. Google OAuth flow:
   - User clicks "Sign in with Google"
   - Google consent screen appears
   - After authorization, check email against `ALLOWED_EMAILS`
   - If email matches: create user record, establish session, redirect to dashboard
   - If email doesn't match: show error "Your email is not authorized. Contact the app owner."
4. Local account flow:
   - User enters username + strong password
   - Account created, session established
   - Redirect to dashboard

**Subsequent Access**:
- Login page at `/login` with both options
- "Sign in with Google" button (primary)
- Username/password form (collapsed/secondary)
- Session-based auth with HTTP-only cookies

### NextAuth.js Configuration

```typescript
// app/api/auth/[...nextauth]/route.ts
import NextAuth from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import CredentialsProvider from 'next-auth/providers/credentials';
import { compare } from 'bcryptjs';

// Parse allowed emails from env var
const allowedEmails = process.env.ALLOWED_EMAILS?.split(',').map(e => e.trim().toLowerCase()) || [];

export const authOptions = {
  providers: [
    // Primary: Google OAuth
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    
    // Fallback: Credentials
    CredentialsProvider({
      id: 'credentials',
      name: 'Username and Password',
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) {
          return null;
        }
        
        const user = await prisma.user.findUnique({
          where: { username: credentials.username }
        });
        
        if (!user || !user.passwordHash) {
          return null;
        }
        
        const isValid = await compare(credentials.password, user.passwordHash);
        if (!isValid) {
          return null;
        }
        
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          username: user.username
        };
      }
    })
  ],
  
  session: { strategy: 'jwt' },
  
  pages: {
    signIn: '/login',
    error: '/login',
  },
  
  callbacks: {
    async signIn({ user, account }) {
      // For Google OAuth, check email allowlist
      if (account?.provider === 'google') {
        const email = user.email?.toLowerCase();
        
        // If no allowlist configured, deny all OAuth (must use credentials)
        if (allowedEmails.length === 0) {
          console.warn('ALLOWED_EMAILS not configured, denying Google sign-in');
          return false;
        }
        
        // Check if email is in allowlist
        if (!email || !allowedEmails.includes(email)) {
          console.warn(`Unauthorized email attempted sign-in: ${email}`);
          return false;
        }
        
        // Check if user exists, create if not
        const existingUser = await prisma.user.findUnique({
          where: { email }
        });
        
        if (!existingUser) {
          await prisma.user.create({
            data: {
              email,
              name: user.name || email.split('@')[0],
              authProvider: 'google',
              googleId: user.id,
            }
          });
        }
      }
      
      return true;
    },
    
    async jwt({ token, user, account }) {
      // On sign in, fetch user from database
      if (account) {
        let dbUser;
        if (account.provider === 'google') {
          dbUser = await prisma.user.findUnique({
            where: { email: user.email! }
          });
        } else {
          dbUser = await prisma.user.findUnique({
            where: { id: user.id }
          });
        }
        
        if (dbUser) {
          token.userId = dbUser.id;
          token.email = dbUser.email;
        }
      }
      
      return token;
    },
    
    async session({ session, token }) {
      session.userId = token.userId as string;
      session.user.email = token.email as string;
      return session;
    }
  }
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
```

### Google OAuth Setup

**Creating OAuth Client** (documented in README):

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select existing)
3. Enable Google+ API:
   - Navigate to "APIs & Services" → "Library"
   - Search for "Google+ API"
   - Click "Enable"
4. Create OAuth 2.0 credentials:
   - Go to "APIs & Services" → "Credentials"
   - Click "Create Credentials" → "OAuth client ID"
   - Application type: "Web application"
   - Name: "Food Tracker"
   - Authorized JavaScript origins:
     - `http://localhost:3000` (for local development)
     - `https://your-app.vercel.app` (for production)
   - Authorized redirect URIs:
     - `http://localhost:3000/api/auth/callback/google`
     - `https://your-app.vercel.app/api/auth/callback/google`
5. Copy Client ID and Client Secret
6. Add to environment variables:
   - `GOOGLE_CLIENT_ID=<your-client-id>`
   - `GOOGLE_CLIENT_SECRET=<your-client-secret>`
   - `ALLOWED_EMAILS=your.email@gmail.com,your.other@gmail.com`

### Email Allowlist Configuration

**Environment Variable Format**:
```bash
# Single email
ALLOWED_EMAILS=anandhan@gmail.com

# Multiple emails (comma-separated)
ALLOWED_EMAILS=anandhan@gmail.com,anandhan.work@gmail.com,anandhan.subbiah@gmail.com
```

**Behavior**:
- Case-insensitive matching
- Whitespace trimmed automatically
- Empty allowlist = OAuth disabled (credentials only)
- User sees clear error message if email not allowed

### Password Security (Credentials Fallback)
- Bcrypt hashing with salt rounds: 12
- Minimum password length: 12 characters
- Password strength indicator on signup
- Rate limiting on login attempts (5 tries per 15 minutes)
- Stored in `password_hash` field (nullable for OAuth-only users)

### Image URL Protection
All image URLs must be authenticated:
```typescript
// app/api/images/[imageId]/route.ts
export async function GET(
  request: Request,
  { params }: { params: { imageId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }
  
  const image = await prisma.uploadedImage.findUnique({
    where: { id: params.imageId },
    include: { dailyEntry: true }
  });
  
  // Verify ownership
  if (image.dailyEntry.userId !== session.userId) {
    return new Response('Forbidden', { status: 403 });
  }
  
  // Serve image
  const blob = await getImageFromStorage(image.storageKey);
  return new Response(blob, {
    headers: { 'Content-Type': image.mimeType }
  });
}
```

### Rate Limiting
```typescript
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, '10 s'),
});

export async function ratelimitMiddleware(request: Request) {
  const ip = request.headers.get('x-forwarded-for') || 'unknown';
  const { success } = await ratelimit.limit(ip);
  
  if (!success) {
    return new Response('Too Many Requests', { status: 429 });
  }
}
```

---

## 10. Environment Variables & Configuration

### Required Environment Variables

**Database** (Auto-configured by Vercel):
```bash
# Vercel Postgres (automatically set by Vercel)
POSTGRES_URL=<vercel-sets-this>
POSTGRES_PRISMA_URL=<vercel-sets-this>
POSTGRES_URL_NON_POOLING=<vercel-sets-this>

# For Prisma (use the pooling URL)
DATABASE_URL=${POSTGRES_PRISMA_URL}
```

**Authentication**:
```bash
NEXTAUTH_URL=https://your-app.vercel.app  # Your production URL
NEXTAUTH_SECRET=<random-secret>            # Generate with: openssl rand -base64 32

# Google OAuth (Primary authentication)
GOOGLE_CLIENT_ID=<your-google-client-id>
GOOGLE_CLIENT_SECRET=<your-google-client-secret>

# Email allowlist (comma-separated, no spaces)
ALLOWED_EMAILS=your.email@gmail.com,your.other@gmail.com
```

**Image Storage** (Auto-configured by Vercel):
```bash
# Vercel Blob (automatically set when you enable Blob storage)
BLOB_READ_WRITE_TOKEN=<vercel-sets-this>
```

**AI/OCR**:
```bash
VISION_PROVIDER=gemini                         # gemini | mock
GEMINI_API_KEY=<your-gemini-api-key>          # Get from Google AI Studio
GEMINI_EXTRACTION_MODEL=gemini-2.5-flash      # For OCR/extraction (fast)
GEMINI_ANALYSIS_MODEL=gemini-2.5-pro          # For weekly reports (high quality)
```

**Cron Jobs** (Auto-configured by Vercel):
```bash
# Vercel Cron (automatically set by Vercel)
CRON_SECRET=<vercel-sets-this>
```

### Configuration Files

**`.env.local`** (development):
```bash
# Database (local Postgres or Vercel dev)
DATABASE_URL=postgresql://localhost:5432/food_tracker_dev

# Auth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=dev-secret-change-in-production

# Google OAuth (get from Google Cloud Console)
GOOGLE_CLIENT_ID=<your-client-id>.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=<your-client-secret>
ALLOWED_EMAILS=your.email@gmail.com

# Vision AI - Gemini (use mock for completely free local dev)
VISION_PROVIDER=gemini              # or 'mock' for no API calls
GEMINI_API_KEY=<your-key>           # Get from https://aistudio.google.com/apikey
GEMINI_EXTRACTION_MODEL=gemini-2.5-flash  # Fast extraction
GEMINI_ANALYSIS_MODEL=gemini-2.5-pro      # Quality analysis

# Image storage (Vercel Blob works in dev too)
BLOB_READ_WRITE_TOKEN=<get-from-vercel>
```

**Vercel Environment Variables** (set in Vercel dashboard):
```bash
# These are auto-set by Vercel:
# - POSTGRES_URL
# - POSTGRES_PRISMA_URL
# - POSTGRES_URL_NON_POOLING
# - BLOB_READ_WRITE_TOKEN
# - CRON_SECRET

# You must set these:
NEXTAUTH_URL=https://your-app.vercel.app
NEXTAUTH_SECRET=<generate-with-openssl-rand-base64-32>

# Google OAuth
GOOGLE_CLIENT_ID=<your-google-client-id>
GOOGLE_CLIENT_SECRET=<your-google-client-secret>
ALLOWED_EMAILS=your.email@gmail.com,your.other@gmail.com

# Google Gemini AI
VISION_PROVIDER=gemini
GEMINI_API_KEY=<your-gemini-api-key>
GEMINI_EXTRACTION_MODEL=gemini-2.5-flash
GEMINI_ANALYSIS_MODEL=gemini-2.5-pro

# Database
DATABASE_URL=${POSTGRES_PRISMA_URL}
```

---

## 11. Testing Strategy

### Unit Tests
- Food normalization logic
- Statistical correlation calculations
- Relative risk computation
- Confidence scoring

### Integration Tests
- API endpoints (CRUD operations)
- Authentication flow
- Export/import functionality
- OCR extraction with mock provider

### Test Examples
```typescript
// tests/analysis.test.ts
describe('Correlation Analysis', () => {
  test('calculates relative risk correctly', () => {
    const result = calculateRelativeRisk({
      totalDays: 30,
      foodDays: 10,
      badDays: 12,
      foodAndBadDays: 8
    });
    
    expect(result.relativeRisk).toBeCloseTo(3.0, 1);
    expect(result.confidence).toBe('medium');
  });
  
  test('handles zero denominators gracefully', () => {
    const result = calculateRelativeRisk({
      totalDays: 30,
      foodDays: 30,  // Food present every day
      badDays: 12,
      foodAndBadDays: 12
    });
    
    expect(result.relativeRisk).toBe(Infinity);
    expect(result.interpretation).toContain('insufficient variation');
  });
});

// tests/export.test.ts
describe('Data Export', () => {
  test('exports all user data as JSON', async () => {
    const userId = 'test-user';
    const exportData = await exportUserData(userId);
    
    expect(exportData).toHaveProperty('dailyEntries');
    expect(exportData).toHaveProperty('weeklyReports');
    expect(exportData.dailyEntries.length).toBeGreaterThan(0);
  });
  
  test('import restores data correctly', async () => {
    const original = await exportUserData('test-user');
    await clearUserData('test-user');
    await importUserData('test-user', original);
    const restored = await exportUserData('test-user');
    
    expect(restored.dailyEntries.length).toBe(original.dailyEntries.length);
  });
});
```

---

## 12. Deployment Guide (Vercel)

### Prerequisites

1. **Cursor Origin Repository**: Code pushed to Origin (not GitHub)
2. **Google OAuth Credentials**: Client ID and Secret from Google Cloud Console
3. **OpenAI API Key**: For food extraction (or use mock mode initially)
4. **Vercel Account**: Free tier is sufficient for single-user app

### Step-by-Step Deployment

#### 1. Create Google OAuth Client

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create new project: "Food Tracker"
3. Enable Google+ API:
   - APIs & Services → Library
   - Search "Google+ API" → Enable
4. Create OAuth credentials:
   - APIs & Services → Credentials
   - Create Credentials → OAuth client ID
   - Application type: Web application
   - Name: "Food Tracker Production"
   - Authorized JavaScript origins:
     - Add later after getting Vercel URL
   - Authorized redirect URIs:
     - Add later: `https://your-app.vercel.app/api/auth/callback/google`
   - Click Create
5. **Save** Client ID and Client Secret (you'll need these in step 4)

#### 2. Connect Vercel to Origin

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click "Add New" → "Project"
3. Select "Import Git Repository"
4. Choose "Cursor Origin" as the source
5. **Authorize Vercel** to access your Origin repositories:
   - Click "Connect to Origin"
   - Authenticate with your Cursor account
   - Grant repository access
6. Select your food tracker repository from the list
7. Click "Import"

**Note**: Vercel has native Origin integration. Do NOT mirror to GitHub.

#### 3. Configure Project Settings

In the Vercel project configuration screen:

- **Framework Preset**: Next.js (auto-detected)
- **Root Directory**: `./` (leave default)
- **Build Command**: `prisma generate && next build` (or leave default)
- **Install Command**: `npm install` (default)

Click "Deploy" to create the initial deployment (it may fail - that's okay, we need to add env vars next).

#### 4. Add Environment Variables

In Vercel Dashboard → Your Project → Settings → Environment Variables:

Add these variables (apply to Production, Preview, and Development):

```bash
# NextAuth
NEXTAUTH_URL=https://your-app.vercel.app  # Replace with your actual Vercel URL
NEXTAUTH_SECRET=<generate-a-secret>        # Run: openssl rand -base64 32

# Google OAuth
GOOGLE_CLIENT_ID=<your-client-id>.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=<your-client-secret>

# Email Allowlist
ALLOWED_EMAILS=your.email@gmail.com,your.other@gmail.com  # Your Gmail address(es)

# Vision AI
VISION_PROVIDER=openai  # or 'mock' to start without API costs
OPENAI_API_KEY=sk-...   # Optional if using mock initially

# Database (auto-set by Vercel Postgres, add manually if needed)
DATABASE_URL=${POSTGRES_PRISMA_URL}
```

#### 5. Enable Vercel Postgres

1. In Vercel Dashboard → Your Project → Storage
2. Click "Create Database"
3. Select "Postgres"
4. Choose a name: "food-tracker-db"
5. Select region (choose closest to you)
6. Click "Create"
7. Vercel automatically adds these env vars:
   - `POSTGRES_URL`
   - `POSTGRES_PRISMA_URL`
   - `POSTGRES_URL_NON_POOLING`

#### 6. Enable Vercel Blob Storage

1. In Vercel Dashboard → Your Project → Storage
2. Click "Create Store"
3. Select "Blob"
4. Choose a name: "food-tracker-images"
5. Click "Create"
6. Vercel automatically adds:
   - `BLOB_READ_WRITE_TOKEN`

#### 7. Update Google OAuth Redirect URIs

Now that you have your Vercel URL:

1. Go back to Google Cloud Console → Credentials
2. Edit your OAuth client
3. Update **Authorized JavaScript origins**:
   - Add: `https://your-app.vercel.app` (your actual URL)
4. Update **Authorized redirect URIs**:
   - Add: `https://your-app.vercel.app/api/auth/callback/google`
5. Save changes

For local development, also add:
- Origin: `http://localhost:3000`
- Redirect URI: `http://localhost:3000/api/auth/callback/google`

#### 8. Run Database Migrations

You have two options:

**Option A: Via Vercel CLI** (recommended):
```bash
# Install Vercel CLI
npm i -g vercel

# Login to Vercel
vercel login

# Link project
vercel link

# Pull environment variables (for DATABASE_URL)
vercel env pull .env.local

# Run migrations locally against production DB
npx prisma migrate deploy
```

**Option B: Via Vercel Build** (automatic):
- Add a build hook in `package.json`:
```json
{
  "scripts": {
    "build": "prisma generate && prisma migrate deploy && next build"
  }
}
```

#### 9. Redeploy

1. In Vercel Dashboard → Your Project → Deployments
2. Click "Redeploy" on the latest deployment
3. Or push a new commit to trigger automatic deployment

#### 10. Verify Deployment

1. Visit your Vercel URL: `https://your-app.vercel.app`
2. Click "Sign in with Google"
3. Authenticate with your allowlisted Gmail
4. You should land on the dashboard (or setup wizard if first user)

### Vercel Cron Configuration

Create `vercel.json` in project root:

```json
{
  "crons": [{
    "path": "/api/cron/weekly-report",
    "schedule": "0 9 * * 1"
  }]
}
```

Vercel will automatically:
- Run the cron job every Monday at 9 AM UTC
- Inject `CRON_SECRET` header for authentication
- Provide monitoring in the dashboard

### Custom Domain (Optional)

1. In Vercel Dashboard → Your Project → Settings → Domains
2. Add your custom domain: `food.yourdomain.com`
3. Follow DNS configuration instructions
4. Update `NEXTAUTH_URL` env var to your custom domain
5. Update Google OAuth redirect URIs to match

### Monitoring

Vercel provides:
- **Logs**: Real-time function logs in dashboard
- **Analytics**: Page views and performance metrics
- **Errors**: Automatic error tracking
- **Cron Logs**: See weekly report generation history

### Troubleshooting

**Issue**: "NEXTAUTH_URL mismatch"
- Ensure `NEXTAUTH_URL` matches your actual Vercel URL
- No trailing slash

**Issue**: "Google OAuth redirect_uri_mismatch"
- Verify redirect URI in Google Console exactly matches: `https://your-app.vercel.app/api/auth/callback/google`
- Check for `http` vs `https`, trailing slashes, port numbers

**Issue**: "Email not authorized"
- Check `ALLOWED_EMAILS` env var
- Ensure email is comma-separated with no spaces
- Emails are case-insensitive but must match exactly

**Issue**: "Database connection failed"
- Verify `DATABASE_URL` is set to `${POSTGRES_PRISMA_URL}`
- Check Postgres database is created in Vercel Storage
- Ensure migrations have run

**Issue**: "Image upload failed"
- Verify `BLOB_READ_WRITE_TOKEN` is set
- Check Blob storage is enabled in Vercel Storage

### Cost Expectations

**Vercel Free Tier** (sufficient for single-user):
- 100 GB bandwidth/month
- Unlimited deployments
- 1 concurrent build

**Vercel Postgres Free Tier**:
- 256 MB storage
- 60 compute hours/month
- Perfect for personal tracking app

**Vercel Blob Free Tier**:
- 1 GB storage
- 10 GB bandwidth/month
- Sufficient for ~200-500 food images

**Google Gemini API**:
- Gemini 2.5 Flash: Very fast and cost-effective for extraction tasks
- Gemini 2.5 Pro: Higher quality reasoning for weekly analysis
- Free tier: Generous rate limits (60 RPM for Flash, 10 RPM for Pro)
- For typical daily logging: **Free** or very low cost within rate limits
- Paid tier only needed for high-volume usage beyond free quotas

### Local Development with Vercel Services

```bash
# Install Vercel CLI
npm i -g vercel

# Login and link project
vercel login
vercel link

# Pull environment variables from Vercel
vercel env pull .env.local

# Start local dev server (uses Vercel's remote DB/Blob)
npm run dev
```

This connects your local development to Vercel's Postgres and Blob storage.

---

## 13. Mobile Considerations

### Responsive Design
- Mobile-first approach with Tailwind breakpoints
- Touch-friendly button sizes (min 44x44px)
- Optimized for iPhone SE (375px) to iPad Pro (1024px)
- Bottom navigation on mobile, sidebar on desktop

### iOS-Specific
- HEIC image support (convert to JPEG on upload)
- Clipboard paste API for screenshots
- Safari-specific PWA install instructions
- Viewport height handling (`dvh` units for mobile browsers)

### Performance
- Image compression before upload (max 5MB)
- Lazy loading for history list
- Optimistic UI updates
- Service worker caching for offline access

---

## 14. Future Enhancements (Not in v1)

- **Multi-user support**: Family sharing with separate accounts
- **Food database**: Pre-populated ingredient database for faster entry
- **Recipe tracking**: Log entire recipes, not just ingredients
- **Meal photos**: Take/upload photos of actual meals (not just lists)
- **Medication tracking**: Log medications alongside food
- **Stool chart**: Bristol stool scale tracking
- **Advanced AI**: Predict symptom likelihood based on planned meals
- **Integration**: Export to Apple Health, Google Fit
- **Social**: Share anonymized data for research (opt-in)
- **Reminders**: Daily logging reminders via push notifications

---

## Summary

This design provides a complete, production-ready food and symptom tracking application with:

1. **Fast daily entry**: Paste/upload image → AI extracts → verify → save (under 1 minute)
2. **Robust data model**: Relational schema with separation of raw data and AI interpretations
3. **Statistical analysis**: Deterministic correlation calculations with AI narration
4. **Weekly reports**: Automated summaries with actionable insights
5. **Privacy-first**: Single-user auth, secure image URLs, local deployment option
6. **Cross-platform**: PWA works on macOS, iOS, iPad with native-like experience
7. **Provider-agnostic**: Pluggable AI providers (OpenAI/Anthropic/Mock)
8. **Full data ownership**: JSON/CSV export with images, import capability
9. **Deployment flexibility**: Vercel, Docker, or self-hosted

The architecture prioritizes data integrity, user privacy, and long-term maintainability while delivering a delightful user experience for daily tracking and analysis.
