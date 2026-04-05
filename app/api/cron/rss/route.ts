import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import Parser from 'rss-parser'
import { Readability } from '@mozilla/readability'
import { JSDOM } from 'jsdom'
import { GoogleGenerativeAI } from '@google/generative-ai'
import pLimit from 'p-limit'

const parser = new Parser()

export async function POST(request: NextRequest) {
  // --- Auth ---
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  console.log('[cron/rss] Authenticated. Starting RSS processing...')

  // --- Load settings ---
  const { data: settingsRows, error: settingsError } = await supabase
    .from('admin_settings')
    .select('*')

  console.log('[cron/rss] Settings loaded:', { count: settingsRows?.length ?? 0, error: settingsError?.message ?? null })

  const settings: Record<string, string> = {}
  for (const row of settingsRows ?? []) settings[row.key] = row.value

  const relevanceThreshold = parseInt(settings.relevance_threshold ?? '3', 10)
  const actionabilityThreshold = parseInt(settings.actionability_threshold ?? '3', 10)
  const policyAreas = settings.policy_areas ?? ''
  const policyContext = settings.policy_context ?? ''

  console.log('[cron/rss] Thresholds:', { relevanceThreshold, actionabilityThreshold })
  console.log('[cron/rss] Policy areas:', policyAreas)
  console.log('[cron/rss] Policy context length:', policyContext.length, 'chars')

  // --- Load active feeds ---
  const { data: feeds, error: feedsError } = await supabase
    .from('rss_feeds')
    .select('*')
    .eq('active', true)

  console.log('[cron/rss] Active feeds:', { count: feeds?.length ?? 0, error: feedsError?.message ?? null })
  if (feeds?.length) {
    console.log('[cron/rss] Feed list:', feeds.map((f) => ({ id: f.id, name: f.outlet_name, url: f.url })))
  }

  if (feedsError || !feeds) {
    console.error('[cron/rss] ABORTING: Failed to load feeds', feedsError)
    return NextResponse.json({ error: 'Failed to load feeds' }, { status: 500 })
  }

  // --- Gemini client ---
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' })

  let totalProcessed = 0
  let totalSaved = 0
  let totalWireDuplicatesSkipped = 0
  let totalTitleDuplicatesSkipped = 0

  // --- Phase 1: Collect all new items across all feeds ---
  type CollectedItem = {
    feedId: string
    outletName: string
    guid: string
    articleUrl: string
    title: string
    articleText: string
    isWire: boolean
    publishedAt: string | null
  }

  const allNewItems: CollectedItem[] = []
  const feedErrors: Map<string, string | null> = new Map()

  for (const feed of feeds) {
    let feedError: string | null = null
    console.log(`[cron/rss] --- Collecting from feed: "${feed.outlet_name}" (${feed.url}) ---`)

    try {
      const rssFeed = await parser.parseURL(feed.url)
      const items = rssFeed.items ?? []
      console.log(`[cron/rss] [${feed.outlet_name}] Parsed ${items.length} items from RSS`)

      // Collect guids to check which are already seen
      const guids = items
        .map((item) => item.guid || item.link || '')
        .filter(Boolean)

      console.log(`[cron/rss] [${feed.outlet_name}] ${guids.length} items have valid guids`)

      const { data: existing, error: existingError } = await supabase
        .from('rss_seen_items')
        .select('guid')
        .in('guid', guids)

      console.log(`[cron/rss] [${feed.outlet_name}] Already seen: ${existing?.length ?? 0} items`, existingError ? `(error: ${existingError.message})` : '')

      const existingGuids = new Set((existing ?? []).map((r) => r.guid))

      const newItems = items.filter((item) => {
        const guid = item.guid || item.link || ''
        return guid && !existingGuids.has(guid)
      })

      console.log(`[cron/rss] [${feed.outlet_name}] New items to collect: ${newItems.length}`)

      for (const item of newItems) {
        const guid = item.guid || item.link || ''
        const articleUrl = item.link || ''

        // --- Fetch article body ---
        let articleText = await fetchArticleBody(articleUrl)
        console.log(`[cron/rss] [${feed.outlet_name}] Article body fetch: ${articleText.length} chars from ${articleUrl}`)

        if (!articleText || articleText.length < 500) {
          const fallbackSource = item.contentSnippet ? 'contentSnippet' : item.content ? 'content' : item.summary ? 'summary' : 'none'
          articleText = item.contentSnippet || item.content || item.summary || ''
          console.log(`[cron/rss] [${feed.outlet_name}] Fell back to RSS ${fallbackSource}: ${articleText.length} chars`)
        }

        if (!articleText || articleText.trim().length === 0) {
          console.log(`[cron/rss] [${feed.outlet_name}] SKIPPED (no text): "${item.title}"`)
          continue
        }

        const isWire = detectWireReport(item.title ?? '', articleText)
        if (isWire) {
          console.log(`[cron/rss] [${feed.outlet_name}] Wire report detected: "${item.title}"`)
        }

        allNewItems.push({
          feedId: feed.id,
          outletName: feed.outlet_name,
          guid,
          articleUrl,
          title: item.title ?? '',
          articleText,
          isWire,
          publishedAt: item.isoDate || item.pubDate || null,
        })
      }
    } catch (err) {
      feedError = err instanceof Error ? err.message : String(err)
      console.error(`[cron/rss] [${feed.outlet_name}] FEED ERROR:`, feedError)
    }

    feedErrors.set(feed.id, feedError)

    // --- Update feed status ---
    await supabase
      .from('rss_feeds')
      .update({
        last_fetched_at: new Date().toISOString(),
        last_error: feedError,
      })
      .eq('id', feed.id)
    console.log(`[cron/rss] [${feed.outlet_name}] Updated feed status (error: ${feedError ?? 'none'})`)
  }

  console.log(`[cron/rss] Total new items collected across all feeds: ${allNewItems.length}`)

  // --- Phase 2: Wire report deduplication ---
  // Group wire reports by title similarity; keep only one per group
  const wireItems = allNewItems.filter((item) => item.isWire)
  const nonWireItems = allNewItems.filter((item) => !item.isWire)
  const wireGroups = groupBySimilarTitle(wireItems)
  const keptAfterWireDedup: CollectedItem[] = [...nonWireItems]

  for (const group of wireGroups) {
    const kept = pickPreferredOutlet(group)
    keptAfterWireDedup.push(kept)
    const skipped = group.length - 1
    totalWireDuplicatesSkipped += skipped
    if (skipped > 0) {
      console.log(`[cron/rss] Wire dedup: kept "${kept.title}" from ${kept.outletName}, skipped ${skipped} duplicate(s): ${group.filter((i) => i !== kept).map((i) => `"${i.title}" (${i.outletName})`).join(', ')}`)
    }
  }

  console.log(`[cron/rss] After wire dedup: ${keptAfterWireDedup.length} items (${totalWireDuplicatesSkipped} wire duplicates skipped)`)

  // --- Phase 3: Title similarity deduplication across all items ---
  const titleGroups = groupBySimilarTitle(keptAfterWireDedup)
  const itemsToScore: CollectedItem[] = []

  for (const group of titleGroups) {
    const kept = pickPreferredOutlet(group)
    itemsToScore.push(kept)
    const skipped = group.length - 1
    totalTitleDuplicatesSkipped += skipped
    if (skipped > 0) {
      console.log(`[cron/rss] Title dedup: kept "${kept.title}" from ${kept.outletName}, skipped ${skipped} duplicate(s): ${group.filter((i) => i !== kept).map((i) => `"${i.title}" (${i.outletName})`).join(', ')}`)
    }
  }

  console.log(`[cron/rss] After title dedup: ${itemsToScore.length} items to score (${totalTitleDuplicatesSkipped} title duplicates skipped)`)

  // --- Phase 4: Score with Gemini in parallel and save ---
  console.log(`[cron/rss] Sending ${itemsToScore.length} articles to Gemini for scoring (concurrency: 5)...`)
  const limit = pLimit(5)

  const scoringTasks = itemsToScore.map((item) =>
    limit(async () => {
      console.log(`[cron/rss] [${item.outletName}] Sending to Gemini: "${item.title}" (${item.articleText.slice(0, 12_000).length} chars)...`)
      const score = await scoreArticle(model, item.articleText, policyContext, policyAreas)

      if (!score) {
        console.log(`[cron/rss] [${item.outletName}] SKIPPED (Gemini returned null): "${item.title}"`)
        return { processed: false, saved: false }
      }

      console.log(`[cron/rss] [${item.outletName}] Gemini score:`, {
        title: item.title,
        relevance: score.relevance,
        actionability: score.actionability,
        sentiment: score.sentiment,
        urgency: score.urgency,
        policy_area: score.policy_area,
        region: score.region,
      })

      // --- Threshold check ---
      if (score.relevance >= relevanceThreshold && score.actionability >= actionabilityThreshold) {
        console.log(`[cron/rss] [${item.outletName}] ABOVE THRESHOLD — inserting into rss_seen_items`)
        const { error: insertError } = await supabase
          .from('rss_seen_items')
          .insert({
            guid: item.guid,
            feed_id: item.feedId,
            outlet_name: item.outletName,
            title: item.title,
            url: item.articleUrl,
            relevance: score.relevance,
            actionability: score.actionability,
            sentiment: score.sentiment,
            urgency: score.urgency,
            policy_area: score.policy_area,
            region: score.region,
            summary: score.summary,
            reason: score.reason,
            published_at: item.publishedAt,
          })

        if (insertError) {
          console.error(`[cron/rss] [${item.outletName}] INSERT ERROR:`, insertError.message)
          return { processed: true, saved: false }
        }
        console.log(`[cron/rss] [${item.outletName}] SAVED: "${item.title}"`)
        return { processed: true, saved: true }
      } else {
        console.log(`[cron/rss] [${item.outletName}] BELOW THRESHOLD — not saving (relevance=${score.relevance}, actionability=${score.actionability})`)
        return { processed: true, saved: false }
      }
    })
  )

  const results = await Promise.all(scoringTasks)
  for (const r of results) {
    if (r.processed) totalProcessed++
    if (r.saved) totalSaved++
  }

  console.log(`[cron/rss] DONE. Processed: ${totalProcessed}, Saved: ${totalSaved}, Wire duplicates skipped: ${totalWireDuplicatesSkipped}, Title duplicates skipped: ${totalTitleDuplicatesSkipped}`)
  return NextResponse.json({ processed: totalProcessed, saved: totalSaved, wireDuplicatesSkipped: totalWireDuplicatesSkipped, titleDuplicatesSkipped: totalTitleDuplicatesSkipped })
}

