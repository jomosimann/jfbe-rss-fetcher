import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import Parser from 'rss-parser'
import * as cheerio from 'cheerio'
import { GoogleGenerativeAI } from '@google/generative-ai'

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
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

  let totalProcessed = 0
  let totalSaved = 0

  for (const feed of feeds) {
    let feedError: string | null = null
    console.log(`[cron/rss] --- Processing feed: "${feed.outlet_name}" (${feed.url}) ---`)

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

      console.log(`[cron/rss] [${feed.outlet_name}] New items to process: ${newItems.length}`)

      for (const item of newItems) {
        const guid = item.guid || item.link || ''
        const articleUrl = item.link || ''
        console.log(`[cron/rss] [${feed.outlet_name}] Processing item: "${item.title}" (guid: ${guid})`)

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

        // --- Score with Gemini ---
        console.log(`[cron/rss] [${feed.outlet_name}] Sending to Gemini (${articleText.slice(0, 12_000).length} chars)...`)
        const score = await scoreArticle(model, articleText, policyContext, policyAreas)

        if (!score) {
          console.log(`[cron/rss] [${feed.outlet_name}] SKIPPED (Gemini returned null): "${item.title}"`)
          continue
        }

        console.log(`[cron/rss] [${feed.outlet_name}] Gemini score:`, {
          title: item.title,
          relevance: score.relevance,
          actionability: score.actionability,
          sentiment: score.sentiment,
          urgency: score.urgency,
          policy_area: score.policy_area,
        })

        totalProcessed++

        // --- Threshold check ---
        if (score.relevance >= relevanceThreshold && score.actionability >= actionabilityThreshold) {
          console.log(`[cron/rss] [${feed.outlet_name}] ABOVE THRESHOLD — inserting into rss_seen_items`)
          const { error: insertError } = await supabase
            .from('rss_seen_items')
            .insert({
              guid,
              feed_id: feed.id,
              outlet_name: feed.outlet_name,
              title: item.title ?? '',
              url: articleUrl,
              relevance: score.relevance,
              actionability: score.actionability,
              sentiment: score.sentiment,
              urgency: score.urgency,
              policy_area: score.policy_area,
              summary: score.summary,
              reason: score.reason,
              published_at: item.isoDate || item.pubDate || null,
            })

          if (insertError) {
            console.error(`[cron/rss] [${feed.outlet_name}] INSERT ERROR:`, insertError.message)
          } else {
            console.log(`[cron/rss] [${feed.outlet_name}] SAVED: "${item.title}"`)
            totalSaved++
          }
        } else {
          console.log(`[cron/rss] [${feed.outlet_name}] BELOW THRESHOLD — not saving (relevance=${score.relevance}, actionability=${score.actionability})`)
        }
      }
    } catch (err) {
      feedError = err instanceof Error ? err.message : String(err)
      console.error(`[cron/rss] [${feed.outlet_name}] FEED ERROR:`, feedError)
    }

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

  console.log(`[cron/rss] DONE. Processed: ${totalProcessed}, Saved: ${totalSaved}`)
  return NextResponse.json({ processed: totalProcessed, saved: totalSaved })
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
    const $ = cheerio.load(html)

    // Remove non-content elements
    $('script, style, nav, header, footer, aside, .ad, .advertisement, .sidebar').remove()

    // Try common article selectors
    const selectors = ['article', '[role="main"]', '.article-body', '.story-body', '.post-content', 'main']
    for (const sel of selectors) {
      const text = $(sel).text().trim()
      if (text.length >= 500) {
        console.log(`[fetchArticleBody] Matched selector "${sel}": ${text.length} chars`)
        return text
      }
    }

    // Fallback: body text
    const bodyText = $('body').text().trim()
    console.log(`[fetchArticleBody] No selector matched, using body: ${bodyText.length} chars`)
    return bodyText
  } catch (err) {
    console.error(`[fetchArticleBody] Error fetching ${url}:`, err instanceof Error ? err.message : String(err))
    return ''
  }
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

BEWERTUNGSKRITERIEN:
- relevance (1–5): Wie eng berührt der Artikel die Politikbereiche der Partei?
- actionability (1–5): Gibt es einen konkreten Aufhänger (Abstimmung, Aussage, Statistik, gegnerische Position), auf den reagiert werden kann?
- sentiment: "opportunity" (stützt Parteiposition), "threat" (untergräbt sie) oder "neutral"
- urgency: "this week" (akut/dringend), "this month" (bevorstehend) oder "background" (Hintergrund)
- policy_area: Genau einer der oben genannten Politikbereiche
- summary: Zusammenfassung in 2–3 Sätzen auf Deutsch
- reason: Warum ist der Artikel politisch relevant und was könnte die Partei damit machen? Auf Deutsch.

WICHTIG: Verwende die gesamte Skala von 1–5. Eine 5 bedeutet aussergewöhnlich relevant/umsetzbar. Eine 1 bedeutet völlig irrelevant. Vermeide es, alles mit 3 zu bewerten.
WICHTIG: Analysiere zuerst, ob der Artikel überhaupt einen Schweiz- resp. bei Regionalmedien einen Kanton-Bern-Bezug hat. Gerade bei aussenpolitischen Meldungen relevant. Falls nicht, stoppe deine Analysee und gehe zum nächsten. Kein Schweiz-Bezug beeutet sofort Actionability und Opportunity = 0.

Antworte ausschliesslich mit validem JSON in diesem Format:
{"relevance": number, "actionability": number, "sentiment": string, "urgency": string, "policy_area": string, "summary": string, "reason": string}`

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
      typeof parsed.summary !== 'string' ||
      typeof parsed.reason !== 'string'
    ) {
      console.error('[scoreArticle] Validation failed — missing or wrong-typed fields:', {
        relevance: typeof parsed.relevance,
        actionability: typeof parsed.actionability,
        sentiment: typeof parsed.sentiment,
        urgency: typeof parsed.urgency,
        policy_area: typeof parsed.policy_area,
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
