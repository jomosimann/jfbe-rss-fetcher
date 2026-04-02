'use client'

const DAYS_DE = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag']
const MONTHS_DE = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
]

function getNextMonday7UTC(): Date {
  const now = new Date()
  const day = now.getUTCDay() // 0=Sun, 1=Mon
  let daysUntilMonday = (1 - day + 7) % 7
  // If it's Monday but already past 07:00 UTC, skip to next week
  if (daysUntilMonday === 0) {
    const pastCutoff = now.getUTCHours() > 7 || (now.getUTCHours() === 7 && now.getUTCMinutes() > 0)
    if (pastCutoff) daysUntilMonday = 7
  }
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysUntilMonday, 7, 0, 0))
  return next
}

export default function NextFetch() {
  const d = getNextMonday7UTC()
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
