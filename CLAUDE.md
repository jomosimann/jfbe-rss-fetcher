# CLAUDE.md — RSS News Agent

This file is read automatically by Claude Code at the start of every session.
Do not delete it. Update it when the project evolves.

---

## Project Overview

A private tool that monitors a configurable list of RSS news feeds twice per week (Monday & Thursday), scores each new article for political relevance using AI, and surfaces high-scoring articles in a private admin dashboard.

**Goal:** Catch opportunities for political messaging without manually reading newspapers daily.

---

## Tech Stack

| Layer              | Tool                                                           |
| ------------------ | -------------------------------------------------------------- |
| Framework          | Next.js 15 (App Router)                                        |
| Database + Auth    | Supabase (Postgres + Supabase Auth)                            |
| Styling            | Tailwind CSS                                                   |
| Hosting            | Vercel (free tier)                                             |
| Scheduler          | GitHub Actions (`schedule:`)                                   |
| Note               | Next.js 15 uses async cookies/headers APIs — always await them |
| RSS parsing        | `rss-parser` (npm)                                             |
| Article extraction | `@mozilla/readability` + `jsdom` (npm)                         |
| AI scoring         | Google Gemini 2.5 Flash-Lite API (free tier)                   |

---

## Architecture

```
GitHub Actions (cron: Monday & Thursday 07:00 UTC)
        ↓
POST /api/cron/rss  (protected by CRON_SECRET bearer token)
        ↓
┌─────────────────────────────────────────────┐
│ Phase 1: Collect                            │
│ • Fetch active RSS feeds from Supabase      │
│ • Load admin_settings (thresholds,          │
│   policy areas, policy context)             │
│ • For each new item (not in seen_items):    │
│   → Fetch full article via Readability      │
│   → Fallback to RSS description if          │
│     paywalled / blocked / < 500 chars       │
│   → Detect wire reports (SDA/ATS/AWP)       │
└───────────────┬─────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────┐
│ Phase 2: Wire Deduplication                 │
│ • Group wire reports by title similarity    │
│ • Keep one per group (prefer NZZ > SRF      │
│   > BZ > others)                            │
└───────────────┬─────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────┐
│ Phase 3: Title Deduplication                │
│ • Group remaining items by title word       │
│   overlap (> 50% significant words)         │
│ • Keep one per group (same preference)      │
└───────────────┬─────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────┐
│ Phase 4: AI Scoring                         │
│ • Send each article to Gemini 2.5 Flash-Lite│
│ • Score: relevance, actionability,          │
│   sentiment, urgency, policy area,          │
│   region, summary, reason                   │
│ • Swiss relevance filter: non-Swiss         │
│   articles get relevance = 1                │
│ • Save if above thresholds                  │
└───────────────┬─────────────────────────────┘
                │
                ▼
        Admin Dashboard
        /admin/articles
```

### Scheduling detail

- GitHub Actions `schedule: cron: '0 7 * * 1,4'` (every Monday and Thursday, 07:00 UTC)
- Calls `POST /api/cron/rss` on the Vercel deployment
- Route validates `Authorization: Bearer $CRON_SECRET` before running
- GitHub Actions is used instead of Vercel Cron to stay on free tier

### Vercel config

`vercel.json` sets `maxDuration: 300` (5 minutes) for the cron route to allow time for fetching and scoring many articles.

### Article fetching strategy

1. Attempt full article fetch via `fetch()` + `@mozilla/readability` (JSDOM) parsing
2. If response is 403/401, body is <500 chars, or Readability returns no content → fall back to RSS description (`contentSnippet` / `content` / `summary`)
3. Whatever text is available gets passed to Gemini

### Wire report detection

Wire reports from Swiss news agencies (SDA, ATS, AWP) are detected by scanning the title and first 2000 characters of the body for indicators like `Keystone-SDA`, `(sda)`, `(ats)`, `(awp)`, etc. Detected wire reports are grouped by title similarity and deduplicated in Phase 2.

### Title deduplication

After wire dedup, all remaining items are grouped by significant word overlap. German stopwords are stripped, and if two titles share >50% of their significant words, they are considered duplicates. The preferred outlet's version is kept (NZZ > SRF News > BZ > others).

---

## Supabase Schema

### `rss_feeds`

