import { createClient } from '@/lib/supabase/server'
import SettingsForm from './SettingsForm'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: rows, error } = await supabase.from('admin_settings').select('*')

  if (error) {
    return (
      <p className="text-sm text-red-600">
        Fehler beim Laden der Einstellungen: {error.message}
      </p>
    )
  }

  const settings: Record<string, string> = {}
  for (const row of rows ?? []) {
    settings[row.key] = row.value
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">Einstellungen</h1>
        <p className="mt-1 text-sm text-gray-500">
          Schwellenwerte, Politikbereiche und Kontext für die AI-Bewertung.
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <SettingsForm settings={settings} />
      </div>
    </div>
  )
}
