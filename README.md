# JFBE RSS — Political News Intelligence Agent

A private tool that monitors Swiss news via RSS feeds, scores each article for political relevance using AI, and surfaces high-scoring articles in an admin dashboard. Built for the Jungfreisinnige Kanton Bern (JFBE) to catch opportunities for political messaging without manually reading newspapers.

## Tech Stack

| Layer              | Tool                                           |
| ------------------ | ---------------------------------------------- |
| Framework          | Next.js 15 (App Router)                        |
| Database + Auth    | Supabase (Postgres + Supabase Auth)            |
| Styling            | Tailwind CSS 4                                 |
| Hosting            | Vercel (free tier)                             |
| Scheduler          | GitHub Actions (cron)                          |
| RSS Parsing        | `rss-parser`                                   |
| Article Extraction | `@mozilla/readability` + `jsdom`               |
| AI Scoring         | Google Gemini 2.5 Flash-Lite                   |

## Architecture

```
GitHub Actions (cron: Mon & Thu 07:00 UTC)
        │
        ▼
POST /api/cron/rss  ◄── protected by CRON_SECRET bearer token
        │
        ▼
┌───────────────────────────────────────────┐
│  Phase 1: Collect                         │
│  • Fetch active RSS feeds from Supabase   │
│  • Load admin_settings (thresholds,       │
│    policy areas, policy context)          │
│  • For each new item (not in seen_items): │
│    → Fetch full article via Readability   │
│    → Fallback to RSS description if       │
│      paywalled / blocked / < 500 chars    │
│    → Detect wire reports (SDA/ATS/AWP)    │
└───────────────┬───────────────────────────┘
                │
                ▼
┌───────────────────────────────────────────┐
│  Phase 2: Wire Deduplication              │
│  • Group wire reports by title similarity │
│  • Keep one per group (prefer NZZ > SRF   │
│    > BZ > others)                         │
└───────────────┬───────────────────────────┘
                │
                ▼
┌───────────────────────────────────────────┐
│  Phase 3: Title Deduplication             │
│  • Group remaining items by title word    │
│    overlap (> 50% significant words)      │
│  • Keep one per group (same preference)   │
└───────────────┬───────────────────────────┘
                │
                ▼
┌───────────────────────────────────────────┐
│  Phase 4: AI Scoring                      │
│  • Send each article to Gemini            │
│  • Score: relevance, actionability,       │
│    sentiment, urgency, policy area,       │
│    region, summary, reason                │
│  • Swiss relevance filter: non-Swiss      │
│    articles get relevance = 1             │
│  • Save if above thresholds               │
└───────────────┬───────────────────────────┘
                │
                ▼
        Admin Dashboard
        /admin/articles
```

## Features

- **Automated RSS ingestion** — fetches from configurable list of Swiss news feeds twice weekly
- **Full article extraction** — uses Mozilla Readability to parse full article text; falls back to RSS description for paywalled content
- **AI-powered scoring** — each article scored on relevance (1-5) and actionability (1-5) against JFBE policy positions
- **Swiss relevance filter** — articles without a direct Swiss connection are automatically scored low
- **Regional tagging** — articles tagged to Bernese regions (Bern Stadt, Thun, Seeland, etc.) or national level
- **Wire report detection** — identifies SDA/ATS/AWP wire reports via keyword matching
- **Two-stage deduplication** — wire reports deduplicated first, then all items deduplicated by title word overlap (>50% threshold)
- **Outlet preference** — when deduplicating, prefers NZZ > SRF News > BZ > others
- **Configurable thresholds** — relevance and actionability thresholds adjustable in admin settings
- **Configurable policy context** — the full party platform and policy areas are editable at runtime
- **German-language output** — all AI summaries and UI copy in Swiss Standard German
- **Protected admin dashboard** — Supabase Auth with single admin user
- **Zero cost** — runs entirely on free tiers (Vercel, Supabase, Gemini, GitHub Actions)

## AI Scoring

Each article is sent to Gemini with the full party policy context. The model returns a structured JSON response:

| Field           | Type   | Description                                                                 |
| --------------- | ------ | --------------------------------------------------------------------------- |
| `relevance`     | 1-5    | How closely the article touches the party's policy areas                    |
| `actionability` | 1-5    | Whether there is a concrete hook to respond to (vote, statement, statistic) |
| `sentiment`     | string | `opportunity` / `threat` / `neutral`                                        |
| `urgency`       | string | `this week` / `this month` / `background`                                   |
| `policy_area`   | string | One of the configured policy areas (Wohnen, Verkehr, Klima, etc.)           |
| `region`        | string | Bernese region or `Schweiz` / `Kanton Bern`                                 |
| `summary`       | string | 2-3 sentence summary in German                                              |
| `reason`        | string | Why the article matters and what the party could do with it                  |

### Swiss Relevance Filter

The prompt instructs Gemini to first check whether the article has a direct Swiss connection (Swiss politics, institutions, companies, or significant impact on Switzerland). Articles without one receive `relevance = 1` and `actionability = 1` automatically, ensuring foreign news doesn't clutter the digest.

### Wire Report Detection

Wire reports from Swiss news agencies (SDA, ATS, AWP) are detected by scanning the title and first 2000 characters of the body for agency indicators like `Keystone-SDA`, `(sda)`, `(ats)`, `(awp)`, etc. Detected wire reports are grouped by title similarity and deduplicated — only one version is kept per story, preferring higher-quality outlets.

