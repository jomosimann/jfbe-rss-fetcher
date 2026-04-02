'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function saveSettings(formData: FormData) {
  const supabase = await createClient()

  const entries = [
    { key: 'policy_context', value: formData.get('policy_context') as string },
    { key: 'policy_areas', value: formData.get('policy_areas') as string },
    { key: 'relevance_threshold', value: formData.get('relevance_threshold') as string },
    { key: 'actionability_threshold', value: formData.get('actionability_threshold') as string },
  ]

  for (const { key, value } of entries) {
    const { error } = await supabase
      .from('admin_settings')
      .update({ value })
      .eq('key', key)

    if (error) return { error: `Fehler beim Speichern von «${key}»: ${error.message}` }
  }

  revalidatePath('/admin/settings')
  return { success: true }
}
