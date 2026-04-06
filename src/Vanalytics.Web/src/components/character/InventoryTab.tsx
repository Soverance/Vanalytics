import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api/client'
import type { InventoryByBag, InventoryItem, GameItemDetail, AnomalyResponse } from '../../types/api'
import ItemPreviewBox from '../economy/ItemPreviewBox'
import InventoryAnomalyBanner from './InventoryAnomalyBanner'
import BulkMoveTray from './BulkMoveTray'

const BAG_ORDER = [
  'Inventory', 'Safe', 'Safe2', 'Storage', 'Locker',
  'Satchel', 'Sack', 'Case',
  'Wardrobe', 'Wardrobe2', 'Wardrobe3', 'Wardrobe4',
  'Wardrobe5', 'Wardrobe6', 'Wardrobe7', 'Wardrobe8',
]

const BAG_LABELS: Record<string, string> = {
  Inventory: 'Inventory',
  Safe: 'Mog Safe',
  Safe2: 'Mog Safe 2',
  Storage: 'Storage',
  Locker: 'Mog Locker',
  Satchel: 'Mog Satchel',
  Sack: 'Mog Sack',
  Case: 'Mog Case',
  Wardrobe: 'Mog Wardrobe 1',
  Wardrobe2: 'Mog Wardrobe 2',
  Wardrobe3: 'Mog Wardrobe 3',
  Wardrobe4: 'Mog Wardrobe 4',
  Wardrobe5: 'Mog Wardrobe 5',
  Wardrobe6: 'Mog Wardrobe 6',
  Wardrobe7: 'Mog Wardrobe 7',
  Wardrobe8: 'Mog Wardrobe 8',
}

type SortField = 'itemName' | 'category' | 'quantity' | 'value'
type SortDir = 'asc' | 'desc'

const formatGil = (amount: number) => amount.toLocaleString()

interface Props {
  characterId: string
}

