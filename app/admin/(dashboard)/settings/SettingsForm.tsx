'use client'

import { useState } from 'react'
import { saveSettings } from './actions'

export default function SettingsForm({
  settings,
}: {
  settings: Record<string, string>
}) {
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setMessage(null)
    setPending(true)
    const formData = new FormData(e.currentTarget)
    const result = await saveSettings(formData)
    if (result.error) {
      setMessage({ type: 'error', text: result.error })
    } else {
      setMessage({ type: 'success', text: 'Einstellungen gespeichert.' })
    }
    setPending(false)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Relevance threshold */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div className="space-y-1">
          <label htmlFor="relevance_threshold" className="block text-sm font-medium text-gray-700">
            Relevanz-Schwellenwert
          </label>
          <input
            id="relevance_threshold"
            name="relevance_threshold"
            type="number"
            min={1}
            max={5}
            required
            defaultValue={settings.relevance_threshold ?? '3'}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <p className="text-xs text-gray-500">Artikel mit Relevanz unter diesem Wert werden ignoriert (1–5).</p>
        </div>

        {/* Actionability threshold */}
        <div className="space-y-1">
          <label htmlFor="actionability_threshold" className="block text-sm font-medium text-gray-700">
            Umsetzbarkeits-Schwellenwert
          </label>
          <input
            id="actionability_threshold"
            name="actionability_threshold"
            type="number"
            min={1}
            max={5}
            required
            defaultValue={settings.actionability_threshold ?? '3'}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <p className="text-xs text-gray-500">Artikel mit Umsetzbarkeit unter diesem Wert werden ignoriert (1–5).</p>
        </div>
      </div>

      {/* Lookback days */}
        <div className="space-y-1">
          <label htmlFor="lookback_days" className="block text-sm font-medium text-gray-700">
            Rückblickfenster (Tage)
          </label>
          <input
            id="lookback_days"
            name="lookback_days"
            type="number"
            min={1}
            max={30}
            required
            defaultValue={settings.lookback_days ?? '4'}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <p className="text-xs text-gray-500">Artikel älter als diese Anzahl Tage werden beim Cron-Lauf ignoriert.</p>
        </div>

      {/* Policy areas */}
      <div className="space-y-1">
        <label htmlFor="policy_areas" className="block text-sm font-medium text-gray-700">
          Politikbereiche
        </label>
        <input
          id="policy_areas"
          name="policy_areas"
          type="text"
          required
          defaultValue={settings.policy_areas ?? ''}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <p className="text-xs text-gray-500">Kommagetrennte Liste (z. B. Wohnen,Verkehr,Klima,Soziales).</p>
      </div>

      {/* Policy context */}
      <div className="space-y-1">
        <label htmlFor="policy_context" className="block text-sm font-medium text-gray-700">
          Politischer Kontext (Prompt)
        </label>
        <textarea
          id="policy_context"
          name="policy_context"
          rows={20}
          required
          defaultValue={settings.policy_context ?? ''}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 font-mono leading-relaxed focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <p className="text-xs text-gray-500">Dieser Text wird dem AI-Modell als Kontext mitgegeben, um Artikel zu bewerten.</p>
      </div>

      {/* Submit */}
      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {pending ? 'Speichern…' : 'Speichern'}
        </button>
        {message && (
          <p className={`text-sm ${message.type === 'error' ? 'text-red-600' : 'text-green-600'}`}>
            {message.text}
          </p>
        )}
      </div>
    </form>
  )
}