// --- Helpers ---

async function fetchArticleBody(url: string): Promise<string> {
  if (!url) {
    console.log('[fetchArticleBody] No URL provided')
    return ''
  }
  try {
    console.log(`[fetchArticleBody] Fetching: ${url}`)
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; JFBE-RSS-Bot/1.0)' },
      signal: AbortSignal.timeout(10_000),
    })
    console.log(`[fetchArticleBody] Response: ${res.status} ${res.statusText}`)
    if (res.status === 401 || res.status === 403) {
      console.log(`[fetchArticleBody] Blocked (${res.status}), returning empty`)
      return ''
    }
    const html = await res.text()
    console.log(`[fetchArticleBody] HTML length: ${html.length} chars`)

    const dom = new JSDOM(html, { url })
    const reader = new Readability(dom.window.document)
    const article = reader.parse()

    if (article?.textContent) {
      const text = article.textContent.trim()
      console.log(`[fetchArticleBody] Readability extracted: ${text.length} chars`)
      return text
    }

    console.log('[fetchArticleBody] Readability returned no content')
    return ''
  } catch (err) {
    console.error(`[fetchArticleBody] Error fetching ${url}:`, err instanceof Error ? err.message : String(err))
    return ''
  }
}

const WIRE_INDICATORS = [
  'Keystone-SDA',
  'SDA/ATS',
  'Keystone',
  '(sda)',
  '(ats)',
  '(awp)',
  ' sda)',
  ' ats)',
  ' awp)',
]

