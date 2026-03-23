import { useState, useEffect, useMemo } from 'react'
import { useParams, useSearchParams, Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { api, ApiError } from '../api/client'
import type { ServerHistory } from '../types/api'
import UptimeTrendChart from '../components/server/UptimeTrendChart'

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
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

export default function ServerDetailPage() {
  const { name } = useParams<{ name: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const daysParam = searchParams.get('days')
  const [days, setDays] = useState(daysParam ? Number(daysParam) : 30)
  const [history, setHistory] = useState<ServerHistory | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('All')
  const [page, setPage] = useState(1)

  useEffect(() => {
    if (!name) return
    setLoading(true)
    setError('')
    api<ServerHistory>(`/api/servers/${encodeURIComponent(name)}/history?days=${days}`)
      .then(setHistory)
      .catch(err => {
        if (err instanceof ApiError) setError(err.status === 404 ? 'Server not found' : `Error (${err.status})`)
        else setError('Failed to load server history')
      })
      .finally(() => setLoading(false))
  }, [name, days])

  const changeDays = (d: number) => {
    setDays(d)
    setSearchParams({ days: String(d) })
    setPage(1)
  }

  const filtered = useMemo(() => {
    if (!history) return []
    return statusFilter === 'All'
      ? history.history
      : history.history.filter(e => e.status === statusFilter)
  }, [history, statusFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  if (loading && !history) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    )
  }

  if (error) return <p className="text-center text-red-400 py-20">{error}</p>
  if (!history) return null

  // Timeline bar computation
  const now = Date.now()
  const rangeStart = days === 0
    ? Math.min(...history.history.map(h => new Date(h.startedAt).getTime()), now)
    : now - days * 86400000
  const totalMs = now - rangeStart

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to={`/server/status?days=${days}`} className="text-gray-400 hover:text-blue-400 transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-100">{history.name}</h1>
          <p className="text-sm text-gray-500">
            <span className={`inline-block h-2 w-2 rounded-full mr-1 ${statusColors[history.status] ?? 'bg-gray-500'}`} />
            {history.status} — {history.uptimePercent}% uptime
          </p>
        </div>
      </div>

      {/* Time range selector */}
      <div className="flex gap-1 rounded-lg bg-gray-900 p-1 border border-gray-800 w-fit">
        {TIME_RANGES.map(r => (
          <button
            key={r.days}
            onClick={() => changeDays(r.days)}
            className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
              days === r.days ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* Uptime trend chart */}
      <section className="rounded-lg border border-gray-800 bg-gray-900 p-4">
        <h2 className="text-xs uppercase text-gray-500 mb-3">Uptime Trend</h2>
        {history.uptimeTrend && history.uptimeTrend.length > 0
          ? <UptimeTrendChart data={history.uptimeTrend} height={250} />
          : <p className="text-gray-500 text-sm py-10 text-center">No trend data available</p>
        }
      </section>

      {/* Status timeline bar */}
      <section className="rounded-lg border border-gray-800 bg-gray-900 p-4">
        <h2 className="text-xs uppercase text-gray-500 mb-3">Status Timeline</h2>
        <div className="relative h-8 rounded overflow-hidden bg-gray-800">
          {history.history.map((entry, i) => {
            const start = Math.max(new Date(entry.startedAt).getTime(), rangeStart)
            const end = entry.endedAt ? new Date(entry.endedAt).getTime() : now
            const left = ((start - rangeStart) / totalMs) * 100
            const width = ((end - start) / totalMs) * 100
            if (width < 0.05) return null
            return (
              <div
                key={i}
                className={`absolute top-0 h-full ${statusColors[entry.status] ?? 'bg-gray-500'}`}
                style={{ left: `${left}%`, width: `${width}%` }}
                title={`${entry.status}: ${new Date(entry.startedAt).toLocaleString()} — ${entry.endedAt ? new Date(entry.endedAt).toLocaleString() : 'Current'}`}
              />
            )
          })}
        </div>
        <div className="flex justify-between text-[10px] text-gray-600 mt-1">
          <span>{new Date(rangeStart).toLocaleDateString()}</span>
          <span>Now</span>
        </div>
        <div className="flex items-center gap-3 mt-2 text-[10px] text-gray-500">
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-green-500" /> Online</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-red-500" /> Offline</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-amber-500" /> Maintenance</span>
        </div>
      </section>

      {/* Event log */}
      <section className="rounded-lg border border-gray-800 bg-gray-900 p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs uppercase text-gray-500">Event Log</h2>
          <div className="flex gap-1">
            {['All', 'Online', 'Offline', 'Maintenance'].map(s => (
              <button
                key={s}
                onClick={() => { setStatusFilter(s); setPage(1) }}
                className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
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
                  <td className="py-2 pr-4 text-gray-400">{new Date(entry.startedAt).toLocaleString()}</td>
                  <td className="py-2 pr-4 text-gray-400">{entry.endedAt ? new Date(entry.endedAt).toLocaleString() : <span className="text-blue-400">Current</span>}</td>
                  <td className="py-2 text-gray-400">{formatDuration(entry.startedAt, entry.endedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-3 text-sm text-gray-500">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="hover:text-gray-200 disabled:opacity-30">← Prev</button>
            <span>Page {page} of {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="hover:text-gray-200 disabled:opacity-30">Next →</button>
          </div>
        )}
      </section>
    </div>
  )
}
