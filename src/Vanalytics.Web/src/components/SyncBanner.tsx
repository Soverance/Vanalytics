import { useState, useEffect } from 'react'
import { useSyncProgress } from '../context/SyncContext'
import { Loader2 } from 'lucide-react'

export default function SyncBanner() {
  const { progress } = useSyncProgress()
  const [syncActive, setSyncActive] = useState(false)

  // Check if the admin who started the sync has live progress in context
  const liveProgress = Object.values(progress).find(
    p => p && p.type !== 'Completed' && p.type !== 'Cancelled' && p.type !== 'Failed'
  )

  // Poll the public endpoint so ALL users see the banner, not just the admin
  useEffect(() => {
    let cancelled = false

    const poll = async () => {
      while (!cancelled) {
        try {
          const res = await fetch('/api/sync/active')
          if (cancelled) break
          if (res.ok) {
            const data = await res.json()
            setSyncActive(data.syncing)
          }
        } catch {
          // silent
        }
        await new Promise(r => setTimeout(r, 10_000))
      }
    }
    poll()

    return () => { cancelled = true }
  }, [])

  // Show banner if either: we have live progress from context, or the API says a sync is running
  const show = liveProgress || syncActive

  if (!show) return null

  const pct = liveProgress && liveProgress.total > 0
    ? Math.min(100, Math.round((liveProgress.current / liveProgress.total) * 100))
    : null

  return (
    <div className="bg-blue-950/80 border-b border-blue-800/50 px-4 py-1.5 flex items-center justify-center gap-3 text-xs text-blue-300">
      <Loader2 className="h-3 w-3 animate-spin shrink-0" />
      <span>
        Data sync in progress
        {pct != null && <> — {pct}%</>}
      </span>
      <span className="text-blue-500/50">Performance may be temporarily degraded.</span>
    </div>
  )
}
