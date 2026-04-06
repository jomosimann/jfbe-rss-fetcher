'use client'

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
  const d = getNextFetch7UTC()
  const day = DAYS_DE[d.getUTCDay()]
  const date = String(d.getUTCDate()).padStart(2, '0')
  const month = MONTHS_DE[d.getUTCMonth()]
  const year = d.getUTCFullYear()

  return (
    <p className="text-xs text-gray-400">
      Nächster Abruf: {day}, {date}. {month} {year} um 07:00 UTC
    </p>
  )
}
