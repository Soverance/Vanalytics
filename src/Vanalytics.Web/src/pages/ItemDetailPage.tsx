// src/Vanalytics.Web/src/pages/ItemDetailPage.tsx
import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import type { GameItemDetail, PriceHistoryResponse, CrossServerResponse, GameServer, BazaarListingItem } from '../types/api'
import ItemStatsTable from '../components/economy/ItemStatsTable'
import PriceHistoryChart from '../components/economy/PriceHistoryChart'
import CrossServerChart from '../components/economy/CrossServerChart'
import SalesTable from '../components/economy/SalesTable'
import BazaarListingsTable from '../components/economy/BazaarListingsTable'

export default function ItemDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [item, setItem] = useState<GameItemDetail | null>(null)
  const [prices, setPrices] = useState<PriceHistoryResponse | null>(null)
  const [crossServer, setCrossServer] = useState<CrossServerResponse | null>(null)
  const [servers, setServers] = useState<GameServer[]>([])
  const [selectedServer, setSelectedServer] = useState('')
  const [days, setDays] = useState(30)
  const [salesPage, setSalesPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [bazaarListings, setBazaarListings] = useState<BazaarListingItem[]>([])

  // Load item detail
  useEffect(() => {
    fetch(`/api/items/${id}`)
      .then((r) => r.ok ? r.json() : null)
      .then(setItem)
      .catch(() => setItem(null))
      .finally(() => setLoading(false))

    fetch('/api/servers')
      .then((r) => r.ok ? r.json() : [])
      .then((s: GameServer[]) => {
        setServers(s)
        if (s.length > 0 && !selectedServer) setSelectedServer(s[0].name)
      })
      .catch(() => {})
  }, [id])

  // Load prices when server/days/page changes
  useEffect(() => {
    if (!selectedServer) return
    const params = new URLSearchParams({
      server: selectedServer,
      days: days.toString(),
      page: salesPage.toString(),
      pageSize: '10',
    })
    fetch(`/api/items/${id}/prices?${params}`)
      .then((r) => r.ok ? r.json() : null)
      .then(setPrices)
      .catch(() => setPrices(null))
  }, [id, selectedServer, days, salesPage])

  useEffect(() => {
    if (!selectedServer) return
    fetch(`/api/items/${id}/bazaar?server=${selectedServer}`)
      .then((r) => r.ok ? r.json() : [])
      .then(setBazaarListings)
      .catch(() => setBazaarListings([]))
  }, [id, selectedServer])

  // Load cross-server comparison
  useEffect(() => {
    fetch(`/api/items/${id}/prices/all?days=${days}`)
      .then((r) => r.ok ? r.json() : null)
      .then(setCrossServer)
      .catch(() => setCrossServer(null))
  }, [id, days])

  if (loading) return <p className="text-gray-400">Loading item...</p>
  if (!item) return <p className="text-red-400">Item not found.</p>

  return (
    <div>
      <Link to="/items" className="text-sm text-blue-400 hover:underline mb-4 inline-block">
        &larr; Back to Item Database
      </Link>

      {/* Header */}
      <div className="flex items-start gap-4 mb-8">
        <div className="shrink-0 flex flex-col items-center gap-2">
          {item.iconPath ? (
            <img src={`/item-images/${item.iconPath}`} alt="" className="h-12 w-12" />
          ) : (
            <div className="h-12 w-12 rounded bg-gray-800" />
          )}
          {item.previewImagePath && (
            <img src={`/item-images/${item.previewImagePath}`} alt={item.name} className="max-w-[200px] rounded" />
          )}
        </div>
        <div>
          <h1 className="text-2xl font-bold">{item.name}</h1>
          {item.nameJa && <p className="text-sm text-gray-500">{item.nameJa}</p>}
          <div className="flex items-center gap-2 mt-1">
            <span className="rounded bg-gray-800 px-2 py-0.5 text-xs text-gray-400">{item.category}</span>
            {item.level && <span className="text-xs text-gray-500">Lv.{item.level}</span>}
            {item.isRare && <span className="text-xs text-amber-500">Rare</span>}
            {item.isExclusive && <span className="text-xs text-red-400">Ex</span>}
            {item.isAuctionable && <span className="text-xs text-green-400">AH</span>}
            <span className="text-xs text-gray-600">Stack: {item.stackSize}</span>
          </div>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        {/* Left column: Stats */}
        <div className="lg:col-span-1">
          <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
            <h2 className="text-sm font-semibold text-gray-400 mb-3">Item Stats</h2>
            <ItemStatsTable item={item} />
          </div>
        </div>

        {/* Right column: Prices */}
        <div className="lg:col-span-2 space-y-6">
          {/* Controls */}
          <div className="flex items-center gap-3">
            <select
              value={selectedServer}
              onChange={(e) => { setSelectedServer(e.target.value); setSalesPage(1) }}
              className="rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100"
            >
              {servers.map((s) => (
                <option key={s.id} value={s.name}>{s.name}</option>
              ))}
            </select>
            <div className="flex gap-1">
              {[7, 30, 90, 365].map((d) => (
                <button
                  key={d}
                  onClick={() => { setDays(d); setSalesPage(1) }}
                  className={`rounded px-2.5 py-1 text-xs font-medium ${
                    days === d ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  {d}d
                </button>
              ))}
            </div>
          </div>

          {/* Price summary */}
          {prices?.stats && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {[
                { label: 'Median', value: prices.stats.median },
                { label: 'Min', value: prices.stats.min },
                { label: 'Max', value: prices.stats.max },
                { label: 'Average', value: prices.stats.average },
                { label: 'Sales/Day', value: prices.stats.salesPerDay, noGil: true },
              ].map((s) => (
                <div key={s.label} className="rounded border border-gray-800 bg-gray-900 p-3 text-center">
                  <p className="text-xs text-gray-500 mb-1">{s.label}</p>
                  <p className="text-lg font-semibold text-gray-200">
                    {typeof s.value === 'number' ? s.value.toLocaleString() : '—'}
                    {!s.noGil && <span className="text-xs text-gray-500 ml-1">gil</span>}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Price history chart */}
          <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
            <h2 className="text-sm font-semibold text-gray-400 mb-3">Price History — {selectedServer}</h2>
            <PriceHistoryChart sales={prices?.sales ?? []} />
          </div>

          {/* Cross-server chart */}
          <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
            <h2 className="text-sm font-semibold text-gray-400 mb-3">Cross-Server Comparison</h2>
            <CrossServerChart servers={crossServer?.servers ?? []} />
          </div>

          {/* Recent sales */}
          <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
            <h2 className="text-sm font-semibold text-gray-400 mb-3">Recent Sales — {selectedServer}</h2>
            <SalesTable
              sales={prices?.sales ?? []}
              totalCount={prices?.totalCount ?? 0}
              page={salesPage}
              pageSize={10}
              onPageChange={setSalesPage}
            />
          </div>

          {/* Bazaar listings */}
          <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
            <h2 className="text-sm font-semibold text-gray-400 mb-3">Bazaar Listings — {selectedServer}</h2>
            <BazaarListingsTable listings={bazaarListings} />
          </div>
        </div>
      </div>
    </div>
  )
}