const WIRE_REGEX = /\b(?:sda|ats|awp)\b/i

function detectWireReport(title: string, body: string): boolean {
  const combined = `${title} ${body.slice(0, 2000)}`
  for (const indicator of WIRE_INDICATORS) {
    if (combined.includes(indicator)) return true
  }
  return WIRE_REGEX.test(combined)
}

// --- Title similarity deduplication helpers ---

const GERMAN_STOPWORDS = new Set([
  'der', 'die', 'das', 'und', 'in', 'von', 'mit', 'für', 'ist', 'auf',
  'an', 'im', 'zu', 'den', 'des', 'ein', 'eine', 'einem', 'einen', 'einer',
  'es', 'als', 'auch', 'aus', 'bei', 'bis', 'dem', 'nach', 'nicht', 'noch',
  'oder', 'sich', 'so', 'über', 'um', 'wie', 'wird', 'vor', 'zum', 'zur',
  'hat', 'dass', 'werden', 'vom', 'kann', 'mehr', 'sind', 'war', 'was',
  'wir', 'sie', 'er', 'aber', 'wenn', 'nur', 'dann', 'schon', 'hier',
  'seine', 'seine', 'ihre', 'man', 'alle', 'am', 'diese', 'dieser', 'diesem',
  'nun', 'haben', 'da', 'dort', 'wo', 'will', 'neue', 'neuer', 'neues',
  'neue', 'gegen', 'unter', 'keine', 'kein', 'doch', 'soll', 'sei',
])

