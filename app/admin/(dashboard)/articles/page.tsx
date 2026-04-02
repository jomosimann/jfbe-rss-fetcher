import { createClient } from '@/lib/supabase/server'
import ArticleList from './ArticleList'
import NextFetch from './NextFetch'

export default async function ArticlesPage() {
  const supabase = await createClient()

  const { data: articles, error } = await supabase
    .from('rss_seen_items')
    .select('*')
    .order('policy_area')
    .order('seen_at', { ascending: false })

  if (error) {
    return (
      <p className="text-sm text-red-600">
        Fehler beim Laden der Artikel: {error.message}
      </p>
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">Artikel</h1>
        <p className="mt-1 text-sm text-gray-500">
          Bewertete Artikel aus allen aktiven Feeds, sortiert nach Politikbereich.
        </p>
        <NextFetch />
      </div>

      <ArticleList articles={articles ?? []} />
    </div>
  )
}
