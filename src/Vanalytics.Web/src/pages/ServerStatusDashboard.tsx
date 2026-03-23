import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, ApiError } from '../api/client'
import type { ServerAnalytics } from '../types/api'
import ServiceHealthCards from '../components/server/ServiceHealthCards'
import UptimeTrendChart from '../components/server/UptimeTrendChart'
import ServerHeatmap from '../components/server/ServerHeatmap'
import ServerRankings from '../components/server/ServerRankings'
import CurrentStatusGrid from '../components/server/CurrentStatusGrid'
import RecentIncidents from '../components/server/RecentIncidents'
import ServerDetailPanel from '../components/server/ServerDetailPanel'

const TIME_RANGES = [
  { label: '24h', days: 1 },
  { label: '48h', days: 2 },
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
  { label: '365d', days: 365 },
  { label: 'All', days: 0 },
]

export default function ServerStatusDashboard() {
  const [searchParams, setSearchParams] = useSearchParams()
  const daysParam = searchParams.get('days')
  const [days, setDays] = useState(daysParam ? Number(daysParam) : 30)
  const [data, setData] = useState<ServerAnalytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedServer, setSelectedServer] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError('')
    api<ServerAnalytics>(`/api/servers/analytics?days=${days}`)
      .then(setData)
      .catch(err => {
        if (err instanceof ApiError) setError(`Failed to load analytics (${err.status})`)
        else setError('Failed to load analytics')
      })
      .finally(() => setLoading(false))
  }, [days])

  const handleServerClick = useCallback((serverName: string) => {
    setSelectedServer(serverName)
  }, [])

  const handlePanelClose = useCallback(() => {
    setSelectedServer(null)
  }, [])

  const changeDays = (d: number) => {
    setDays(d)
    setSearchParams({ days: String(d) })
  }

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    )
  }

  if (error && !data) {
    return <p className="text-center text-red-400 py-20">{error}</p>
  }

  if (!data) return null

  // Stale data warning
  const lastChecked = data.serviceHealth.lastCheckedAt ? new Date(data.serviceHealth.lastCheckedAt) : null
  const isStale = lastChecked ? (Date.now() - lastChecked.getTime()) > 10 * 60 * 1000 : false
  const currentServers = data.serverRankings.map(r => ({ name: r.name, status: r.status }))

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Server Status</h1>
          <p className="text-sm text-gray-500">FFXI service health and uptime analytics</p>
        </div>
        <div className="flex gap-1 rounded-lg bg-gray-900 p-1 border border-gray-800">
          {TIME_RANGES.map(r => (
            <button
              key={r.days}
              onClick={() => changeDays(r.days)}
              className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                days === r.days
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {isStale && (
        <div className="rounded-lg border border-amber-900/50 bg-amber-900/20 px-4 py-2 text-sm text-amber-400">
          Status data may be outdated — last check was {Math.round((Date.now() - lastChecked!.getTime()) / 60000)} minutes ago.
        </div>
      )}

      <ServiceHealthCards health={data.serviceHealth} rankings={data.serverRankings} />

      <section className="rounded-lg border border-gray-800 bg-gray-900 p-4">
        <h2 className="text-xs uppercase text-gray-500 mb-3">Service Uptime Trend</h2>
        {data.uptimeTrend.length > 0
          ? <UptimeTrendChart data={data.uptimeTrend} />
          : <p className="text-gray-500 text-sm py-10 text-center">Collecting server data — check back soon.</p>
        }
      </section>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <section className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <h2 className="text-xs uppercase text-gray-500 mb-3">Server Heatmap</h2>
          <ServerHeatmap data={data.heatmap} days={days} onServerClick={handleServerClick} />
        </section>
        <section className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <h2 className="text-xs uppercase text-gray-500 mb-3">Server Rankings</h2>
          <ServerRankings rankings={data.serverRankings} days={days} onServerClick={handleServerClick} />
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <h2 className="text-xs uppercase text-gray-500 mb-3">Current Status</h2>
          <CurrentStatusGrid servers={currentServers} onServerClick={handleServerClick} />
        </section>
        <section className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <h2 className="text-xs uppercase text-gray-500 mb-3">Recent Incidents</h2>
          <RecentIncidents incidents={data.recentIncidents} />
        </section>
      </div>
      {/* Slide-over panel */}
      {selectedServer && (
        <ServerDetailPanel
          serverName={selectedServer}
          initialDays={days}
          onClose={handlePanelClose}
        />
      )}
    </div>
  )
}
