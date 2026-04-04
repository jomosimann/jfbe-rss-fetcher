'use client'

import { useState, useMemo } from 'react'

interface Article {
  guid: string
  feed_id: string
  outlet_name: string
  title: string
  url: string
  relevance: number
  actionability: number
  sentiment: string
  urgency: string
  policy_area: string
  region: string | null
  summary: string
  reason: string
  published_at: string | null
  seen_at: string
}

const SENTIMENT_LABELS: Record<string, string> = {
  opportunity: 'Chance',
  threat: 'Risiko',
  neutral: 'Neutral',
}

const URGENCY_LABELS: Record<string, string> = {
  'this week': 'Diese Woche',
  'this month': 'Dieser Monat',
  background: 'Hintergrund',
}

function sentimentStyle(s: string) {
  switch (s) {
    case 'opportunity':
      return 'bg-green-100 text-green-700'
    case 'threat':
      return 'bg-red-100 text-red-700'
    default:
      return 'bg-gray-100 text-gray-600'
  }
}

function urgencyStyle(u: string) {
  switch (u) {
    case 'this week':
      return 'bg-orange-100 text-orange-700'
    case 'this month':
      return 'bg-blue-100 text-blue-700'
    default:
      return 'bg-gray-100 text-gray-600'
  }
}

export default function ArticleList({ articles }: { articles: Article[] }) {
  const [outlet, setOutlet] = useState('')
  const [sentiment, setSentiment] = useState('')
  const [urgency, setUrgency] = useState('')
  const [region, setRegion] = useState('')
  const [minRelevance, setMinRelevance] = useState(1)
  const [minActionability, setMinActionability] = useState(1)

  const outlets = useMemo(
    () => [...new Set(articles.map((a) => a.outlet_name))].sort(),
    [articles]
  )

  const filtered = useMemo(() => {
    return articles.filter((a) => {
      if (outlet && a.outlet_name !== outlet) return false
      if (sentiment && a.sentiment !== sentiment) return false
      if (urgency && a.urgency !== urgency) return false
      if (region && a.region !== region) return false
      if (a.relevance < minRelevance) return false
      if (a.actionability < minActionability) return false
      return true
    })
  }, [articles, outlet, sentiment, urgency, region, minRelevance, minActionability])

  return (
    <>
      {/* Filters */}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1">
            <label className="block text-xs font-medium text-gray-500">Quelle</label>
            <select
              value={outlet}
              onChange={(e) => setOutlet(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">Alle</option>
              {outlets.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-medium text-gray-500">Sentiment</label>
            <select
              value={sentiment}
              onChange={(e) => setSentiment(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">Alle</option>
              <option value="opportunity">Chance</option>
              <option value="threat">Risiko</option>
              <option value="neutral">Neutral</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-medium text-gray-500">Dringlichkeit</label>
            <select
              value={urgency}
              onChange={(e) => setUrgency(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">Alle</option>
              <option value="this week">Diese Woche</option>
              <option value="this month">Dieser Monat</option>
              <option value="background">Hintergrund</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-medium text-gray-500">Region</label>
            <select
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">Alle</option>
              <option value="Bern Stadt">Bern Stadt</option>
              <option value="Thun und Umgebung">Thun und Umgebung</option>
              <option value="Berner Oberland">Berner Oberland</option>
              <option value="Seeland">Seeland</option>
              <option value="Biel/Bienne">Biel/Bienne</option>
              <option value="Burgdorf/Emmental">Burgdorf/Emmental</option>
              <option value="Langenthal-Oberaargau">Langenthal-Oberaargau</option>
              <option value="Jura bernois">Jura bernois</option>
              <option value="Mittelland">Mittelland</option>
              <option value="Kanton Bern">Kanton Bern</option>
              <option value="Schweiz">Schweiz</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-medium text-gray-500">
              Min. Relevanz
            </label>
            <select
              value={minRelevance}
              onChange={(e) => setMinRelevance(Number(e.target.value))}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}+
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-medium text-gray-500">
              Min. Umsetzbarkeit
            </label>
            <select
              value={minActionability}
              onChange={(e) => setMinActionability(Number(e.target.value))}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}+
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Results count */}
      <p className="text-sm text-gray-500">
        {filtered.length} {filtered.length === 1 ? 'Artikel' : 'Artikel'} gefunden
      </p>

      {/* Article cards */}
      {filtered.length === 0 ? (
        <p className="text-sm text-gray-500">
          Keine Artikel gefunden. Passe die Filter an oder warte auf den nächsten Abruf.
        </p>
      ) : (
        <div className="space-y-4">
          {filtered.map((a) => (
            <div
              key={a.guid}
              className="rounded-xl border border-gray-200 bg-white p-5 space-y-3"
            >
              {/* Header row */}
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="space-y-1 min-w-0 flex-1">
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-semibold text-gray-900 hover:text-blue-600 hover:underline"
                  >
                    {a.title}
                  </a>
                  <p className="text-xs text-gray-500">{a.outlet_name}</p>
                </div>

                <div className="flex shrink-0 gap-2">
                  <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                    {a.policy_area}
                  </span>
                  {a.region && (
                    <span className="rounded-full bg-purple-50 px-2.5 py-0.5 text-xs font-medium text-purple-700">
                      {a.region}
                    </span>
                  )}
                </div>
              </div>

              {/* Badges */}
              <div className="flex flex-wrap gap-2">
                <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-gray-100 text-gray-700">
                  Relevanz {a.relevance}/5
                </span>
                <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-gray-100 text-gray-700">
                  Umsetzbarkeit {a.actionability}/5
                </span>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${sentimentStyle(a.sentiment)}`}
                >
                  {SENTIMENT_LABELS[a.sentiment] ?? a.sentiment}
                </span>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${urgencyStyle(a.urgency)}`}
                >
                  {URGENCY_LABELS[a.urgency] ?? a.urgency}
                </span>
              </div>

              {/* Summary & Reason */}
              <p className="text-sm text-gray-700">{a.summary}</p>
              <p className="text-sm text-gray-500 italic">{a.reason}</p>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
