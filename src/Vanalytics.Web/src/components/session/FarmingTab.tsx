import { useState, useEffect, useMemo } from 'react'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceDot
} from 'recharts'
import { api } from '../../api/client'
import type { SessionDetail, SessionEvent, SessionTrendEntry } from '../../types/api'

interface FarmingTabProps {
  session: SessionDetail
  events: SessionEvent[]
}

export default function FarmingTab({ session, events }: FarmingTabProps) {
  const [trends, setTrends] = useState<SessionTrendEntry[]>([])
  const [trendsLoading, setTrendsLoading] = useState(true)

  useEffect(() => {
    setTrendsLoading(true)
    api<SessionTrendEntry[]>(
      `/api/sessions/trends?characterId=${session.characterId}&zone=${encodeURIComponent(session.zone)}`
    )
      .then(setTrends)
      .catch(() => setTrends([]))
      .finally(() => setTrendsLoading(false))
  }, [session.characterId, session.zone])

  const durationHours = session.endedAt
    ? (new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime()) / 3600000
    : 0

  const gilGained = events
    .filter(e => e.eventType === 'GilGain')
    .reduce((s, e) => s + e.value, 0)

  const limitPoints = events
    .filter(e => e.eventType === 'LimitGain')
    .reduce((s, e) => s + e.value, 0)

  const itemsLost = events.filter(e => e.eventType === 'ItemLost').length

  const thMax = events
    .filter(e => e.eventType === 'TreasureHunter')
    .reduce((max, e) => Math.max(max, e.value), 0)

  const gilPerHour = durationHours > 0 ? gilGained / durationHours : 0
  const killsPerHour = durationHours > 0 ? session.mobsKilled / durationHours : 0
  const dropsPerHour = durationHours > 0 ? session.itemsDropped / durationHours : 0

  const farmingCards = [
    { label: 'Gil/Hour', value: Math.round(gilPerHour).toLocaleString() },
    { label: 'Kills/Hour', value: Math.round(killsPerHour).toLocaleString() },
    { label: 'Drops/Hour', value: Math.round(dropsPerHour).toLocaleString() },
    { label: 'LP Earned', value: limitPoints.toLocaleString() },
    { label: 'Items Lost', value: itemsLost.toString(), warn: itemsLost > 0 },
    { label: 'TH Max', value: thMax > 0 ? `TH${thMax}` : 'N/A' },
  ]

  const lootTable = useMemo(() => {
    const items: Record<string, { qty: number; first: string; last: string }> = {}
    for (const e of events) {
      if (e.eventType === 'ItemDrop') {
        const name = e.target
        if (!items[name]) items[name] = { qty: 0, first: e.timestamp, last: e.timestamp }
        items[name].qty += e.value
        if (e.timestamp < items[name].first) items[name].first = e.timestamp
        if (e.timestamp > items[name].last) items[name].last = e.timestamp
      }
    }
    return Object.entries(items)
      .map(([item, d]) => ({ item, ...d }))
      .sort((a, b) => b.qty - a.qty)
  }, [events])

  const lostItems = useMemo(() => {
    return events
      .filter(e => e.eventType === 'ItemLost')
      .map(e => ({ item: e.target, timestamp: e.timestamp }))
  }, [events])

  const trendAvgs = useMemo(() => {
    if (trends.length === 0) return { gilAvg: 0, killsAvg: 0, dropsAvg: 0 }
    return {
      gilAvg: trends.reduce((s, t) => s + t.gilPerHour, 0) / trends.length,
      killsAvg: trends.reduce((s, t) => s + t.killsPerHour, 0) / trends.length,
      dropsAvg: trends.reduce((s, t) => s + t.dropsPerHour, 0) / trends.length,
    }
  }, [trends])

  const currentTrendIndex = trends.findIndex(t => t.sessionId === session.id)

  function formatDelta(current: number, avg: number): string {
    if (avg === 0) return ''
    const pct = ((current - avg) / avg) * 100
    const sign = pct >= 0 ? '+' : ''
    return `${sign}${pct.toFixed(0)}% vs avg`
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        {farmingCards.map((c) => (
          <div key={c.label} className={`rounded-lg border bg-gray-900 px-3 py-2 ${
            c.warn ? 'border-amber-700' : 'border-gray-800'
          }`}>
            <div className="text-xs text-gray-500 uppercase">{c.label}</div>
            <div className={`text-lg font-semibold ${c.warn ? 'text-amber-400' : 'text-gray-100'}`}>
              {c.value}
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
        <h3 className="text-sm font-medium text-gray-400 uppercase mb-4">Loot Obtained</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-gray-500 uppercase text-xs">
              <tr>
                <th className="py-2">Item</th>
                <th className="py-2 text-right">Qty</th>
                <th className="py-2 text-right">First Drop</th>
                <th className="py-2 text-right">Last Drop</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {lootTable.map((l) => (
                <tr key={l.item}>
                  <td className="py-2 text-gray-200">{l.item}</td>
                  <td className="py-2 text-right text-gray-400">{l.qty}</td>
                  <td className="py-2 text-right text-gray-500 text-xs">
                    {new Date(l.first).toLocaleTimeString()}
                  </td>
                  <td className="py-2 text-right text-gray-500 text-xs">
                    {new Date(l.last).toLocaleTimeString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {lostItems.length > 0 && (
          <div className="mt-4 border-t border-amber-800 pt-4">
            <h4 className="text-sm font-medium text-amber-400 mb-2">Items Lost</h4>
            {lostItems.map((l, i) => (
              <div key={i} className="text-sm text-amber-300">
                {l.item} — {new Date(l.timestamp).toLocaleTimeString()}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
        <h3 className="text-sm font-medium text-gray-400 uppercase mb-4">
          Trends — {session.zone}
        </h3>

        {trendsLoading ? (
          <p className="text-gray-500">Loading trends...</p>
        ) : trends.length < 2 ? (
          <p className="text-gray-500 text-sm">Need at least 2 completed sessions in this zone to show trends.</p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <TrendChart
              title="Gil/Hour"
              data={trends}
              dataKey="gilPerHour"
              color="#eab308"
              currentIndex={currentTrendIndex}
              callout={formatDelta(gilPerHour, trendAvgs.gilAvg)}
            />
            <TrendChart
              title="Kills/Hour"
              data={trends}
              dataKey="killsPerHour"
              color="#3b82f6"
              currentIndex={currentTrendIndex}
              callout={formatDelta(killsPerHour, trendAvgs.killsAvg)}
            />
            <TrendChart
              title="Drops/Hour"
              data={trends}
              dataKey="dropsPerHour"
              color="#22c55e"
              currentIndex={currentTrendIndex}
              callout={formatDelta(dropsPerHour, trendAvgs.dropsAvg)}
            />
          </div>
        )}
      </div>
    </div>
  )
}

function TrendChart({ title, data, dataKey, color, currentIndex, callout }: {
  title: string
  data: SessionTrendEntry[]
  dataKey: keyof SessionTrendEntry
  color: string
  currentIndex: number
  callout: string
}) {
  const chartData = data.map((d, i) => ({
    index: i,
    value: d[dataKey] as number,
    date: new Date(d.date).toLocaleDateString(),
  }))

  const currentPoint = currentIndex >= 0 ? chartData[currentIndex] : null

  return (
    <div>
      <div className="flex items-baseline gap-2 mb-2">
        <span className="text-sm text-gray-300">{title}</span>
        {callout && <span className="text-xs text-gray-500">{callout}</span>}
      </div>
      <ResponsiveContainer width="100%" height={150}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
          <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 10 }} />
          <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} />
          <Tooltip
            contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: 8 }}
            formatter={(v) => [Math.round(Number(v ?? 0)).toLocaleString(), title]}
          />
          <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={{ r: 3 }} />
          {currentPoint && (
            <ReferenceDot
              x={currentPoint.date}
              y={currentPoint.value}
              r={6}
              fill={color}
              stroke="#fff"
              strokeWidth={2}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