```sql
create table rss_feeds (
  id uuid primary key default gen_random_uuid(),
  outlet_name text not null,        -- e.g. "NZZ", "SRF News", "Tages-Anzeiger"
  url text not null unique,
  active boolean default true,
  last_fetched_at timestamptz,
  last_error text,
  created_at timestamptz default now()
);
```

### `rss_seen_items`

```sql
create table rss_seen_items (
  guid text primary key,
  feed_id uuid references rss_feeds(id),
  outlet_name text,                 -- denormalized for easy querying
  title text,
  url text,
  relevance int,                    -- 1–5: how closely this touches party policy areas
  actionability int,                -- 1–5: whether there is a concrete hook to respond to
  sentiment text,                   -- 'opportunity' | 'threat' | 'neutral'
  urgency text,                     -- 'this week' | 'this month' | 'background'
  policy_area text,
  region text,                      -- Bernese region or 'Schweiz' / 'Kanton Bern'
  summary text,                     -- AI-generated, always in German
  reason text,                      -- AI explanation of relevance and suggested angle
  published_at timestamptz,
  seen_at timestamptz default now()
);
```

### `admin_settings`

```sql
create table admin_settings (
  key text primary key,
  value text not null
);
```

Seed data:

```sql
insert into admin_settings (key, value) values
  ('relevance_threshold', '3'),
  ('actionability_threshold', '3'),
  ('policy_areas', 'Wohnen,Verkehr,Klima,Soziales,Finanzen,Bildung,Gesundheit,Sicherheit,Sonstiges'),
  ('policy_context', '-- see below --');
```

## This is already implemented in the Supabase database.

## AI Scoring

Each article is scored in a single Gemini 2.5 Flash-Lite API call. The prompt includes:

- The article text (or RSS description fallback)
- The full `policy_context` from `admin_settings`
- The list of `policy_areas` from `admin_settings`
- An instruction to use the full 1–5 range and not cluster around the middle

Response must be valid JSON:

```json
{
  "relevance": 4,
  "actionability": 3,
  "sentiment": "opportunity",
  "urgency": "this week",
  "policy_area": "Wohnen",
  "region": "Bern Stadt",
  "summary": "Kurze Zusammenfassung auf Deutsch (2-3 Sätze).",
  "reason": "Warum dieser Artikel politisch relevant ist und was die Partei damit machen könnte."
}
```

### Field definitions

| Field           | Type   | Description                                                                                    |
| --------------- | ------ | ---------------------------------------------------------------------------------------------- |
| `relevance`     | 1–5    | How closely the article touches the party's policy areas                                       |
| `actionability` | 1–5    | Whether there is a concrete hook (vote, statement, statistic, opponent position) to respond to |
| `sentiment`     | string | `opportunity` = supports party position / `threat` = undermines it / `neutral`                 |
| `urgency`       | string | `this week` = breaking/imminent / `this month` = upcoming / `background` = slow-burn context   |
| `policy_area`   | string | Must match one of the values in `admin_settings.policy_areas`                                  |
| `region`        | string | Bernese region, `Kanton Bern`, or `Schweiz`                                                    |
| `summary`       | string | 2–3 sentence summary in German                                                                 |
| `reason`        | string | Explanation of relevance and suggested angle, in German                                        |

### Filtering logic

An article is saved if: `relevance >= relevance_threshold AND actionability >= actionability_threshold`
Both thresholds are read from `admin_settings` — never hardcoded.

### Prompt guidance

Instruct Gemini explicitly to use the full 1–5 range. Without this, the model clusters around 3. Example instruction to include in prompt:

> "Verwende die gesamte Skala von 1–5. Eine 5 bedeutet aussergewöhnlich relevant/umsetzbar. Eine 1 bedeutet völlig irrelevant. Vermeide es, alles mit 3 zu bewerten."

### Swiss relevance filter

The prompt instructs Gemini to first check whether the article has a direct Swiss connection (Swiss politics, institutions, companies, or significant impact on Switzerland). Articles without one receive `relevance = 1` and `actionability = 1` automatically, ensuring foreign news doesn't clutter the digest.

### Region values

The prompt constrains `region` to one of: `Bern Stadt`, `Thun und Umgebung`, `Berner Oberland`, `Seeland`, `Biel/Bienne`, `Burgdorf/Emmental`, `Langenthal-Oberaargau`, `Jura bernois`, `Mittelland`, `Kanton Bern`, `Schweiz`. Defaults to `Schweiz` if no clear Bernese regional link.

