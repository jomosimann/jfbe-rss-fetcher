'use client'

import { useState } from 'react'
import { triggerCronFetch } from './actions'

const DAYS_DE = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag']
const MONTHS_DE = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
]

function getNextFetch7UTC(): Date {
  const now = new Date()
  const day = now.getUTCDay() // 0=Sun, 1=Mon, ..., 4=Thu
  const pastCutoff = now.getUTCHours() > 7 || (now.getUTCHours() === 7 && now.getUTCMinutes() > 0)

  // Cron runs Monday (1) and Thursday (4) at 07:00 UTC
  // Find the smallest daysUntil from both schedule days
  let best = 8
  for (const target of [1, 4]) {
    let diff = (target - day + 7) % 7
    if (diff === 0 && pastCutoff) diff = 7
    if (diff < best) best = diff
  }

  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + best, 7, 0, 0))
}

export default function NextFetch() {
  const [running, setRunning] = useState(false)
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null)

  const d = getNextFetch7UTC()
  const day = DAYS_DE[d.getUTCDay()]
  const date = String(d.getUTCDate()).padStart(2, '0')
  const month = MONTHS_DE[d.getUTCMonth()]
  const year = d.getUTCFullYear()

  async function handleTrigger() {
    setMessage(null)
    setRunning(true)
    const res = await triggerCronFetch()
    if (res.error) {
      setMessage({ type: 'error', text: res.error })
    } else {
      setMessage({ type: 'success', text: `Fertig: ${res.result!.processed} verarbeitet, ${res.result!.saved} gespeichert.` })
    }
    setRunning(false)
  }

  return (
    <div className="flex flex-wrap items-center gap-3 mt-1">
      <p className="text-xs text-gray-400">
        Nächster Abruf: {day}, {date}. {month} {year} um 07:00 UTC
      </p>
      <button
        onClick={handleTrigger}
        disabled={running}
        className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
      >
        {running ? 'Läuft…' : 'Fetch jetzt starten'}
      </button>
      {message && (
        <p className={`text-xs ${message.type === 'error' ? 'text-red-600' : 'text-green-600'}`}>
          {message.text}
        </p>
      )}
    </div>
  )
}
