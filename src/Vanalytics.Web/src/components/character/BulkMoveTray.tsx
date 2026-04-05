import { useState, useMemo } from 'react'
import { X, ChevronUp, ChevronDown } from 'lucide-react'
import type { InventoryByBag } from '../../types/api'
import { itemImageUrl } from '../../utils/imageUrl'

const BAG_OPTIONS = [
  'Inventory', 'Safe', 'Safe2', 'Storage', 'Locker', 'Satchel', 'Sack', 'Case',
  'Wardrobe', 'Wardrobe2', 'Wardrobe3', 'Wardrobe4', 'Wardrobe5', 'Wardrobe6', 'Wardrobe7', 'Wardrobe8',
]

const BAG_LABELS: Record<string, string> = {
  Inventory: 'Inventory', Safe: 'Mog Safe', Safe2: 'Mog Safe 2', Storage: 'Storage',
  Locker: 'Mog Locker', Satchel: 'Mog Satchel', Sack: 'Mog Sack', Case: 'Mog Case',
  Wardrobe: 'Mog Wardrobe 1', Wardrobe2: 'Mog Wardrobe 2', Wardrobe3: 'Mog Wardrobe 3',
  Wardrobe4: 'Mog Wardrobe 4', Wardrobe5: 'Mog Wardrobe 5', Wardrobe6: 'Mog Wardrobe 6',
  Wardrobe7: 'Mog Wardrobe 7', Wardrobe8: 'Mog Wardrobe 8',
}

const BAG_MAX_SLOTS = 80

interface BulkMoveTrayProps {
  selection: Set<string>
  inventory: InventoryByBag
  onRemove: (key: string) => void
  onClear: () => void
  onSubmit: (targetBag: string) => void
  submitting: boolean
}

interface ResolvedItem {
  key: string
  bag: string
  slotIndex: number
  itemName: string
  iconPath: string | null
  quantity: number
  isSelfMove: boolean
}

