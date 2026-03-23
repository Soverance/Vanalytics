import { useState } from 'react'
import { X, ChevronUp, ChevronDown } from 'lucide-react'
import { useCompare } from './CompareContext'
import CompareTable from './CompareTable'
import { itemImageUrl } from '../../utils/imageUrl'

export default function CompareTray() {
  const { items, removeItem, clearItems, details, fetchDetails } = useCompare()
  const [expanded, setExpanded] = useState(false)

  if (items.length === 0) return null

  const handleExpand = async () => {
    if (!expanded) {
      await fetchDetails()
    }
    setExpanded(!expanded)
  }

  const detailItems = items
    .map(i => details.get(i.itemId))
    .filter((d): d is NonNullable<typeof d> => d != null)

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50">
      {expanded && detailItems.length >= 2 && (
        <div className="bg-gray-900 border-t border-gray-700 max-h-[60vh] overflow-y-auto">
          <div className="max-w-5xl mx-auto p-4">
            <CompareTable items={detailItems} />
          </div>
        </div>
      )}

      <div className="bg-gray-900 border-t-2 border-blue-500 px-4 py-2.5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-xs text-gray-400 shrink-0">Compare:</span>
          <div className="flex gap-2 overflow-x-auto">
            {items.map(item => (
              <div key={item.itemId} className="flex items-center gap-1.5 bg-gray-800 border border-gray-700 rounded px-2 py-1 shrink-0">
                {item.iconPath ? (
                  <img src={itemImageUrl(item.iconPath)} alt="" className="h-5 w-5" />
                ) : (
                  <div className="h-5 w-5 rounded bg-gray-700" />
                )}
                <span className="text-xs text-gray-200 max-w-[80px] truncate">{item.name}</span>
                <button onClick={() => removeItem(item.itemId)} className="text-red-400 hover:text-red-300">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            {Array.from({ length: 4 - items.length }).map((_, i) => (
              <div key={`empty-${i}`} className="h-8 w-20 border border-dashed border-gray-700 rounded shrink-0" />
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleExpand}
            disabled={items.length < 2}
            className="flex items-center gap-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium px-3 py-1.5 rounded transition-colors"
          >
            {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
            Compare ({items.length})
          </button>
          <button onClick={clearItems} className="text-xs text-gray-500 hover:text-gray-300">
            Clear
          </button>
        </div>
      </div>
    </div>
  )
}
