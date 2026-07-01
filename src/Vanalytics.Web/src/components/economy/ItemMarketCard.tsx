import { useState, useEffect } from 'react'
import { api } from '../../api/client'
import Tabs from '../Tabs'
import PriceHistoryChart from './PriceHistoryChart'
import CrossServerChart from './CrossServerChart'
import type { PriceHistoryResponse, CrossServerResponse, EconomyServer } from '../../types/api'

const WINDOWS = [7, 30, 90] as const
const CHART_SALES_CAP = 100

type MarketTab = 'history' | 'cross'

interface Props {
  itemId: number
  server: string
  days: number
  servers: EconomyServer[]
  onServerChange: (name: string) => void
  onDaysChange: (days: number) => void
}

export default function ItemMarketCard({ itemId, server, days, servers, onServerChange, onDaysChange }: Props) {
  const [tab, setTab] = useState<MarketTab>('history')
  const [history, setHistory] = useState<PriceHistoryResponse | null>(null)
  const [cross, setCross] = useState<CrossServerResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const qs = new URLSearchParams({ server, days: String(days), page: '1', pageSize: String(CHART_SALES_CAP) })
    Promise.all([
      api<PriceHistoryResponse>(`/api/items/${itemId}/prices?${qs}`),
      api<CrossServerResponse>(`/api/items/${itemId}/prices/all?days=${days}`),
    ])
      .then(([h, c]) => { if (!cancelled) { setHistory(h); setCross(c) } })
      .catch(() => { if (!cancelled) { setHistory(null); setCross(null) } })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [itemId, server, days])

  const stats = history?.stats
  const fmt = (n: number) => n.toLocaleString()

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
      {/* Header: world selector + window toggle */}
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div className="flex items-center gap-1 rounded-md bg-gray-800 p-0.5">
          {WINDOWS.map(w => (
            <button
              key={w}
              onClick={() => onDaysChange(w)}
              className={`px-2.5 py-1 text-xs rounded transition-colors ${
                days === w ? 'bg-gray-700 text-gray-100' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {w}d
            </button>
          ))}
        </div>
        <select
          value={server}
          onChange={e => onServerChange(e.target.value)}
          className="rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-600"
        >
          {servers.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
        </select>
      </div>

      {/* Stats line */}
      {stats && (
        <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400">
          <span>Median <span className="text-gray-200">{fmt(stats.median)}</span></span>
          <span>Min <span className="text-gray-200">{fmt(stats.min)}</span></span>
          <span>Max <span className="text-gray-200">{fmt(stats.max)}</span></span>
          <span>Avg <span className="text-gray-200">{fmt(stats.average)}</span></span>
          <span>· {fmt(stats.salesPerDay)}/day</span>
        </div>
      )}

      <Tabs<MarketTab>
        items={[{ value: 'history', label: 'Price History' }, { value: 'cross', label: 'Cross-World' }]}
        value={tab}
        onChange={setTab}
      />

      {loading && !history ? (
        <p className="text-sm text-gray-500">Loading market data…</p>
      ) : tab === 'history' ? (
        history && history.sales.length > 0
          ? <PriceHistoryChart sales={history.sales} />
          : <p className="text-sm text-gray-500">No sales in the last {days} days.</p>
      ) : (
        cross && cross.servers.length > 0
          ? <CrossServerChart servers={cross.servers} />
          : <p className="text-sm text-gray-500">No cross-world sales in the last {days} days.</p>
      )}
    </div>
  )
}
