import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { X, ChevronRight } from 'lucide-react'
import { getAggregateInventory } from '../../api/client'
import type { AggregateInventoryResponse, AggregateInventoryItem } from '../../types/api'
import { filterAggregateItems, isRosterDuplicate, isSellable } from '../../lib/aggregateInventory'
import { bagLabel } from '../../lib/bagLabels'
import { roleLabel } from '../../lib/characterRoles'
import LoadingSpinner from '../LoadingSpinner'
import BottomFlyout from '../BottomFlyout'
import Tabs from '../Tabs'
import RosterSellTab from './RosterSellTab'

interface Props {
  open: boolean
  onClose: () => void
}

type TabValue = 'locator' | 'sell'

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#1a1d27] border border-gray-700 rounded-lg px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-gray-500">{label}</div>
      <div className="text-lg font-semibold text-white">{value}</div>
    </div>
  )
}

function FlagBadge({ label, className }: { label: string; className: string }) {
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${className}`}>{label}</span>
}

function ItemRow({ item }: { item: AggregateInventoryItem }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="border-b border-gray-800">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 py-2 text-left hover:bg-gray-800/40"
      >
        <ChevronRight className={`h-4 w-4 flex-shrink-0 text-gray-500 transition-transform ${expanded ? 'rotate-90' : ''}`} />
        {item.iconPath && (
          <img src={`/item-images/${item.iconPath}`} alt="" className="h-7 w-auto object-contain" loading="lazy" />
        )}
        <Link
          to={`/items/${item.itemId}`}
          className="text-gray-100 hover:text-blue-400 hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {item.name}
        </Link>
        <span className="flex items-center gap-1">
          {item.isRare && <FlagBadge label="Rare" className="bg-purple-900/50 text-purple-300" />}
          {item.isExclusive && <FlagBadge label="Ex" className="bg-red-900/50 text-red-300" />}
          {item.isNoDelivery && <FlagBadge label="No Delivery" className="bg-gray-700 text-gray-300" />}
        </span>
        <span className="ml-auto text-sm text-gray-400">×{item.totalQuantity.toLocaleString()}</span>
      </button>
      {expanded && (
        <div className="pb-2 pl-10 pr-2">
          {item.locations.map((loc) => (
            <div key={`${loc.characterId}-${loc.bag}`} className="flex items-center gap-2 py-1 text-xs text-gray-400">
              <span className="text-gray-200">{loc.characterName}</span>
              {loc.role !== 'None' && (
                <span className="rounded bg-gray-700 px-1.5 py-0.5 text-[10px] text-gray-300">{roleLabel(loc.role)}</span>
              )}
              <span className="text-gray-500">· {bagLabel(loc.bag)}</span>
              <span className="ml-auto">×{loc.quantity}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function AggregateInventoryDrawer({ open, onClose }: Props) {
  const [data, setData] = useState<AggregateInventoryResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<TabValue>('locator')
  const [dupOnly, setDupOnly] = useState(false)
  // null = "let the server resolve the default world"; a string = explicit pick.
  const [selectedWorld, setSelectedWorld] = useState<string | null>(null)

  // Fetch on open and whenever the selected world changes. `data` stays mounted, so a
  // reopen with an unchanged world doesn't refetch. Cancelled guard avoids stray sets.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    getAggregateInventory(selectedWorld ?? undefined)
      .then((d) => { if (!cancelled) setData(d) })
      .catch(() => { if (!cancelled) setError('Failed to load aggregate inventory') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [open, selectedWorld])

  const currentWorld = selectedWorld ?? data?.world ?? ''

  const visible = useMemo(() => {
    if (!data) return []
    const byQuery = filterAggregateItems(data.items, query)
    return dupOnly ? byQuery.filter(isRosterDuplicate) : byQuery
  }, [data, query, dupOnly])

  const sellItems = useMemo(() => visible.filter(isSellable), [visible])

  return (
    <BottomFlyout
      open={open}
      onClose={onClose}
      panelClassName="max-h-[80vh] rounded-t-xl border-t border-gray-700 bg-[#0f1117] shadow-2xl flex flex-col"
    >
      <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-white">Roster Inventory</h2>
          {data && data.availableWorlds.length > 0 && (
            <select
              value={currentWorld}
              onChange={(e) => setSelectedWorld(e.target.value)}
              className="rounded border border-gray-700 bg-[#1a1d27] px-2 py-1 text-xs text-gray-200 focus:border-blue-500 focus:outline-none"
            >
              {data.availableWorlds.map((w) => (
                <option key={w} value={w}>{w}</option>
              ))}
            </select>
          )}
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-white" aria-label="Close">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="overflow-y-auto p-4">
        {loading && !data && <LoadingSpinner />}
        {error && <div className="rounded bg-red-900/50 border border-red-700 p-3 text-sm text-red-300">{error}</div>}

        {data && (
          <>
            <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <StatChip label="Distinct Items" value={data.totals.distinctItems.toLocaleString()} />
              <StatChip label="Total Quantity" value={data.totals.totalQuantity.toLocaleString()} />
              <StatChip label="Slots Used" value={`${data.totals.usedSlots.toLocaleString()} / ${data.totals.unlockedSlots.toLocaleString()}`} />
              <StatChip label="Characters" value={`${data.totals.syncedCharacterCount} / ${data.totals.characterCount}`} />
            </div>

            <Tabs<TabValue>
              items={[{ value: 'locator', label: 'Locator' }, { value: 'sell', label: 'Sell' }]}
              value={tab}
              onChange={setTab}
              toolbar={
                <label className="flex items-center gap-1.5 text-xs text-gray-400">
                  <input type="checkbox" checked={dupOnly} onChange={(e) => setDupOnly(e.target.checked)} />
                  Duplicates only
                </label>
              }
            />

            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search items across this world…"
              className="mb-3 w-full rounded-lg border border-gray-700 bg-[#1a1d27] px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
            />

            {data.totals.syncedCharacterCount === 0 ? (
              <p className="py-6 text-center text-sm text-gray-500">No characters have synced inventory on this world yet.</p>
            ) : tab === 'locator' ? (
              visible.length === 0 ? (
                <p className="py-6 text-center text-sm text-gray-500">No items match.</p>
              ) : (
                <div>{visible.map((item) => <ItemRow key={item.itemId} item={item} />)}</div>
              )
            ) : (
              <RosterSellTab items={sellItems} serverScraped={data.serverScraped} />
            )}

            <p className="mt-3 text-[11px] text-gray-600">Shown as of each character's last inventory sync.</p>
          </>
        )}
      </div>
    </BottomFlyout>
  )
}
