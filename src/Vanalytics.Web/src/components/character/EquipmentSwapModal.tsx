import { useState, useEffect } from 'react'
import { X, Search } from 'lucide-react'
import { api } from '../../api/client'
import { itemImageUrl } from '../../utils/imageUrl'
import type { GameItemSummary } from '../../types/api'

const SLOT_CATEGORY: Record<string, { category: string; subCategory?: string }> = {
  Main: { category: 'Weapons' },
  Sub: { category: 'Weapons' },
  Range: { category: 'Weapons' },
  Ammo: { category: 'Weapons' },
  Head: { category: 'Armor', subCategory: 'Head' },
  Body: { category: 'Armor', subCategory: 'Body' },
  Hands: { category: 'Armor', subCategory: 'Hands' },
  Legs: { category: 'Armor', subCategory: 'Legs' },
  Feet: { category: 'Armor', subCategory: 'Feet' },
  Neck: { category: 'Armor', subCategory: 'Neck' },
  Waist: { category: 'Armor', subCategory: 'Waist' },
  Back: { category: 'Armor', subCategory: 'Back' },
  Ear1: { category: 'Armor', subCategory: 'Earrings' },
  Ear2: { category: 'Armor', subCategory: 'Earrings' },
  Ring1: { category: 'Armor', subCategory: 'Rings' },
  Ring2: { category: 'Armor', subCategory: 'Rings' },
}

interface EquipmentSwapModalProps {
  slotName: string
  currentItemId?: number
  onSelect: (item: GameItemSummary) => void
  onClose: () => void
}

export default function EquipmentSwapModal({
  slotName, currentItemId, onSelect, onClose,
}: EquipmentSwapModalProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<GameItemSummary[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (query.length < 2) { setResults([]); return }
      setLoading(true)
      try {
        const filter = SLOT_CATEGORY[slotName]
        const params = new URLSearchParams({
          q: query,
          ...(filter?.category && { category: filter.category }),
          ...(filter?.subCategory && { subCategory: filter.subCategory }),
          limit: '20',
        })
        const data = await api<{ items: GameItemSummary[] }>(`/api/items?${params}`)
        setResults(data?.items ?? [])
      } catch { setResults([]) }
      finally { setLoading(false) }
    }, 300)
    return () => clearTimeout(timer)
  }, [query, slotName])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-gray-900 border-2 border-amber-800/50 rounded-lg w-full max-w-md mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
          <span className="text-sm text-gray-200">Swap {slotName} Equipment</span>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
            <input type="text" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search items..."
              className="w-full pl-10 pr-8 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-gray-200 placeholder:text-gray-500 outline-none focus:border-amber-700/50" autoFocus />
            {query && (
              <button onClick={() => setQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
        <div className="max-h-64 overflow-y-auto px-3 pb-3 space-y-1">
          {loading && <div className="text-xs text-gray-500 text-center py-4">Searching...</div>}
          {!loading && query.length >= 2 && results.length === 0 && <div className="text-xs text-gray-500 text-center py-4">No items found</div>}
          {results.map(item => (
            <button key={item.itemId} onClick={() => onSelect(item)}
              className={`w-full flex items-center gap-3 p-2 rounded text-left transition-colors ${
                item.itemId === currentItemId ? 'bg-indigo-900/40 border border-amber-700/40' : 'bg-gray-800/50 border border-transparent hover:border-gray-600/40'
              }`}>
              {item.iconPath ? (
                <img src={itemImageUrl(item.iconPath)} alt={item.name} className="w-8 h-8 flex-shrink-0" style={{ imageRendering: 'pixelated' }} />
              ) : (
                <div className="w-8 h-8 flex-shrink-0 bg-gray-800/50 border border-gray-700/30 rounded-sm" />
              )}
              <div className="min-w-0">
                <div className="text-xs text-blue-300 truncate">{item.name}</div>
                <div className="text-[10px] text-gray-500">
                  {item.itemLevel ? `iLvl ${item.itemLevel}` : ''}{item.itemLevel && item.def ? ' · ' : ''}{item.def ? `DEF: ${item.def}` : ''}
                </div>
              </div>
              {item.itemId === currentItemId && <span className="text-[10px] text-gray-500 ml-auto flex-shrink-0">Equipped</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