function extractSignificantWords(title: string): Set<string> {
  const words = title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '') // strip punctuation, keep letters/numbers
    .split(/\s+/)
    .filter((w) => w.length > 1 && !GERMAN_STOPWORDS.has(w))
  return new Set(words)
}

function titleWordOverlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let shared = 0
  for (const word of a) {
    if (b.has(word)) shared++
  }
  const smaller = Math.min(a.size, b.size)
  return shared / smaller
}

// Outlet priority for deduplication: prefer NZZ > SRF News > BZ > others
const OUTLET_PRIORITY: Record<string, number> = {
  'NZZ': 1,
  'SRF News': 2,
  'BZ': 3,
}

function pickPreferredOutlet<T extends { outletName: string }>(group: T[]): T {
  return group.sort((a, b) => {
    const pa = OUTLET_PRIORITY[a.outletName] ?? 99
    const pb = OUTLET_PRIORITY[b.outletName] ?? 99
    return pa - pb
  })[0]
}

function groupBySimilarTitle<T extends { title: string }>(items: T[]): T[][] {
  const wordSets = items.map((item) => extractSignificantWords(item.title))
  const assigned = new Array(items.length).fill(false)
  const groups: T[][] = []

  for (let i = 0; i < items.length; i++) {
    if (assigned[i]) continue
    const group: T[] = [items[i]]
    assigned[i] = true

    for (let j = i + 1; j < items.length; j++) {
      if (assigned[j]) continue
      if (titleWordOverlap(wordSets[i], wordSets[j]) > 0.5) {
        group.push(items[j])
        assigned[j] = true
      }
    }

    groups.push(group)
  }

  return groups
}

