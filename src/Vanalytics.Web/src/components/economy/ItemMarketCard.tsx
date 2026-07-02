import { useState, useEffect } from 'react'
import { api } from '../../api/client'
import Tabs from '../Tabs'
import PriceHistoryChart from './PriceHistoryChart'
import CrossServerChart from './CrossServerChart'
import { SPAN_OPTIONS } from '../../lib/economySpans'
import type { PriceHistoryResponse, PriceHistoryPointsResponse, CrossServerResponse, EconomyServer } from '../../types/api'

type MarketTab = 'history' | 'cross'

interface Props {
  itemId: number
  server: string
  days: number
  stack: boolean
  stackable: boolean
  servers: EconomyServer[]
  onServerChange: (name: string) => void
  onDaysChange: (days: number) => void
  onStackChange: (stack: boolean) => void
}

export default function ItemMarketCard({ itemId, server, days, stack, stackable, servers, onServerChange, onDaysChange, onStackChange }: Props) {
  const [tab, setTab] = useState<MarketTab>('history')
  const [stats, setStats] = useState<PriceHistoryResponse['stats']>(null)
  const [history, setHistory] = useState<PriceHistoryPointsResponse | null>(null)
  const [cross, setCross] = useState<CrossServerResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    // stats come from /prices over the whole window (pageSize=1 — we only need the aggregate);
    // the chart trend comes from /prices/history (bucketed medians); cross-world from /prices/all.
    const statsQs = new URLSearchParams({ server, days: String(days), page: '1', pageSize: '1', stack: String(stack) })
    const histQs = new URLSearchParams({ server, days: String(days), stack: String(stack) })
    Promise.all([
      api<PriceHistoryResponse>(`/api/items/${itemId}/prices?${statsQs}`),
      api<PriceHistoryPointsResponse>(`/api/items/${itemId}/prices/history?${histQs}`),
      api<CrossServerResponse>(`/api/items/${itemId}/prices/all?days=${days}&stack=${stack}`),
    ])
      .then(([s, h, c]) => { if (!cancelled) { setStats(s.stats); setHistory(h); setCross(c) } })
      .catch(() => { if (!cancelled) { setStats(null); setHistory(null); setCross(null) } })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [itemId, server, days, stack])

  const fmt = (n: number) => n.toLocaleString()

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
      {/* Header: span toggle (+ singles/stacks for stackables) + world selector */}
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 rounded-md bg-gray-800 p-0.5">
            {SPAN_OPTIONS.map(o => (
              <button
                key={o.value}
                onClick={() => onDaysChange(o.value)}
                className={`px-2.5 py-1 text-xs rounded transition-colors ${
                  days === o.value ? 'bg-gray-700 text-gray-100' : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
          {stackable && (
            <div className="flex items-center gap-1 rounded-md bg-gray-800 p-0.5">
              {([{ v: false, l: 'Singles' }, { v: true, l: 'Stacks' }] as const).map(o => (
                <button
                  key={o.l}
                  onClick={() => onStackChange(o.v)}
                  className={`px-2.5 py-1 text-xs rounded transition-colors ${
                    stack === o.v ? 'bg-gray-700 text-gray-100' : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  {o.l}
                </button>
              ))}
            </div>
          )}
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
        history && history.points.length > 0
          ? <PriceHistoryChart points={history.points} />
          : <p className="text-sm text-gray-500">No sales in this range.</p>
      ) : (
        cross && cross.servers.length > 0
          ? <CrossServerChart servers={cross.servers} />
          : <p className="text-sm text-gray-500">No cross-world sales in this range.</p>
      )}
    </div>
  )
}
