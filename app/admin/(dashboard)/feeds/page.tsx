import { createClient } from '@/lib/supabase/server'
import { toggleFeed, deleteFeed } from './actions'
import AddFeedForm from './AddFeedForm'

function formatDate(ts: string | null): string {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('de-CH', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default async function FeedsPage() {
  const supabase = await createClient()
  const { data: feeds, error } = await supabase
    .from('rss_feeds')
    .select('*')
    .order('outlet_name')

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">RSS-Feeds</h1>
        <p className="mt-1 text-sm text-gray-500">
          Aktive Feeds werden wöchentlich abgerufen und bewertet.
        </p>
      </div>

      {/* Feed table */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        {error ? (
          <p className="p-6 text-sm text-red-600">
            Fehler beim Laden der Feeds: {error.message}
          </p>
        ) : !feeds || feeds.length === 0 ? (
          <p className="p-6 text-sm text-gray-500">Noch keine Feeds vorhanden.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                <th className="px-4 py-3">Quelle</th>
                <th className="px-4 py-3">URL</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Zuletzt abgerufen</th>
                <th className="px-4 py-3">Letzter Fehler</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {feeds.map((feed) => (
                <tr key={feed.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">
                    {feed.outlet_name}
                  </td>
                  <td className="px-4 py-3 text-gray-500 max-w-xs truncate">
                    <a
                      href={feed.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-blue-600 hover:underline"
                    >
                      {feed.url}
                    </a>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <form action={toggleFeed}>
                      <input type="hidden" name="id" value={feed.id} />
                      <input type="hidden" name="active" value={String(feed.active)} />
                      <button
                        type="submit"
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                          feed.active
                            ? 'bg-green-100 text-green-700 hover:bg-green-200'
                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            feed.active ? 'bg-green-500' : 'bg-gray-400'
                          }`}
                        />
                        {feed.active ? 'Aktiv' : 'Inaktiv'}
                      </button>
                    </form>
                  </td>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                    {formatDate(feed.last_fetched_at)}
                  </td>
                  <td className="px-4 py-3 text-red-500 max-w-xs truncate text-xs">
                    {feed.last_error ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <form action={deleteFeed}>
                      <input type="hidden" name="id" value={feed.id} />
                      <button
                        type="submit"
                        className="text-xs text-gray-400 hover:text-red-600 transition-colors"
                      >
                        Löschen
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add feed form */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-4">
        <h2 className="text-sm font-semibold text-gray-900">Feed hinzufügen</h2>
        <AddFeedForm />
      </div>
    </div>
  )
}
