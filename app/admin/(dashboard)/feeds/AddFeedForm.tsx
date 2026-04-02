'use client'

import { useState } from 'react'
import { addFeed } from './actions'

export default function AddFeedForm() {
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setPending(true)
    const formData = new FormData(e.currentTarget)
    const result = await addFeed(formData)
    if (result?.error) {
      setError(result.error)
      setPending(false)
    } else {
      ;(e.target as HTMLFormElement).reset()
      setPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor="outlet_name" className="text-xs font-medium text-gray-600">
          Quellname
        </label>
        <input
          id="outlet_name"
          name="outlet_name"
          type="text"
          required
          placeholder="z. B. NZZ"
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 w-48"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="url" className="text-xs font-medium text-gray-600">
          Feed-URL
        </label>
        <input
          id="url"
          name="url"
          type="url"
          required
          placeholder="https://…/feed.xml"
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 w-80"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
      >
        {pending ? 'Hinzufügen…' : 'Hinzufügen'}
      </button>
      {error && <p className="w-full text-sm text-red-600">{error}</p>}
    </form>
  )
}
