import { useState, useEffect, useMemo } from 'react'
import { api, ApiError } from '../api/client'
import type { GameServer, ServerHistory } from '../types/api'

const statusStyles: Record<string, string> = {
  Online: 'bg-green-900/50 text-green-400',
  Offline: 'bg-red-900/50 text-red-400',
  Maintenance: 'bg-amber-900/50 text-amber-400',
  Unknown: 'bg-gray-800 text-gray-500',
}

const statusDot: Record<string, string> = {
  Online: 'bg-green-400',
  Offline: 'bg-red-400',
  Maintenance: 'bg-amber-400',
  Unknown: 'bg-gray-500',
}

const timelineColors: Record<string, string> = {
  Online: 'bg-green-500',
  Offline: 'bg-red-500',
  Maintenance: 'bg-amber-500',
  Unknown: 'bg-gray-600',
}

function StatusTimeline({ history, days }: { history: ServerHistory; days: number }) {
  const now = new Date()
  const rangeStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
  const totalMs = now.getTime() - rangeStart.getTime()

  // Build segments from history entries, clipped to the visible range
  const segments: { status: string; startPct: number; widthPct: number }[] = []

  // Sort chronologically
  const sorted = [...history.history].sort(
    (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()
  )

  for (const entry of sorted) {
    const entryStart = new Date(entry.startedAt)
    const entryEnd = entry.endedAt ? new Date(entry.endedAt) : now

    // Clip to visible range
    const visStart = Math.max(entryStart.getTime(), rangeStart.getTime())
    const visEnd = Math.min(entryEnd.getTime(), now.getTime())

    if (visEnd <= visStart) continue

    const startPct = ((visStart - rangeStart.getTime()) / totalMs) * 100
    const widthPct = ((visEnd - visStart) / totalMs) * 100

    segments.push({ status: entry.status, startPct, widthPct })
  }

  return (
    <div className="mb-6">
      {/* Timeline bar */}
      <div className="relative h-8 rounded bg-gray-800 overflow-hidden">
        {segments.map((seg, i) => (
          <div
            key={i}
            className={`absolute inset-y-0 ${timelineColors[seg.status] ?? timelineColors.Unknown}`}
            style={{ left: `${seg.startPct}%`, width: `${seg.widthPct}%` }}
            title={`${seg.status}`}
          />
        ))}
      </div>

      {/* Time labels */}
      <div className="flex justify-between mt-1.5 text-xs text-gray-600">
        <span>{rangeStart.toLocaleDateString()}</span>
        <span>Now</span>
      </div>

      {/* Legend */}
      <div className="flex gap-4 mt-2">
        {['Online', 'Maintenance', 'Offline'].map((s) => (
          <div key={s} className="flex items-center gap-1.5 text-xs text-gray-500">
            <span className={`h-2.5 w-2.5 rounded-sm ${timelineColors[s]}`} />
            {s}
          </div>
        ))}
      </div>
    </div>
  )
}

const PAGE_SIZE = 10

function EventLog({ entries }: { entries: ServerHistory['history'] }) {
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [page, setPage] = useState(1)

  // Reset to page 1 when filter changes
  useEffect(() => { setPage(1) }, [statusFilter])

  // Get unique statuses for filter buttons
  const statuses = useMemo(() => {
    const set = new Set(entries.map((e) => e.status))
    return Array.from(set)
  }, [entries])

  const filtered = useMemo(
    () => statusFilter === 'all' ? entries : entries.filter((e) => e.status === statusFilter),
    [entries, statusFilter]
  )

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageEntries = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  if (entries.length === 0) {
    return <p className="text-sm text-gray-500">No status changes recorded in this period.</p>
  }

  return (
    <div>
      {/* Filter bar */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex gap-1">
          <button
            onClick={() => setStatusFilter('all')}
            className={`rounded px-2.5 py-1 text-xs font-medium ${
              statusFilter === 'all'
                ? 'bg-gray-700 text-white'
                : 'bg-gray-800 text-gray-500 hover:bg-gray-700'
            }`}
          >
            All ({entries.length})
          </button>
          {statuses.map((s) => {
            const count = entries.filter((e) => e.status === s).length
            return (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`rounded px-2.5 py-1 text-xs font-medium ${
                  statusFilter === s
                    ? statusStyles[s] ?? statusStyles.Unknown
                    : 'bg-gray-800 text-gray-500 hover:bg-gray-700'
                }`}
              >
                {s} ({count})
              </button>
            )
          })}
        </div>
        <span className="text-xs text-gray-600">
          {filtered.length} event{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Table */}
      <div className="rounded border border-gray-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-800/50 text-left text-gray-500">
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium">Started</th>
              <th className="px-4 py-2.5 font-medium hidden sm:table-cell">Ended</th>
              <th className="px-4 py-2.5 font-medium">Duration</th>
            </tr>
          </thead>
          <tbody>
            {pageEntries.map((h, i) => (
              <tr key={i} className="border-t border-gray-800">
                <td className="px-4 py-2.5">
                  <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${statusStyles[h.status] ?? statusStyles.Unknown}`}>
                    {h.status}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-gray-400">
                  {new Date(h.startedAt).toLocaleString()}
                </td>
                <td className="px-4 py-2.5 text-gray-400 hidden sm:table-cell">
                  {h.endedAt ? new Date(h.endedAt).toLocaleString() : '—'}
                </td>
                <td className="px-4 py-2.5 text-gray-500">
                  {formatDuration(h.startedAt, h.endedAt)}
                  {!h.endedAt && <span className="text-green-500 ml-1">(current)</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-3">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="rounded px-3 py-1.5 text-xs font-medium bg-gray-800 text-gray-400 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <span className="text-xs text-gray-500">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="rounded px-3 py-1.5 text-xs font-medium bg-gray-800 text-gray-400 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}

function formatDuration(start: string, end: string | null) {
  const startDate = new Date(start)
  const endDate = end ? new Date(end) : new Date()
  const minutes = Math.floor((endDate.getTime() - startDate.getTime()) / 60000)

  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const remainMins = minutes % 60
  if (hours < 24) return `${hours}h ${remainMins}m`
  const days = Math.floor(hours / 24)
  const remainHrs = hours % 24
  return `${days}d ${remainHrs}h`
}

export default function ServerStatusPage() {
  const [servers, setServers] = useState<GameServer[]>([])
  const [selectedServer, setSelectedServer] = useState<string | null>(null)
  const [history, setHistory] = useState<ServerHistory | null>(null)
  const [loading, setLoading] = useState(true)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [error, setError] = useState('')
  const [historyDays, setHistoryDays] = useState(30)

  useEffect(() => {
    api<GameServer[]>('/api/servers')
      .then(setServers)
      .catch((err) => {
        if (err instanceof ApiError) setError(err.message)
        else setError('Failed to load servers')
      })
      .finally(() => setLoading(false))
  }, [])

  const loadHistory = async (name: string, days: number) => {
    setSelectedServer(name)
    setHistoryLoading(true)
    try {
      const data = await api<ServerHistory>(`/api/servers/${name}/history?days=${days}`)
      setHistory(data)
    } catch (err) {
      if (err instanceof ApiError) setError(err.message)
    } finally {
      setHistoryLoading(false)
    }
  }

  const handleDaysChange = (days: number) => {
    setHistoryDays(days)
    if (selectedServer) loadHistory(selectedServer, days)
  }

  if (loading) return <p className="text-gray-400">Loading server status...</p>

  const onlineCount = servers.filter(s => s.status === 'Online').length

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Server Status</h1>
      <p className="text-sm text-gray-500 mb-6">
        {onlineCount} of {servers.length} servers online
        {servers.length > 0 && servers[0].lastCheckedAt && (
          <> &middot; Last checked {new Date(servers[0].lastCheckedAt).toLocaleTimeString()}</>
        )}
      </p>

      {error && (
        <div className="mb-4 rounded bg-red-900/50 border border-red-700 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {servers.length === 0 ? (
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-6 text-center">
          <p className="text-gray-400">No server data available yet.</p>
          <p className="text-sm text-gray-600 mt-1">
            The server status scraper runs every 5 minutes. Data will appear after the first poll.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 mb-8">
          {servers.map((s) => (
            <button
              key={s.id}
              onClick={() => loadHistory(s.name, historyDays)}
              className={`rounded-lg border p-4 text-left transition-colors ${
                selectedServer === s.name
                  ? 'border-blue-600 bg-gray-900'
                  : 'border-gray-800 bg-gray-900 hover:border-gray-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">{s.name}</span>
                <span className="flex items-center gap-1.5">
                  <span className={`h-2 w-2 rounded-full ${statusDot[s.status] ?? statusDot.Unknown}`} />
                  <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${statusStyles[s.status] ?? statusStyles.Unknown}`}>
                    {s.status}
                  </span>
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* History panel */}
      {selectedServer && (
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">{selectedServer} — Status History</h2>
            <div className="flex gap-1">
              {[7, 30, 90, 365].map((d) => (
                <button
                  key={d}
                  onClick={() => handleDaysChange(d)}
                  className={`rounded px-2.5 py-1 text-xs font-medium ${
                    historyDays === d
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  {d}d
                </button>
              ))}
            </div>
          </div>

          {historyLoading ? (
            <p className="text-gray-400 text-sm">Loading history...</p>
          ) : history ? (
            <>
              <div className="mb-4 flex items-baseline gap-3">
                <span className="text-3xl font-bold text-green-400">{history.uptimePercent}%</span>
                <span className="text-sm text-gray-500">uptime over {history.days} days</span>
              </div>

              {history.history.length > 0 && (
                <StatusTimeline history={history} days={historyDays} />
              )}

              <EventLog entries={history.history} />
            </>
          ) : null}
        </div>
      )}
    </div>
  )
}
