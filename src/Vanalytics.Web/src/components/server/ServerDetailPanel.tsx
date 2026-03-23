import { useState, useEffect, useRef, useMemo } from 'react'
import { X } from 'lucide-react'
import { api, ApiError } from '../../api/client'
import type { ServerHistory } from '../../types/api'
import UptimeTrendChart from './UptimeTrendChart'
import StatusTimeline from './StatusTimeline'

const TIME_RANGES = [
  { label: '24h', days: 1 },
  { label: '48h', days: 2 },
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
  { label: '365d', days: 365 },
  { label: 'All', days: 0 },
]

const PAGE_SIZE = 10

const statusColors: Record<string, string> = {
  Online: 'bg-green-500',
  Offline: 'bg-red-500',
  Maintenance: 'bg-amber-500',
  Unknown: 'bg-gray-500',
}

const statusTextColors: Record<string, string> = {
  Online: 'bg-green-900/50 text-green-400',
  Offline: 'bg-red-900/50 text-red-400',
  Maintenance: 'bg-amber-900/50 text-amber-400',
  Unknown: 'bg-gray-900/50 text-gray-400',
}

function formatDuration(start: string, end: string | null): string {
  const ms = (end ? new Date(end).getTime() : Date.now()) - new Date(start).getTime()
  const totalMinutes = Math.floor(ms / 60000)
  const d = Math.floor(totalMinutes / 1440)
  const h = Math.floor((totalMinutes % 1440) / 60)
  const m = totalMinutes % 60
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

interface Props {
  serverName: string
  initialDays: number
  onClose: () => void
}

export default function ServerDetailPanel({ serverName, initialDays, onClose }: Props) {
  const [days, setDays] = useState(initialDays)
  const [history, setHistory] = useState<ServerHistory | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('All')
  const [page, setPage] = useState(1)
  const panelRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  // Fetch data
  useEffect(() => {
    setLoading(true)
    setError('')
    api<ServerHistory>(`/api/servers/${encodeURIComponent(serverName)}/history?days=${days}`)
      .then(setHistory)
      .catch(err => {
        if (err instanceof ApiError) setError(err.status === 404 ? 'Server not found' : `Error (${err.status})`)
        else setError('Failed to load server history')
      })
      .finally(() => setLoading(false))
  }, [serverName, days])

  // Focus trap and escape handler
  useEffect(() => {
    closeButtonRef.current?.focus()

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key === 'Tab' && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
        if (focusable.length === 0) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = ''
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  // Event log filtering and pagination
  const filtered = useMemo(() => {
    if (!history) return []
    return statusFilter === 'All'
      ? history.history
      : history.history.filter(e => e.status === statusFilter)
  }, [history, statusFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-40 bg-black/60 transition-opacity duration-300"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`${serverName} server details`}
        className="fixed inset-y-0 right-0 z-50 w-full sm:w-[50vw] sm:min-w-[400px] bg-gray-950 border-l border-gray-800 shadow-2xl transform transition-transform duration-300 ease-out overflow-y-auto"
      >
        <div className="p-6 space-y-5">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-100">{serverName}</h2>
              {history && (
                <p className="text-sm text-gray-500 mt-0.5">
                  <span className={`inline-block h-2 w-2 rounded-full mr-1 ${statusColors[history.status] ?? 'bg-gray-500'}`} />
                  {history.status} — {history.uptimePercent}% uptime
                </p>
              )}
            </div>
            <button
              ref={closeButtonRef}
              onClick={onClose}
              className="text-gray-400 hover:text-gray-200 p-1 rounded hover:bg-gray-800 transition-colors"
              aria-label="Close panel"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Time range selector */}
          <div className="flex gap-1 rounded-lg bg-gray-900 p-1 border border-gray-800">
            {TIME_RANGES.map(r => (
              <button
                key={r.days}
                onClick={() => { setDays(r.days); setPage(1) }}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  days === r.days ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>

          {/* Loading state */}
          {loading && !history && (
            <div className="flex items-center justify-center py-16">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            </div>
          )}

          {/* Error state */}
          {error && !history && (
            <p className="text-center text-red-400 py-10 text-sm">{error}</p>
          )}

          {/* Content */}
          {history && (
            <>
              {/* Uptime trend chart */}
              <div>
                <h3 className="text-xs uppercase text-gray-500 mb-2">Uptime Trend</h3>
                {history.uptimeTrend && history.uptimeTrend.length > 0
                  ? <UptimeTrendChart data={history.uptimeTrend} height={200} />
                  : <p className="text-gray-500 text-sm py-6 text-center">No trend data available</p>
                }
              </div>

              {/* Status timeline */}
              <div>
                <h3 className="text-xs uppercase text-gray-500 mb-2">Status Timeline</h3>
                <StatusTimeline history={history.history} days={days} />
              </div>

              {/* Event log */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs uppercase text-gray-500">Event Log</h3>
                  <div className="flex gap-1">
                    {['All', 'Online', 'Offline', 'Maintenance'].map(s => (
                      <button
                        key={s}
                        onClick={() => { setStatusFilter(s); setPage(1) }}
                        className={`rounded px-2 py-0.5 text-xs font-medium transition-colors ${
                          statusFilter === s ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-500 text-xs uppercase border-b border-gray-800">
                        <th className="pb-2 pr-4">Status</th>
                        <th className="pb-2 pr-4">Started</th>
                        <th className="pb-2 pr-4">Ended</th>
                        <th className="pb-2">Duration</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageItems.map((entry, i) => (
                        <tr key={i} className="border-b border-gray-800/50">
                          <td className="py-2 pr-4">
                            <span className={`rounded px-2 py-0.5 text-xs ${statusTextColors[entry.status] ?? 'bg-gray-900/50 text-gray-400'}`}>
                              {entry.status}
                            </span>
                          </td>
                          <td className="py-2 pr-4 text-gray-400 text-xs">{new Date(entry.startedAt).toLocaleString()}</td>
                          <td className="py-2 pr-4 text-gray-400 text-xs">{entry.endedAt ? new Date(entry.endedAt).toLocaleString() : <span className="text-blue-400">Current</span>}</td>
                          <td className="py-2 text-gray-400 text-xs">{formatDuration(entry.startedAt, entry.endedAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
                    <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="hover:text-gray-200 disabled:opacity-30">← Prev</button>
                    <span>Page {page} of {totalPages}</span>
                    <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="hover:text-gray-200 disabled:opacity-30">Next →</button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}
