import { useCallback, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api/client'
import type { GameItemDetail, PorterItem } from '../../types/api'
import { useCharacterPorter } from '../../hooks/useCharacterPorter'
import ItemPreviewBox from '../economy/ItemPreviewBox'

interface Props {
  characterId: string
}

type Freshness = 'fresh' | 'aging' | 'stale'

function freshness(syncedAt: string): Freshness {
  const ageDays = (Date.now() - new Date(syncedAt).getTime()) / (1000 * 60 * 60 * 24)
  if (ageDays < 7) return 'fresh'
  if (ageDays < 30) return 'aging'
  return 'stale'
}

function relativeTime(syncedAt: string): string {
  const ageMs = Date.now() - new Date(syncedAt).getTime()
  const days = Math.floor(ageMs / (1000 * 60 * 60 * 24))
  if (days >= 1) return `${days}d ago`
  const hours = Math.floor(ageMs / (1000 * 60 * 60))
  if (hours >= 1) return `${hours}h ago`
  const mins = Math.floor(ageMs / (1000 * 60))
  if (mins >= 1) return `${mins}m ago`
  return 'just now'
}

const FRESHNESS_STYLES: Record<Freshness, string> = {
  fresh: 'bg-green-900/40 text-green-300 border-green-700/50',
  aging: 'bg-yellow-900/40 text-yellow-300 border-yellow-700/50',
  stale: 'bg-red-900/40 text-red-300 border-red-700/50',
}

export default function PorterTab({ characterId }: Props) {
  const { slips, loading, error, refresh, hideSlip } = useCharacterPorter(characterId)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [showHidden, setShowHidden] = useState(false)
  const [search, setSearch] = useState('')

  const [hoveredItemId, setHoveredItemId] = useState<number | null>(null)
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number } | null>(null)
  const [itemDetailCache, setItemDetailCache] = useState<Map<number, GameItemDetail>>(new Map())
  const tooltipRef = useRef<HTMLDivElement>(null)

  const handleRowEnter = useCallback((itemId: number) => {
    setHoveredItemId(itemId)
    if (!itemDetailCache.has(itemId)) {
      api<GameItemDetail>(`/api/items/${itemId}`)
        .then(detail => {
          setItemDetailCache(prev => new Map(prev).set(itemId, detail))
        })
        .catch(() => {})
    }
  }, [itemDetailCache])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const margin = 16
    let left = e.clientX + margin
    let top = e.clientY + margin
    const el = tooltipRef.current
    if (el) {
      if (left + el.offsetWidth > window.innerWidth) left = e.clientX - el.offsetWidth - margin
      if (top + el.offsetHeight > window.innerHeight) top = e.clientY - el.offsetHeight - margin
    }
    setTooltipPos({ top, left })
  }, [])

  const handleRowLeave = useCallback(() => {
    setHoveredItemId(null)
    setTooltipPos(null)
  }, [])

  const toggleExpanded = (slipItemId: number) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(slipItemId)) next.delete(slipItemId)
      else next.add(slipItemId)
      return next
    })
  }

  const visibleSlips = useMemo(() => slips.filter(s => !s.userHidden && s.items.length > 0), [slips])
  // Empty slips are auto-hidden from the main view (display-only, reverses when items return)
  // and folded into the same collapsible as user-hidden slips.
  const hiddenSlips = useMemo(() => slips.filter(s => s.userHidden || s.items.length === 0), [slips])

  const searchResults = useMemo(() => {
    if (!search) return null
    const q = search.toLowerCase()
    const results: (PorterItem & { slipName: string; slipNumber: number; slipItemId: number })[] = []
    for (const slip of visibleSlips) {
      for (const item of slip.items) {
        if (item.itemName.toLowerCase().includes(q) || String(item.itemId).includes(q)) {
          results.push({ ...item, slipName: slip.slipName, slipNumber: slip.slipNumber, slipItemId: slip.slipItemId })
        }
      }
    }
    return results
  }, [search, visibleSlips])

  const totalItems = useMemo(
    () => visibleSlips.reduce((sum, s) => sum + s.items.length, 0),
    [visibleSlips]
  )

  const hoveredDetail = hoveredItemId ? itemDetailCache.get(hoveredItemId) ?? null : null

  if (loading) return <p className="text-gray-400 py-4">Loading porter storage...</p>

  if (error || (slips.length === 0 && !loading)) {
    return (
      <p className="text-gray-400 py-4">
        No porter storage data yet. Storage slips sync automatically each time your Windower addon runs
        with a slip in your bags.{' '}
        <Link to="/setup?tab=sync" className="text-blue-400 hover:underline">Learn more</Link>
      </p>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold">
          Porter Storage
          <span className="ml-2 text-sm text-gray-400 font-normal">
            {visibleSlips.length} slip{visibleSlips.length !== 1 ? 's' : ''} &middot; {totalItems} item{totalItems !== 1 ? 's' : ''}
          </span>
        </h2>
        <div className="flex items-center gap-2">
          <div className="relative w-64">
            <input
              type="text"
              placeholder="Search all slips..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full px-3 py-1.5 pr-8 bg-gray-700 border border-gray-600 rounded text-gray-100 placeholder-gray-500 text-sm focus:outline-none focus:border-blue-500"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200 text-sm"
                aria-label="Clear search"
              >
                &times;
              </button>
            )}
          </div>
          <button
            onClick={refresh}
            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm rounded transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      {searchResults !== null ? (
        searchResults.length === 0 ? (
          <p className="text-gray-400 text-sm py-4">No porter items match your search.</p>
        ) : (
          <div>
            <p className="text-gray-400 text-xs mb-2">
              {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} across all slips
            </p>
            <div className="max-h-[480px] overflow-y-auto styled-scrollbar">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-gray-800 text-gray-400 text-xs uppercase">
                    <th className="px-4 py-2 text-left w-12"></th>
                    <th className="px-4 py-2 text-left">Item</th>
                    <th className="px-4 py-2 text-left">Slip</th>
                    <th className="px-4 py-2 text-left">Category</th>
                  </tr>
                </thead>
                <tbody>
                  {searchResults.map(item => (
                    <tr
                      key={`${item.slipItemId}-${item.itemId}`}
                      className="border-t border-gray-700/50 hover:bg-gray-800/50"
                      onMouseEnter={() => handleRowEnter(item.itemId)}
                      onMouseMove={handleMouseMove}
                      onMouseLeave={handleRowLeave}
                    >
                      <td className="px-4 py-1.5">
                        {item.iconPath && (
                          <img src={`/item-images/${item.iconPath}`} alt="" className="w-8 h-auto object-contain" loading="lazy" />
                        )}
                      </td>
                      <td className="px-4 py-1.5 text-gray-100">
                        {item.itemName}
                        <span className="ml-2 text-gray-600 text-xs">#{item.itemId}</span>
                      </td>
                      <td className="px-4 py-1.5 text-gray-400">{item.slipName}</td>
                      <td className="px-4 py-1.5 text-gray-400">{item.category ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      ) : (
        <div className="space-y-2">
          {visibleSlips.map(slip => {
            const isOpen = expanded.has(slip.slipItemId)
            const fresh = freshness(slip.syncedAt)
            return (
              <div key={slip.slipItemId} className="border border-gray-700 rounded overflow-hidden">
                <div
                  className="flex items-center px-3 py-2 bg-gray-800/40 hover:bg-gray-800/70 cursor-pointer"
                  onClick={() => toggleExpanded(slip.slipItemId)}
                >
                  <span className="text-gray-400 mr-2 text-xs">{isOpen ? '▼' : '▶'}</span>
                  {slip.slipIconPath && (
                    <img src={`/item-images/${slip.slipIconPath}`} alt="" className="w-6 h-auto mr-2" loading="lazy" />
                  )}
                  <span className="text-gray-100 font-medium">{slip.slipName}</span>
                  <span className="ml-2 text-gray-500 text-xs">#{slip.slipNumber}</span>
                  <span className="ml-3 text-gray-400 text-sm">
                    {slip.items.length} item{slip.items.length !== 1 ? 's' : ''}
                  </span>
                  <span
                    className={`ml-3 text-xs px-2 py-0.5 rounded border ${FRESHNESS_STYLES[fresh]}`}
                    title={`Synced ${new Date(slip.syncedAt).toLocaleString()}`}
                  >
                    synced {relativeTime(slip.syncedAt)}
                  </span>
                  <div className="ml-auto flex items-center gap-2" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => hideSlip(slip.slipItemId, true)}
                      className="text-xs text-gray-400 hover:text-gray-200"
                      title="Hide this slip from the view (data is preserved)"
                    >
                      Hide
                    </button>
                  </div>
                </div>
                {isOpen && (
                  slip.items.length === 0 ? (
                    <p className="px-3 py-2 text-gray-500 text-sm">This slip is empty.</p>
                  ) : (
                    <div className="bg-gray-900/30">
                      <table className="w-full text-sm">
                        <tbody>
                          {slip.items.map(item => (
                            <tr
                              key={item.itemId}
                              className="border-t border-gray-700/30 hover:bg-gray-800/50"
                              onMouseEnter={() => handleRowEnter(item.itemId)}
                              onMouseMove={handleMouseMove}
                              onMouseLeave={handleRowLeave}
                            >
                              <td className="px-4 py-1.5 w-12">
                                {item.iconPath && (
                                  <img src={`/item-images/${item.iconPath}`} alt="" className="w-8 h-auto object-contain" loading="lazy" />
                                )}
                              </td>
                              <td className="px-4 py-1.5 text-gray-100">
                                {item.itemName}
                                <span className="ml-2 text-gray-600 text-xs">#{item.itemId}</span>
                              </td>
                              <td className="px-4 py-1.5 text-gray-400">{item.category ?? '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )
                )}
              </div>
            )
          })}

          {hiddenSlips.length > 0 && (
            <div className="mt-4 border-t border-gray-700 pt-3">
              <button
                onClick={() => setShowHidden(prev => !prev)}
                className="text-xs text-gray-400 hover:text-gray-200"
              >
                {showHidden ? '▼' : '▶'} Hidden &amp; empty slips ({hiddenSlips.length})
              </button>
              {showHidden && (
                <div className="mt-2 space-y-1">
                  {hiddenSlips.map(slip => (
                    <div key={slip.slipItemId} className="flex items-center px-3 py-1.5 bg-gray-800/20 rounded text-sm">
                      <span className="text-gray-400">{slip.slipName}</span>
                      <span className="ml-2 text-gray-600 text-xs">#{slip.slipNumber}</span>
                      <span className="ml-3 text-gray-500 text-xs">
                        {slip.items.length} item{slip.items.length !== 1 ? 's' : ''}
                      </span>
                      {slip.userHidden ? (
                        <button
                          onClick={() => hideSlip(slip.slipItemId, false)}
                          className="ml-auto text-xs text-blue-400 hover:text-blue-300"
                        >
                          Unhide
                        </button>
                      ) : (
                        <span className="ml-auto text-xs text-gray-600 italic">empty</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {hoveredDetail && tooltipPos && (
        <div
          ref={tooltipRef}
          className="fixed z-50 pointer-events-none"
          style={{ top: tooltipPos.top, left: tooltipPos.left }}
        >
          <ItemPreviewBox item={hoveredDetail} />
        </div>
      )}
    </div>
  )
}
