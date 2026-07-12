import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { X, ChevronRight } from 'lucide-react'
import { getAggregateInventory } from '../../api/client'
import type { AggregateInventoryResponse, AggregateInventoryItem } from '../../types/api'
import { filterAggregateItems } from '../../lib/aggregateInventory'
import { bagLabel } from '../../lib/bagLabels'
import { roleLabel } from '../../lib/characterRoles'
import LoadingSpinner from '../LoadingSpinner'
import BottomFlyout from '../BottomFlyout'

interface Props {
  open: boolean
  onClose: () => void
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#1a1d27] border border-gray-700 rounded-lg px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-gray-500">{label}</div>
      <div className="text-lg font-semibold text-white">{value}</div>
    </div>
  )
}

function ItemRow({ item }: { item: AggregateInventoryItem }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="border-b border-gray-800">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 py-2 text-left hover:bg-gray-800/40"
      >
        <ChevronRight
          className={`h-4 w-4 flex-shrink-0 text-gray-500 transition-transform ${expanded ? 'rotate-90' : ''}`}
        />
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
        <span className="ml-auto text-sm text-gray-400">×{item.totalQuantity.toLocaleString()}</span>
      </button>
      {expanded && (
        <div className="pb-2 pl-10 pr-2">
          {item.locations.map((loc) => (
            <div key={`${loc.characterId}-${loc.bag}`} className="flex items-center gap-2 py-1 text-xs text-gray-400">
              <span className="text-gray-200">{loc.characterName}</span>
              {loc.role !== 'None' && (
                <span className="rounded bg-gray-700 px-1.5 py-0.5 text-[10px] text-gray-300">
                  {roleLabel(loc.role)}
                </span>
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

  // Lazy fetch on first open; the drawer stays mounted, so `data` caches across
  // open/close and we fetch exactly once. The cancelled guard avoids a stray
  // state update if `open` toggles before the request settles.
  useEffect(() => {
    if (!open || data) return
    let cancelled = false
    setLoading(true)
    getAggregateInventory()
      .then((d) => { if (!cancelled) setData(d) })
      .catch(() => { if (!cancelled) setError('Failed to load aggregate inventory') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [open, data])

  const filtered = useMemo(
    () => (data ? filterAggregateItems(data.items, query) : []),
    [data, query],
  )

  return (
    <BottomFlyout
      open={open}
      onClose={onClose}
      panelClassName="max-h-[80vh] rounded-t-xl border-t border-gray-700 bg-[#0f1117] shadow-2xl flex flex-col"
    >
        <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
          <h2 className="text-sm font-semibold text-white">Roster Inventory</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto p-4">
          {loading && <LoadingSpinner />}
          {error && <div className="rounded bg-red-900/50 border border-red-700 p-3 text-sm text-red-300">{error}</div>}

          {data && (
            <>
              {/* Totals row */}
              <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <StatChip label="Distinct Items" value={data.totals.distinctItems.toLocaleString()} />
                <StatChip label="Total Quantity" value={data.totals.totalQuantity.toLocaleString()} />
                <StatChip
                  label="Slots Used"
                  value={`${data.totals.usedSlots.toLocaleString()} / ${data.totals.unlockedSlots.toLocaleString()}`}
                />
                <StatChip
                  label="Characters"
                  value={`${data.totals.syncedCharacterCount} / ${data.totals.characterCount}`}
                />
              </div>

              {/* Search */}
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search items across your roster…"
                className="mb-3 w-full rounded-lg border border-gray-700 bg-[#1a1d27] px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
              />

              {/* Results */}
              {data.totals.syncedCharacterCount === 0 ? (
                <p className="py-6 text-center text-sm text-gray-500">No characters have synced inventory yet.</p>
              ) : filtered.length === 0 ? (
                <p className="py-6 text-center text-sm text-gray-500">No items match "{query}".</p>
              ) : (
                <div>
                  {filtered.map((item) => (
                    <ItemRow key={item.itemId} item={item} />
                  ))}
                </div>
              )}

              <p className="mt-3 text-[11px] text-gray-600">
                Shown as of each character's last inventory sync.
              </p>
            </>
          )}
        </div>
    </BottomFlyout>
  )
}
