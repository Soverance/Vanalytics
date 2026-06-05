import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'

function relativeTime(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 5) return 'just now'
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

interface Props {
  saving: boolean
  savedAt: number | null
  /** True after a draft was restored, until the user makes a fresh edit. */
  restored: boolean
  onDiscard: () => void
}

export default function DraftStatus({ saving, savedAt, restored, onDiscard }: Props) {
  const [, tick] = useState(0)

  // Keep the "x ago" label fresh while a saved draft is shown.
  useEffect(() => {
    if (savedAt === null) return
    const id = setInterval(() => tick(n => n + 1), 30000)
    return () => clearInterval(id)
  }, [savedAt])

  if (!saving && savedAt === null) return null

  let label = ''
  if (saving) label = 'Saving…'
  else if (savedAt !== null) label = `${restored ? 'Draft restored' : 'Draft saved'} · ${relativeTime(savedAt)}`

  return (
    <div className="flex items-center gap-2 text-xs text-gray-600">
      <span>{label}</span>
      {savedAt !== null && (
        <button
          type="button"
          onClick={onDiscard}
          className="ml-auto inline-flex items-center gap-1 hover:text-red-400 transition-colors"
          title="Discard draft"
        >
          <Trash2 className="h-3 w-3" /> Discard
        </button>
      )}
    </div>
  )
}