---

## Policy Context (paste as `value` for `policy_context` key in `admin_settings`)

```
PARTEI: Jungfreisinnige Kanton Bern (JFBE) – liberal, marktorientiert, pro Eigenverantwortung, pro Freihandel, föderalistisch, staatsskeptisch.

WOHNEN:
- Die Wohnungsknappheit ist ein Angebotsproblem, kein Preisproblem – die Lösung liegt in mehr Bau, nicht in mehr Regulierung
- Zonenplanung liberalisieren: Verdichtung nach innen ermöglichen, Umzonungen beschleunigen, Bauhindernisse abbauen
- Baubewilligungsverfahren radikal vereinfachen und digitalisieren; Einspracherechte dürfen Verdichtung nicht blockieren
- Mietrecht: Wir lehnen Mietzinsdeckel und weitere Verschärfungen des Mietrechts ab – sie reduzieren das Angebot und schädigen Vermieter
- Eigentumsrechte stärken: Eigenbedarf und Untermiete müssen rechtssicher und praxistauglich geregelt sein (vgl. Mietrechtsabstimmung Nov. 2024)
- Keine Ausweitung des staatsnahen oder gemeinnützigen Wohnungsbaus auf Kosten des privaten Markts
- Referenzzinssatz-System: Marktmechanismen müssen funktionieren dürfen; politische Eingriffe in die Mietzinsgestaltung ablehnen
- Wohneigentum fördern: steuerliche Hürden beim Ersterwerb senken, Eigenmietwertbesteuerung abschaffen
- Bauen als gesellschaftliche Priorität: RPG-Vollzug darf nicht zur faktischen Bausperre in Agglomerationen werden

SICHERHEIT:
- Verteidigungsbudget auf 2% BIP erhöhen (aktuell 0.74%)
- Bodengestützte Luftverteidigung («Iron Dome») aufbauen
- Allgemeine Dienstpflicht für alle Geschlechter einführen
- Zivildienst schrittweise abschaffen; Ersatz durch Zivilschutz oder Ersatzabgabe
- Zivilschutz zu schlagkräftiger Krisenorganisation ausbauen
- Blaulichtorganisationen stärken; Forderungen nach Polizeientwaffnung ablehnen
- Wehrpflichtumgehung durch späte Einbürgerung schliessen

KLIMA:
- Integration in EU-CO2-Emissionshandel (ETS) statt nationaler Verbote und Steuern
- Rückerstattung von Umweltabgaben an Haushalte (keine Staatsfonds)
- Kernkraftwerk-Bauverbot aufheben; Kernenergie als CO2-arme Option unterstützen
- Technologieverbote grundsätzlich aufheben; Innovation statt Verbote
- Steuerabzüge (nicht Subventionen) für energetische Gebäudesanierung
- Mobility Pricing im Verkehr statt Mineralölsteuer
- Internationale Lösung für Flugverkehrsemissionen (CORSIA); keine rein nationale Flugticketsteuer

VERKEHR:
- Mobility Pricing als marktbasiertes Steuerungsinstrument einführen
- Liberalisierung von Technologieplattformen im Personentransport (z.B. Uber)
- Autonomes Fahren und 5G-Infrastruktur fördern
- Keine ideologischen Verkehrsverbote; Kostenwahrheit statt Verbote

SOZIALES:
- AHV strukturell reformieren: Rentenalter 66, gekoppelt an Lebenserwartung
- Keine AHV-Erhöhungen oder Sonderteuerungsausgleiche
- BVG: Umwandlungssatz entpolitisieren, Koordinationsabzug abschaffen, Eintrittsschwelle halbieren
- Dritte Säule flexibilisieren: höhere Einzahlungen, Nachzahlungen ermöglichen
- Individualbesteuerung einführen
- Elternzeit 16 Wochen frei aufteilbar
- LGBTQ+: gleiche Rechte und Pflichten für alle; originäre Elternschaft für alle Paare
- Verantwortungsgemeinschaft statt Ehe als Zivilstandskonstrukt

FINANZEN:
- Staatsquote auf 20% senken
- Schuldenbremse unbedingt erhalten; keine Lockerung
- MwSt: einheitlicher tiefer Satz, Abschaffung von Ausnahmen
- Progressive Einkommensteuer durch lineare Steuer ersetzen
- Steuerwettbewerb der Kantone erhalten
- Kirchensteuer für juristische Personen abschaffen
- Privatisierung aller Staatsunternehmen in funktionierenden Märkten
- Freihandelsabkommen mit USA, Mercosur, Malaysia prioritär abschliessen
- Keine Erhöhung von Lohnabgaben oder MwSt zur AHV-Sanierung

BILDUNG:
- Politische Neutralität in Bildungsinstitutionen verankern
- Bürokratieabbau für Lehrpersonen
- Förderklassen für Lernschwache; Ende der ideologischen Inklusion um jeden Preis
- Neues Schulfach «Lebensökonomie» auf Sekundarstufe I
- Sprachaufenthalte (mind. 4 Wochen) in andere Sprachregion für alle Sekundarschüler
- Duale Bildung stärken; niedrigere Gymnasialquote; Berufslehre aufwerten
- Nachgelagerte Studiengebühren einführen (einkommensabhängige Rückzahlung)
- Podcast-Pflicht an öffentlichen Hochschulen
- Praxisnähere Ausbildung an Pädagogischen Hochschulen

GESUNDHEIT:
- Spitalplanung über schweizweite Qualitätsstandards statt kantonale Spitallisten
- Anzahl Spitäler reduzieren; Kompetenzzentren stärken
- Abkehr von mengenbasierter hin zu qualitätsbasierter Vergütung
- Komplementärmedizin aus Grundversicherung streichen
- Elektronisches Patientendossier (EPD) rasch einführen
- Gesundheitssparkonto nach Modell 3. Säule einführen
- Generika-Pflicht (günstigstes Präparat, ausser medizinischer Grund)
- «Cassis de Dijon»-Prinzip für Arzneimittel einführen
- Kein Territorialitätsprinzip: Versicherungen sollen Auslandsleistungen erstatten können

SONSTIGES (Medien & Digitalisierung):
- Serafe-Gebühr auf max. 200 CHF senken; Unternehmen vollständig befreien
- SRG auf Kernauftrag beschränken: Information, Bildung, Kultur; Unterhaltungssparte privatisieren
- Keine Linksteuer; kein staatsnaher Medienmarkt
- Lokaljournalismus über Infrastruktur (nicht Inhaltssubventionen) fördern
- Regulatory Sandboxes für neue Technologien; E-ID einführen
- Netzneutralität gesetzlich verankern; Datensouveränität des Bürgers schützen
- Technologieneutrale Gesetze; digitale Waffengattung für Cyberschutz
- Bilaterale Verträge als Königsweg; EU-Beitritt und automatische Rechtsübernahme ablehnen
- Agrarfreihandel; Direktzahlungen schrittweise abbauen; Gentechmoratorium aufheben
```