### Title Deduplication

After wire deduplication, all remaining items are grouped by significant word overlap. German stopwords are stripped, and if two titles share >50% of their significant words, they are considered duplicates. The preferred outlet's version is kept.

### Threshold Logic

An article is saved only if:

```
relevance >= relevance_threshold AND actionability >= actionability_threshold
```

Both thresholds are read from `admin_settings` at runtime (default: 3).

## Admin UI

All admin routes are protected by Supabase Auth middleware. Single admin user, no public signup.

### `/admin` — Login

Login page. Redirects to `/admin/articles` if already authenticated.

### `/admin/articles` — Article Digest

The main dashboard. Displays scored articles with:
- Filtering by outlet, sentiment, urgency, policy area, region, and score
- Default sort by policy area
- Each article shows relevance/actionability scores, sentiment badge, urgency, summary, and reason
- Timer showing when the next scheduled fetch will run

### `/admin/feeds` — Feed Management

Add, toggle (active/inactive), or remove RSS feeds. Each feed shows:
- Outlet name and URL
- Last fetched timestamp
- Last error message (if any)

### `/admin/settings` — Configuration

Edit the AI scoring parameters:
- **Relevance threshold** (1-5)
- **Actionability threshold** (1-5)
- **Policy areas** (comma-separated list)
- **Policy context** (full party platform text sent to Gemini)

## Setup

### Prerequisites

- Node.js 18+
- A Supabase project (free tier)
- A Google AI Studio API key for Gemini (free tier)
- A Vercel account (free tier)
- A GitHub repository

### 1. Supabase Schema

Create the following tables in your Supabase SQL editor:

```sql
create table rss_feeds (
  id uuid primary key default gen_random_uuid(),
  outlet_name text not null,
  url text not null unique,
  active boolean default true,
  last_fetched_at timestamptz,
  last_error text,
  created_at timestamptz default now()
);

create table rss_seen_items (
  guid text primary key,
  feed_id uuid references rss_feeds(id),
  outlet_name text,
  title text,
  url text,
  relevance int,
  actionability int,
  sentiment text,
  urgency text,
  policy_area text,
  region text,
  summary text,
  reason text,
  published_at timestamptz,
  seen_at timestamptz default now()
);

create table admin_settings (
  key text primary key,
  value text not null
);

-- Seed default settings
insert into admin_settings (key, value) values
  ('relevance_threshold', '3'),
  ('actionability_threshold', '3'),
  ('policy_areas', 'Wohnen,Verkehr,Klima,Soziales,Finanzen,Bildung,Gesundheit,Sicherheit,Sonstiges'),
  ('policy_context', 'Your party policy context here');
```

Create an admin user manually via the Supabase Auth dashboard (Authentication > Users > Add User).

### 2. Environment Variables

Set the following in your Vercel project settings and `.env.local` for local development:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
GEMINI_API_KEY=your-gemini-api-key
CRON_SECRET=your-random-secret
```

Generate a `CRON_SECRET` with:

```bash
openssl rand -base64 32
```

### 3. Vercel Deployment

```bash
npm install
npm run build       # verify build succeeds locally
vercel              # deploy to Vercel
```

Set the environment variables in the Vercel dashboard under Settings > Environment Variables.

### 4. GitHub Actions

The workflow at `.github/workflows/rss-cron.yml` triggers RSS processing on a schedule. Set these GitHub repository secrets (Settings > Secrets and variables > Actions):

| Secret       | Value                                                             |
| ------------ | ----------------------------------------------------------------- |
| `VERCEL_URL` | Your Vercel deployment URL (e.g. `https://jfbe-rss.vercel.app`)  |
| `CRON_SECRET`| Same value as in Vercel environment variables                     |

The default schedule is **Monday and Thursday at 07:00 UTC**. Edit the cron expression in the workflow file to change this. You can also trigger it manually via the "Run workflow" button in GitHub Actions.

### 5. Local Development

```bash
npm install
npm run dev
```

The app runs at `http://localhost:3000`. To test the cron endpoint locally:

```bash
curl -X POST http://localhost:3000/api/cron/rss \
  -H "Authorization: Bearer your-cron-secret"
```

## Adding New RSS Feeds

1. Navigate to `/admin/feeds` in the dashboard
2. Enter the outlet name (e.g. "NZZ", "SRF News") and the RSS feed URL
3. Click Add — the feed will be active immediately and picked up on the next scheduled run

Alternatively, insert directly into Supabase:

```sql
insert into rss_feeds (outlet_name, url)
values ('NZZ', 'https://www.nzz.ch/recent.rss');
```

To temporarily disable a feed without removing it, toggle it inactive in the feeds UI.

## Project Structure

```
app/
  admin/
    page.tsx                          # Login page
    LoginForm.tsx                     # Login form component
    (dashboard)/
      layout.tsx                      # Dashboard layout with auth guard
      articles/
        page.tsx                      # Article digest page
        ArticleList.tsx               # Article list with filters
        NextFetch.tsx                 # Next fetch countdown timer
      feeds/
        page.tsx                      # Feed management page
        AddFeedForm.tsx               # Add feed form
      settings/
        page.tsx                      # Settings page
        SettingsForm.tsx              # Settings form
  api/
    cron/
      rss/
        route.ts                      # RSS processing endpoint
.github/
  workflows/
    rss-cron.yml                      # Scheduled GitHub Actions workflow
```

## License

Private project. Not for redistribution.
