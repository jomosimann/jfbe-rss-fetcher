'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function addFeed(formData: FormData) {
  const supabase = await createClient()
  const outlet_name = (formData.get('outlet_name') as string).trim()
  const url = (formData.get('url') as string).trim()

  if (!outlet_name || !url) return { error: 'Bitte alle Felder ausfüllen.' }

  const { error } = await supabase
    .from('rss_feeds')
    .insert({ outlet_name, url })

  if (error) {
    if (error.code === '23505') return { error: 'Diese URL ist bereits vorhanden.' }
    return { error: 'Fehler beim Hinzufügen des Feeds.' }
  }

  revalidatePath('/admin/feeds')
}

export async function toggleFeed(formData: FormData) {
  const supabase = await createClient()
  const id = formData.get('id') as string
  const active = formData.get('active') === 'true'

  await supabase
    .from('rss_feeds')
    .update({ active: !active })
    .eq('id', id)

  revalidatePath('/admin/feeds')
}

export async function deleteFeed(formData: FormData) {
  const supabase = await createClient()
  const id = formData.get('id') as string

  await supabase
    .from('rss_feeds')
    .delete()
    .eq('id', id)

  revalidatePath('/admin/feeds')
}