export default function BulkMoveTray({
  selection,
  inventory,
  onRemove,
  onClear,
  onSubmit,
  submitting,
}: BulkMoveTrayProps) {
  const [targetBag, setTargetBag] = useState('Inventory')
  const [expanded, setExpanded] = useState(false)

  // Resolve selection keys to full item data
  const resolvedItems = useMemo(() => {
    const result: ResolvedItem[] = []
    for (const key of selection) {
      const colonIdx = key.indexOf(':')
      if (colonIdx === -1) continue
      const bag = key.slice(0, colonIdx)
      const slotIndex = parseInt(key.slice(colonIdx + 1), 10)
      const bagItems = inventory[bag] ?? []
      const item = bagItems.find(i => i.slotIndex === slotIndex)
      if (!item) continue
      result.push({
        key,
        bag,
        slotIndex,
        itemName: item.itemName,
        iconPath: item.iconPath,
        quantity: item.quantity,
        isSelfMove: bag === targetBag,
      })
    }
    return result
  }, [selection, inventory, targetBag])

  // Count unique source bags
  const sourceBagCount = useMemo(() => new Set(resolvedItems.map(i => i.bag)).size, [resolvedItems])

  // Capacity calculation
  const { effectiveCount, freeSlots, overCapacity } = useMemo(() => {
    const currentCount = (inventory[targetBag] ?? []).length
    const free = BAG_MAX_SLOTS - currentCount
    const effective = resolvedItems.filter(i => !i.isSelfMove).length
    return { effectiveCount: effective, freeSlots: free, overCapacity: effective > free }
  }, [resolvedItems, targetBag, inventory])

  if (selection.size === 0) return null

  const handleSubmitClick = () => {
    if (overCapacity) {
      // When over capacity, expand so user sees the warning + "Send Anyway" button
      if (!expanded) setExpanded(true)
      return
    }
    onSubmit(targetBag)
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50">
      {/* Expanded item list */}
      {expanded && (
        <div className="bg-gray-900 border-t border-gray-700 max-h-[40vh] overflow-y-auto">
          <table className="w-full text-xs text-gray-200">
            <thead className="sticky top-0 z-10">
              <tr className="bg-gray-800 text-gray-400 text-[10px] uppercase">
                <th className="w-5 px-3 py-1.5 text-left"></th>
                <th className="px-2 py-1.5 text-left">Item</th>
                <th className="w-32 px-2 py-1.5 text-left">Source Bag</th>
                <th className="w-16 px-2 py-1.5 text-right">Qty</th>
                <th className="w-8 px-2 py-1.5"></th>
              </tr>
            </thead>
            <tbody>
              {resolvedItems.map(item => (
                <tr
                  key={item.key}
                  className={`border-b border-gray-800 hover:bg-gray-800/50 ${item.isSelfMove ? 'opacity-40' : ''}`}
                >
                  {/* Icon */}
                  <td className="w-5 px-3 py-1.5">
                    {item.iconPath ? (
                      <img src={itemImageUrl(item.iconPath)} alt="" className="h-5 w-5" />
                    ) : (
                      <div className="h-5 w-5 rounded bg-gray-700" />
                    )}
                  </td>
                  {/* Item Name */}
                  <td className="flex-1 px-2 py-1.5 min-w-0">
                    <span className="truncate">{item.itemName}</span>
                    {item.isSelfMove && (
                      <span className="ml-1.5 text-gray-500">(already in target)</span>
                    )}
                  </td>
                  {/* Source Bag */}
                  <td className="w-32 px-2 py-1.5 text-gray-400">
                    {BAG_LABELS[item.bag] ?? item.bag}
                  </td>
                  {/* Qty */}
                  <td className="w-16 px-2 py-1.5 text-right text-gray-400">
                    x{item.quantity}
                  </td>
                  {/* Remove */}
                  <td className="w-8 px-2 py-1.5 text-center">
                    <button
                      onClick={() => onRemove(item.key)}
                      className="text-gray-500 hover:text-red-400 transition-colors"
                      aria-label="Remove item"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Capacity warning bar */}
      {expanded && overCapacity && (
        <div className="bg-yellow-950/30 border-t border-yellow-800 px-4 py-2 flex items-center justify-between gap-4">
          <span className="text-xs text-yellow-400">
            Not enough free slots — {effectiveCount} items selected but only {freeSlots} free in {BAG_LABELS[targetBag] ?? targetBag}.
          </span>
          <button
            onClick={() => onSubmit(targetBag)}
            disabled={submitting}
            className="text-xs font-medium bg-yellow-600 hover:bg-yellow-500 disabled:opacity-40 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded transition-colors"
          >
            Send Anyway
          </button>
        </div>
      )}

      {/* Control bar */}
      <div className="bg-gray-900 border-t-2 border-blue-500 px-4 py-2.5 flex items-center justify-between gap-4">
        {/* Left: selection summary */}
        <div className="flex items-center gap-3 text-xs text-gray-400 min-w-0 shrink-0">
          <span>
            <span className="text-gray-200 font-medium">{selection.size}</span> item{selection.size !== 1 ? 's' : ''} selected
          </span>
          {sourceBagCount > 1 && (
            <span className="text-gray-500">from {sourceBagCount} bags</span>
          )}
        </div>

        {/* Center: target bag + slot info */}
        <div className="flex items-center gap-2 text-xs min-w-0">
          <label htmlFor="bulk-move-target" className="text-gray-400 shrink-0">Move to:</label>
          <select
            id="bulk-move-target"
            value={targetBag}
            onChange={e => setTargetBag(e.target.value)}
            className="bg-gray-800 border border-gray-600 text-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-500"
          >
            {BAG_OPTIONS.map(bag => (
              <option key={bag} value={bag}>{BAG_LABELS[bag] ?? bag}</option>
            ))}
          </select>
          <span className={`shrink-0 ${overCapacity ? 'text-yellow-400' : 'text-gray-500'}`}>
            {freeSlots} free / {BAG_MAX_SLOTS}
          </span>
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onClear}
            disabled={submitting}
            className="text-xs text-gray-500 hover:text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Clear
          </button>
          <button
            onClick={() => setExpanded(v => !v)}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-200 bg-gray-800 border border-gray-700 px-2 py-1.5 rounded transition-colors"
            aria-label={expanded ? 'Collapse list' : 'Expand list'}
          >
            {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
          </button>
          <button
            onClick={handleSubmitClick}
            disabled={submitting || effectiveCount === 0}
            className={`flex items-center gap-1 text-xs font-medium text-white px-3 py-1.5 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
              overCapacity && !expanded
                ? 'bg-yellow-600 hover:bg-yellow-500'
                : 'bg-blue-600 hover:bg-blue-500'
            }`}
          >
            {submitting ? 'Sending…' : `Move ${effectiveCount > 0 ? effectiveCount : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}