---

## Admin Routes

All `/admin/*` routes are protected by Next.js middleware using Supabase Auth.
Single admin user, created manually in the Supabase dashboard. No public signup.

| Route             | Description                                                                                  |
| ----------------- | -------------------------------------------------------------------------------------------- |
| `/admin`          | Login page; redirects to `/admin/articles` if already authenticated                          |
| `/admin/articles` | Article digest; default sort by policy area; filterable by outlet, sentiment, urgency, score |
| `/admin/feeds`    | Add / toggle / remove RSS feeds; shows `last_fetched_at` and `last_error` per feed           |
| `/admin/settings` | Edit policy context, policy areas, relevance threshold, actionability threshold              |

The admin UI is read-only for articles — no mark-as-used or notes needed.

---

## Language Conventions

- All UI copy in German (Schweizer Hochdeutsch)
- Orthography: use `ss` not `ß` (Swiss standard)
- All AI-generated output (summaries, reasons) in German regardless of source language

---

## Build Order

1. Supabase schema + seed `admin_settings`
2. Supabase Auth + Next.js middleware protecting `/admin/*`
3. `/admin/feeds` — feed management UI
4. `/admin/settings` — policy context, thresholds, policy area config
5. GitHub Actions cron + `/api/cron/rss` route (fetch → score → store)
6. `/admin/articles` — digest UI sorted by policy area, filterable by sentiment/urgency

---

## Cost Constraints

Free tiers only — do not introduce any paid services.

- Vercel free tier: use GitHub Actions for scheduling (Vercel free only allows 1 cron/day)
- Gemini 2.5 Flash-Lite: free tier — sufficient for twice-weekly runs
- Supabase free tier: 500MB storage, 2GB bandwidth