export default function InventoryTab({ characterId }: Props) {
  const [inventory, setInventory] = useState<InventoryByBag | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeBag, setActiveBag] = useState<string>('')
  const [activeView, setActiveView] = useState<'anomalies' | 'bag' | 'sellAdvisor'>('bag')
  const [anomalyCount, setAnomalyCount] = useState(0)
  const [search, setSearch] = useState('')
  const [tableExpanded, setTableExpanded] = useState(false)
  const [sortField, setSortField] = useState<SortField>('itemName')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [categoryFilter, setCategoryFilter] = useState<string>('')

  // Tooltip state
  const [hoveredItemId, setHoveredItemId] = useState<number | null>(null)
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number } | null>(null)
  const [itemDetailCache, setItemDetailCache] = useState<Map<number, GameItemDetail>>(new Map())
  const containerRef = useRef<HTMLDivElement>(null)

  // Bulk move selection state
  const [selection, setSelection] = useState<Set<string>>(new Set())
  const [submitting, setSubmitting] = useState(false)

  const toggleSelection = useCallback((bag: string, slotIndex: number) => {
    const key = `${bag}:${slotIndex}`
    setSelection(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const toggleAllVisible = useCallback((items: InventoryItem[], bag: string) => {
    setSelection(prev => {
      const next = new Set(prev)
      const keys = items.map(i => `${bag}:${i.slotIndex}`)
      const allSelected = keys.every(k => next.has(k))
      if (allSelected) {
        keys.forEach(k => next.delete(k))
      } else {
        keys.forEach(k => next.add(k))
      }
      return next
    })
  }, [])

  const toggleAllSearchVisible = useCallback((items: (InventoryItem & { bag: string })[]) => {
    setSelection(prev => {
      const next = new Set(prev)
      const keys = items.map(i => `${i.bag}:${i.slotIndex}`)
      const allSelected = keys.every(k => next.has(k))
      if (allSelected) {
        keys.forEach(k => next.delete(k))
      } else {
        keys.forEach(k => next.add(k))
      }
      return next
    })
  }, [])

  const removeSelection = useCallback((key: string) => {
    setSelection(prev => {
      const next = new Set(prev)
      next.delete(key)
      return next
    })
  }, [])

  const clearSelection = useCallback(() => setSelection(new Set()), [])

  const fetchInventory = useCallback(() => {
    api<InventoryByBag>(`/api/characters/${characterId}/inventory`)
      .then(data => {
        setInventory(data)
      })
      .catch(() => setInventory(null))
      .finally(() => setLoading(false))
  }, [characterId])

  const handleBulkSubmit = useCallback(async (targetBag: string) => {
    if (!inventory) return
    const moves: { itemId: number; fromBag: string; fromSlot: number; toBag: string; quantity: number }[] = []
    for (const key of selection) {
      const [bag, slotStr] = key.split(':')
      if (bag === targetBag) continue
      const slotIndex = Number(slotStr)
      const bagItems = inventory[bag]
      if (!bagItems) continue
      const item = bagItems.find(i => i.slotIndex === slotIndex)
      if (!item) continue
      moves.push({ itemId: item.itemId, fromBag: bag, fromSlot: slotIndex, toBag: targetBag, quantity: item.quantity })
    }
    if (moves.length === 0) return
    setSubmitting(true)
    try {
      await api(`/api/characters/${characterId}/inventory/moves`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moves }),
      })
      clearSelection()
      fetchInventory()
    } catch {
      // API errors handled by api() client
    } finally {
      setSubmitting(false)
    }
  }, [selection, inventory, characterId, clearSelection, fetchInventory])

  // Set initial active bag on first load
  useEffect(() => {
    setLoading(true)
    api<InventoryByBag>(`/api/characters/${characterId}/inventory`)
      .then(data => {
        setInventory(data)
        const bags = BAG_ORDER.filter(b => data[b] && data[b].length > 0)
        if (bags.length > 0) setActiveBag(bags[0])
      })
      .catch(() => setInventory(null))
      .finally(() => setLoading(false))
  }, [characterId])

  // Poll every 15 seconds to pick up inventory changes from the addon
  useEffect(() => {
    const id = setInterval(fetchInventory, 15000)
    return () => clearInterval(id)
  }, [fetchInventory])

  // Anomaly count is updated via the onAnomalyCountChange callback from InventoryAnomalyBanner.
  // We also need an initial count before the user clicks the Anomalies tab (banner hasn't mounted yet).
  useEffect(() => {
    api<AnomalyResponse>(`/api/characters/${characterId}/inventory/anomalies`)
      .then(data => setAnomalyCount(data.anomalies.length))
      .catch(() => {})
  }, [characterId])

  const availableBags = useMemo(() => {
    if (!inventory) return []
    return BAG_ORDER.filter(b => inventory[b] && inventory[b].length > 0)
  }, [inventory])

  const allCategories = useMemo(() => {
    if (!inventory) return []
    const cats = new Set<string>()
    for (const items of Object.values(inventory)) {
      for (const item of items) {
        if (item.category) cats.add(item.category)
      }
    }
    return Array.from(cats).sort()
  }, [inventory])

  const selectionCountByBag = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const key of selection) {
      const bag = key.split(':')[0]
      counts[bag] = (counts[bag] ?? 0) + 1
    }
    return counts
  }, [selection])

  const sellableItems = useMemo(() => {
    if (!inventory) return []
    const items: (InventoryItem & { bag: string; totalValue: number })[] = []
    for (const bag of BAG_ORDER) {
      const bagItems = inventory[bag]
      if (!bagItems) continue
      for (const item of bagItems) {
        if (item.baseSell && item.baseSell > 0) {
          items.push({ ...item, bag, totalValue: item.quantity * item.baseSell })
        }
      }
    }
    items.sort((a, b) => b.totalValue - a.totalValue)
    return items
  }, [inventory])

  const totalSellableGil = useMemo(
    () => sellableItems.reduce((sum, i) => sum + i.totalValue, 0),
    [sellableItems]
  )

  const isSearching = search.length > 0

  const searchResults = useMemo(() => {
    if (!inventory || !isSearching) return []
    const q = search.toLowerCase()
    const results: (InventoryItem & { bag: string })[] = []
    for (const bag of BAG_ORDER) {
      const items = inventory[bag]
      if (!items) continue
      for (const item of items) {
        if (item.itemName.toLowerCase().includes(q) || String(item.itemId).includes(q)) {
          results.push({ ...item, bag })
        }
      }
    }
    return results
  }, [inventory, search, isSearching])

  const activeItems = useMemo(() => {
    if (!inventory || !activeBag || !inventory[activeBag]) return []
    let items = [...inventory[activeBag]]

    if (categoryFilter) {
      items = items.filter(item => item.category === categoryFilter)
    }

    items.sort((a, b) => {
      let cmp = 0
      if (sortField === 'itemName') cmp = a.itemName.localeCompare(b.itemName)
      else if (sortField === 'category') cmp = (a.category ?? '').localeCompare(b.category ?? '')
      else if (sortField === 'quantity') cmp = a.quantity - b.quantity
      else if (sortField === 'value') cmp = ((a.quantity * (a.baseSell ?? 0)) - (b.quantity * (b.baseSell ?? 0)))
      return sortDir === 'desc' ? -cmp : cmp
    })

    return items
  }, [inventory, activeBag, sortField, sortDir, categoryFilter])

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  const sortIndicator = (field: SortField) => {
    if (sortField !== field) return ''
    return sortDir === 'asc' ? ' \u25B2' : ' \u25BC'
  }

  const handleBagClick = (bag: string) => {
    if (activeBag === bag) {
      setTableExpanded(prev => !prev)
    } else {
      setActiveBag(bag)
      setTableExpanded(true)
    }
  }

  // Tooltip hover handlers
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

  const tooltipRef = useRef<HTMLDivElement>(null)

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const margin = 16
    let left = e.clientX + margin
    let top = e.clientY + margin

    // If we have a rendered tooltip, use its actual dimensions
    const el = tooltipRef.current
    if (el) {
      const tooltipH = el.offsetHeight
      const tooltipW = el.offsetWidth

      if (left + tooltipW > window.innerWidth) {
        left = e.clientX - tooltipW - margin
      }

      // Flip to just above the cursor (anchor bottom of tooltip to cursor)
      if (top + tooltipH > window.innerHeight) {
        top = e.clientY - tooltipH - margin
      }
    }

    setTooltipPos({ top, left })
  }, [])

  const handleRowLeave = useCallback(() => {
    setHoveredItemId(null)
    setTooltipPos(null)
  }, [])

  const hoveredDetail = hoveredItemId ? itemDetailCache.get(hoveredItemId) ?? null : null

  if (loading) return <p className="text-gray-400 py-4">Loading inventory...</p>
  if (!inventory || availableBags.length === 0) {
    return (
      <p className="text-gray-400 py-4">
        No inventory data yet. Inventory syncs automatically each time your Windower addon runs.{' '}
        <Link to="/setup?tab=inventory" className="text-blue-400 hover:underline">Learn more</Link>
      </p>
    )
  }

  const renderRow = (item: InventoryItem & { bag?: string }, key: string, showBag?: boolean) => {
    const itemBag = showBag ? item.bag! : activeBag
    const selKey = `${itemBag}:${item.slotIndex}`
    const isSelected = selection.has(selKey)

    return (
      <tr
        key={key}
        className={`border-t border-gray-700/50 cursor-pointer ${
          isSelected
            ? 'bg-blue-500/[0.08] border-l-3 border-l-blue-500'
            : 'hover:bg-gray-800/50'
        }`}
        onClick={() => {
          toggleSelection(itemBag, item.slotIndex)
        }}
        onMouseEnter={() => handleRowEnter(item.itemId)}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleRowLeave}
      >
        <td className="px-2 py-1.5 w-8 text-center" onClick={e => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => toggleSelection(itemBag, item.slotIndex)}
            className="styled-checkbox"
          />
        </td>
        <td className="px-4 py-1.5">
          {item.iconPath && (
            <img src={`/item-images/${item.iconPath}`} alt="" className="w-8 h-auto object-contain" loading="lazy" />
          )}
        </td>
        <td className="px-4 py-1.5 text-gray-100">
          {item.itemName}
          <span className="ml-2 text-gray-600 text-xs">#{item.itemId}</span>
        </td>
        <td className="px-4 py-1.5 text-gray-400">{item.category ?? '\u2014'}</td>
        {showBag && <td className="px-4 py-1.5 text-gray-400">{BAG_LABELS[item.bag!] ?? item.bag}</td>}
        <td className="px-4 py-1.5 text-right text-gray-300">
          {item.quantity}{item.stackSize > 1 ? `/${item.stackSize}` : ''}
        </td>
        <td className="px-4 py-1.5 text-right text-gray-400">
          {item.baseSell && item.baseSell > 0
            ? formatGil(item.quantity * item.baseSell)
            : '\u2014'}
        </td>
      </tr>
    )
  }

  return (
    <div className={`relative ${selection.size > 0 ? 'pb-16' : ''}`} ref={containerRef}>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold">Inventory</h2>
        <div className="relative w-64">
          <input
            type="text"
            placeholder="Search all bags..."
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
      </div>

      {/* Search results (cross-bag) */}
      {isSearching && (
        searchResults.length === 0 ? (
          <p className="text-gray-400 text-sm py-4">No items match your search.</p>
        ) : (
          <div>
            <p className="text-gray-400 text-xs mb-2">
              {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} across all bags
            </p>
            <div className="max-h-[480px] overflow-y-auto styled-scrollbar">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-gray-800 text-gray-400 text-xs uppercase">
                    <th className="px-2 py-2 w-8 text-center">
                      <input
                        type="checkbox"
                        checked={searchResults.length > 0 && searchResults.every(i => selection.has(`${i.bag}:${i.slotIndex}`))}
                        onChange={() => toggleAllSearchVisible(searchResults)}
                        className="styled-checkbox"
                      />
                    </th>
                    <th className="px-4 py-2 text-left w-12"></th>
                    <th className="px-4 py-2 text-left">Item</th>
                    <th className="px-4 py-2 text-left">Category</th>
                    <th className="px-4 py-2 text-left">Bag</th>
                    <th className="px-4 py-2 text-right w-20">Qty</th>
                    <th className="px-4 py-2 text-right w-20">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {searchResults.map(item =>
                    renderRow(item, `${item.bag}-${item.slotIndex}-${item.itemId}`, true)
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {/* Bag tabs + collapsible table */}
      {!isSearching && (
        <>
          <div className="flex flex-wrap items-center gap-1 border-b border-gray-700 mb-4">
            {/* Anomalies tab — always first */}
            <button
              onClick={() => { setActiveView('anomalies'); setTableExpanded(false) }}
              className={`px-3 py-2 text-sm font-medium transition-colors ${
                activeView === 'anomalies'
                  ? 'text-blue-400 border-b-2 border-blue-400 -mb-px'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              Anomalies
              {anomalyCount > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-amber-600 px-1.5 py-0.5 text-[10px] font-bold text-white leading-none">
                  {anomalyCount}
                </span>
              )}
            </button>
            <button
              onClick={() => { setActiveView('sellAdvisor'); setTableExpanded(false) }}
              className={`px-3 py-2 text-sm font-medium transition-colors ${
                activeView === 'sellAdvisor'
                  ? 'text-blue-400 border-b-2 border-blue-400 -mb-px'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              Sell Advisor
            </button>
            {availableBags.map(bag => (
              <button
                key={bag}
                onClick={() => { setActiveView('bag'); handleBagClick(bag) }}
                className={`px-3 py-2 text-sm font-medium transition-colors ${
                  activeView === 'bag' && activeBag === bag && tableExpanded
                    ? 'text-blue-400 border-b-2 border-blue-400 -mb-px'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                {BAG_LABELS[bag] ?? bag}
                {(() => {
                  const total = inventory[bag]?.length ?? 0
                  const selected = selectionCountByBag[bag] ?? 0
                  if (selected > 0) {
                    return (
                      <span className="ml-1.5 text-xs bg-blue-900/50 text-blue-400 rounded-full px-1.5">
                        {selected} / {total}
                      </span>
                    )
                  }
                  return <span className="ml-1.5 text-xs text-gray-500">({total})</span>
                })()}
              </button>
            ))}
            {activeView === 'bag' && tableExpanded && (
              <select
                value={categoryFilter}
                onChange={e => setCategoryFilter(e.target.value)}
                className="ml-auto px-2 py-1 bg-gray-700 border border-gray-600 rounded text-gray-100 text-xs focus:outline-none focus:border-blue-500"
              >
                <option value="">All Categories</option>
                {allCategories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            )}
          </div>

          {/* Anomalies tab content */}
          {activeView === 'anomalies' && (
            <InventoryAnomalyBanner characterId={characterId} onAnomalyCountChange={setAnomalyCount} />
          )}

          {/* Sell Advisor tab content */}
          {activeView === 'sellAdvisor' && (
            <div>
              <div className="rounded-lg border border-green-800/50 bg-green-950/20 p-3 mb-4">
                <p className="text-sm text-green-400">
                  Total sellable value: <span className="font-semibold">{formatGil(totalSellableGil)} gil</span>
                  {' '}across {sellableItems.length} item{sellableItems.length !== 1 ? 's' : ''}
                </p>
              </div>
              {sellableItems.length === 0 ? (
                <p className="text-gray-400 text-sm py-4">No sellable items found in your inventory.</p>
              ) : (
                <div className="max-h-[480px] overflow-y-auto styled-scrollbar">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-gray-800 text-gray-400 text-xs uppercase">
                        <th className="px-4 py-2 text-left w-12"></th>
                        <th className="px-4 py-2 text-left">Item</th>
                        <th className="px-4 py-2 text-left">Bag</th>
                        <th className="px-4 py-2 text-right w-16">Qty</th>
                        <th className="px-4 py-2 text-right w-20">Unit</th>
                        <th className="px-4 py-2 text-right w-24">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sellableItems.map(item => (
                        <tr key={`${item.bag}-${item.slotIndex}`} className="border-t border-gray-700/50 hover:bg-gray-800/50">
                          <td className="px-4 py-1.5">
                            {item.iconPath && (
                              <img src={`/item-images/${item.iconPath}`} alt="" className="w-8 h-auto object-contain" loading="lazy" />
                            )}
                          </td>
                          <td className="px-4 py-1.5 text-gray-100">
                            {item.itemName}
                            <span className="ml-2 text-gray-600 text-xs">#{item.itemId}</span>
                          </td>
                          <td className="px-4 py-1.5 text-gray-400">{BAG_LABELS[item.bag] ?? item.bag}</td>
                          <td className="px-4 py-1.5 text-right text-gray-300">
                            {item.quantity}{item.stackSize > 1 ? `/${item.stackSize}` : ''}
                          </td>
                          <td className="px-4 py-1.5 text-right text-gray-400">{formatGil(item.baseSell!)}</td>
                          <td className="px-4 py-1.5 text-right text-yellow-400 font-medium">{formatGil(item.totalValue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Bag tab content */}
          {activeView === 'bag' && tableExpanded && (
            activeItems.length === 0 ? (
              <p className="text-gray-400 text-sm py-4">
                {categoryFilter ? 'No items in this category.' : 'This bag is empty.'}
              </p>
            ) : (
              <div className="max-h-[480px] overflow-y-auto styled-scrollbar">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-gray-800 text-gray-400 text-xs uppercase">
                      <th className="px-2 py-2 w-8 text-center">
                        <input
                          type="checkbox"
                          checked={activeItems.length > 0 && activeItems.every(i => selection.has(`${activeBag}:${i.slotIndex}`))}
                          onChange={() => toggleAllVisible(activeItems, activeBag)}
                          className="styled-checkbox"
                        />
                      </th>
                      <th className="px-4 py-2 text-left w-12"></th>
                      <th className="px-4 py-2 text-left cursor-pointer hover:text-gray-200 select-none" onClick={() => handleSort('itemName')}>
                        Item{sortIndicator('itemName')}
                      </th>
                      <th className="px-4 py-2 text-left cursor-pointer hover:text-gray-200 select-none" onClick={() => handleSort('category')}>
                        Category{sortIndicator('category')}
                      </th>
                      <th className="px-4 py-2 text-right cursor-pointer hover:text-gray-200 select-none w-20" onClick={() => handleSort('quantity')}>
                        Qty{sortIndicator('quantity')}
                      </th>
                      <th
                        className="px-4 py-2 text-right cursor-pointer hover:text-gray-200 select-none w-20"
                        onClick={() => handleSort('value')}
                      >
                        Value{sortIndicator('value')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeItems.map(item =>
                      renderRow(item, `${item.slotIndex}-${item.itemId}`)
                    )}
                  </tbody>
                </table>
              </div>
            )
          )}
        </>
      )}

      {inventory && (
        <BulkMoveTray
          selection={selection}
          inventory={inventory}
          onRemove={removeSelection}
          onClear={clearSelection}
          onSubmit={handleBulkSubmit}
          submitting={submitting}
        />
      )}

      {/* Item preview tooltip */}
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
