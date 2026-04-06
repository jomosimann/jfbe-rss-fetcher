'use server'

import { revalidatePath } from 'next/cache'

export async function triggerCronFetch(): Promise<{ error?: string; result?: { processed: number; saved: number } }> {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_URL
  const url = baseUrl
    ? `${baseUrl.startsWith('http') ? baseUrl : `https://${baseUrl}`}/api/cron/rss`
    : 'http://localhost:3000/api/cron/rss'

  const secret = process.env.CRON_SECRET
  if (!secret) {
    return { error: 'CRON_SECRET ist nicht konfiguriert.' }
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}` },
    })

    if (!res.ok) {
      const body = await res.text()
      return { error: `Fehler ${res.status}: ${body}` }
    }

    const data = await res.json()
    revalidatePath('/admin/articles')
    return { result: { processed: data.processed, saved: data.saved } }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}