async function scoreArticle(
  model: ReturnType<GoogleGenerativeAI['getGenerativeModel']>,
  articleText: string,
  policyContext: string,
  policyAreas: string,
): Promise<{
  relevance: number
  actionability: number
  sentiment: string
  urgency: string
  policy_area: string
  region: string
  summary: string
  reason: string
} | null> {
  // Truncate very long articles to stay within token limits
  const text = articleText.slice(0, 12_000)

  const prompt = `Du bist ein politischer Analyst für die Jungfreisinnigen Kanton Bern (JFBE).

Bewerte den folgenden Nachrichtenartikel anhand des politischen Kontexts der Partei.

POLITISCHER KONTEXT:
${policyContext}

POLITIKBEREICHE (wähle genau einen): ${policyAreas}

ARTIKELTEXT:
${text}

Bevor du bewertest: Prüfe, ob der Artikel einen direkten Bezug zur Schweiz hat (Schweizer Politik, Schweizer Institutionen, Schweizer Unternehmen, Schweizer Gesellschaft, oder gravierende Auswirkungen auf die Schweiz). Hat der Artikel keinen solchen Bezug, setze relevance und actionability beide auf 1 und policy_area auf Sonstiges. Bewerte nur Artikel mit Schweiz-Bezug vollständig.

BEWERTUNGSKRITERIEN:
- relevance (1–5): Wie eng berührt der Artikel die Politikbereiche der Partei?
- actionability (1–5): Gibt es einen konkreten Aufhänger (Abstimmung, Aussage, Statistik, gegnerische Position), auf den reagiert werden kann?
- sentiment: "opportunity" (stützt Parteiposition), "threat" (untergräbt sie) oder "neutral"
- urgency: "this week" (akut/dringend), "this month" (bevorstehend) oder "background" (Hintergrund)
- policy_area: Genau einer der oben genannten Politikbereiche
- region: Die Region, auf die sich der Artikel bezieht. Erlaubte Werte: "Bern Stadt", "Thun und Umgebung", "Berner Oberland", "Seeland", "Biel/Bienne", "Burgdorf/Emmental", "Langenthal-Oberaargau", "Jura bernois", "Mittelland", "Kanton Bern", "Schweiz". Leite die Region aus dem Artikelinhalt ab. Falls kein klarer regionaler Bezug innerhalb des Kantons Bern erkennbar ist, verwende "Schweiz". Falls der Artikel den gesamten Kanton betrifft, verwende "Kanton Bern".
- summary: Zusammenfassung in 2–3 Sätzen auf Deutsch
- reason: Warum ist der Artikel politisch relevant und was könnte die Partei damit machen? Auf Deutsch.

WICHTIG: Verwende die gesamte Skala von 1–5. Eine 5 bedeutet aussergewöhnlich relevant/umsetzbar. Eine 1 bedeutet völlig irrelevant. Vermeide es, alles mit 3 zu bewerten.
WICHTIG: Analysiere zuerst, ob der Artikel überhaupt einen Schweiz- resp. bei einen Kanton-Bern-Bezug hat. Gerade bei aussenpolitischen Meldungen relevant. Falls nicht, stoppe deine Analyse und gehe zum nächsten. Kein Schweiz-Bezug beeutet sofort Actionability und Opportunity = 0.

Antworte ausschliesslich mit validem JSON in diesem Format:
{"relevance": number, "actionability": number, "sentiment": string, "urgency": string, "policy_area": string, "region": string, "summary": string, "reason": string}`

  try {
    console.log('[scoreArticle] Calling Gemini...')
    const result = await model.generateContent(prompt)
    const raw = result.response.text()
    console.log(`[scoreArticle] Gemini raw response (${raw.length} chars):`, raw.slice(0, 500))

    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.error('[scoreArticle] No JSON found in Gemini response')
      return null
    }

    const parsed = JSON.parse(jsonMatch[0])
    console.log('[scoreArticle] Parsed JSON:', JSON.stringify(parsed).slice(0, 300))

    // Validate required fields
    if (
      typeof parsed.relevance !== 'number' ||
      typeof parsed.actionability !== 'number' ||
      typeof parsed.sentiment !== 'string' ||
      typeof parsed.urgency !== 'string' ||
      typeof parsed.policy_area !== 'string' ||
      typeof parsed.region !== 'string' ||
      typeof parsed.summary !== 'string' ||
      typeof parsed.reason !== 'string'
    ) {
      console.error('[scoreArticle] Validation failed — missing or wrong-typed fields:', {
        relevance: typeof parsed.relevance,
        actionability: typeof parsed.actionability,
        sentiment: typeof parsed.sentiment,
        urgency: typeof parsed.urgency,
        policy_area: typeof parsed.policy_area,
        region: typeof parsed.region,
        summary: typeof parsed.summary,
        reason: typeof parsed.reason,
      })
      return null
    }

    return parsed
  } catch (err) {
    console.error('[scoreArticle] Error:', err instanceof Error ? err.message : String(err))
    return null
  }
}
