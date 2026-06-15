import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { X } from 'lucide-react'
import { api } from '../../api/client'
import { jobBitmask } from '../../lib/jobs'
import { itemImageUrl } from '../../utils/imageUrl'
import type { OwnedEquipmentItem, GameItemSummary, GearSetSlot, GameItemDetail } from '../../types/api'
import ItemPreviewBox from '../economy/ItemPreviewBox'

// Internal grid slot -> equip-slot bitmask (matches GameItem.Slots; Ear/Ring cover both bits).
const SLOT_BITMASK: Record<string, number> = {
  Main: 0x0001, Sub: 0x0002, Range: 0x0004, Ammo: 0x0008,
  Head: 0x0010, Body: 0x0020, Hands: 0x0040, Legs: 0x0080,
  Feet: 0x0100, Neck: 0x0200, Waist: 0x0400,
  Ear1: 0x1800, Ear2: 0x1800, Ring1: 0x6000, Ring2: 0x6000, Back: 0x8000,
}

// Catalog search filter per slot (reuses /api/items category+subCategory like EquipmentSwapModal).
const SLOT_CATEGORY: Record<string, { category: string; subCategory?: string }> = {
  Main: { category: 'Weapons' }, Sub: { category: 'Weapons' },
  Range: { category: 'Weapons' }, Ammo: { category: 'Weapons' },
  Head: { category: 'Armor', subCategory: 'Head' }, Body: { category: 'Armor', subCategory: 'Body' },
  Hands: { category: 'Armor', subCategory: 'Hands' }, Legs: { category: 'Armor', subCategory: 'Legs' },
  Feet: { category: 'Armor', subCategory: 'Feet' }, Neck: { category: 'Armor', subCategory: 'Neck' },
  Waist: { category: 'Armor', subCategory: 'Waist' }, Back: { category: 'Armor', subCategory: 'Back' },
  Ear1: { category: 'Armor', subCategory: 'Earrings' }, Ear2: { category: 'Armor', subCategory: 'Earrings' },
  Ring1: { category: 'Armor', subCategory: 'Rings' }, Ring2: { category: 'Armor', subCategory: 'Rings' },
}

interface Props {
  slotName: string
  ownedItems: OwnedEquipmentItem[]   // fetched once by the parent
  job?: string                       // the gear set's job ('' / undefined = none)
  jobFilter: boolean                 // restrict to job-equippable gear (persisted by parent)
  onJobFilterChange: (v: boolean) => void
  onSelect: (slot: GearSetSlot) => void
  onClose: () => void
  onClear?: () => void
  itemCache: Map<number, GameItemDetail>
  onEnsureDetail: (itemId: number) => void
}

export default function GearSetSlotPicker({
  slotName, ownedItems, job, jobFilter, onJobFilterChange, onSelect, onClose, onClear,
  itemCache, onEnsureDetail,
}: Props) {
  const [mode, setMode] = useState<'owned' | 'catalog'>('owned')
  const [query, setQuery] = useState('')
  const [catalog, setCatalog] = useState<GameItemSummary[]>([])
  const [loading, setLoading] = useState(false)

  // Cursor-following stat tooltip (mirrors InventoryTab).
  const [hoveredId, setHoveredId] = useState<number | null>(null)
  const [hoveredAugments, setHoveredAugments] = useState<string[] | null>(null)
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number } | null>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)

  const handleRowEnter = useCallback((itemId: number, augments?: string[]) => {
    setHoveredId(itemId)
    setHoveredAugments(augments ?? null)
    onEnsureDetail(itemId)
  }, [onEnsureDetail])

  const handleRowMove = useCallback((e: React.MouseEvent) => {
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
    setHoveredId(null)
    setHoveredAugments(null)
    setTooltipPos(null)
  }, [])

  const hoveredDetail = hoveredId != null ? itemCache.get(hoveredId) ?? null : null

  // The filter only applies when the set has a real job and the toggle is on.
  const jobMask = job ? jobBitmask(job) : 0
  const filterByJob = jobMask !== 0 && jobFilter

  const mask = SLOT_BITMASK[slotName] ?? 0
  const owned = useMemo(
    () => ownedItems.filter(i =>
      i.slots != null && (i.slots & mask) !== 0
      && (!filterByJob || (i.jobs != null && (i.jobs & jobMask) !== 0))),
    [ownedItems, mask, filterByJob, jobMask])

  // Catalog search (debounced), constrained to the slot's category (and job when filtering).
  useEffect(() => {
    if (mode !== 'catalog') return
    let isCurrent = true
    const t = setTimeout(async () => {
      if (query.length < 2) { setCatalog([]); return }
      setLoading(true)
      try {
        const f = SLOT_CATEGORY[slotName]
        const params = new URLSearchParams({
          q: query, limit: '20',
          ...(f?.category && { category: f.category }),
          ...(f?.subCategory && { subCategory: f.subCategory }),
          ...(filterByJob && job && { jobs: job }),
        })
        const data = await api<{ items: GameItemSummary[] }>(`/api/items?${params}`)
        if (isCurrent) setCatalog(data?.items ?? [])
      } catch {
        if (isCurrent) setCatalog([])
      } finally {
        if (isCurrent) setLoading(false)
      }
    }, 300)
    return () => { isCurrent = false; clearTimeout(t) }
  }, [query, slotName, mode, filterByJob, job])

  const pick = (itemId: number, itemName: string, augments: string[]) =>
    onSelect({ slot: slotName, itemId, itemName, augments })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-gray-900 border-2 border-amber-800/50 rounded-lg w-full max-w-md mx-4 overflow-hidden"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
          <span className="text-sm text-gray-200">Set {slotName}</span>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300"><X className="h-4 w-4" /></button>
        </div>

        {/* Mode toggle + optional job filter */}
        <div className="flex items-center gap-2 px-3 pt-3">
          {(['owned', 'catalog'] as const).map(m => (
            <button key={m} onClick={() => setMode(m)}
              className={`text-xs px-3 py-1 rounded ${mode === m
                ? 'bg-indigo-900/50 text-amber-200 border border-amber-700/40'
                : 'bg-gray-800/50 text-gray-400 border border-transparent'}`}>
              {m === 'owned' ? 'Owned' : 'Catalog'}
            </button>
          ))}
          {jobMask !== 0 && (
            <button onClick={() => onJobFilterChange(!jobFilter)}
              title={`Show only gear ${job} can equip`}
              className={`ml-auto text-xs px-3 py-1 rounded ${jobFilter
                ? 'bg-emerald-900/40 text-emerald-200 border border-emerald-700/40'
                : 'bg-gray-800/50 text-gray-400 border border-transparent'}`}>
              {job} only
            </button>
          )}
        </div>

        {mode === 'owned' ? (
          <div className="max-h-72 overflow-y-auto p-3 space-y-1">
            {owned.length === 0 && (
              <div className="text-xs text-gray-500 text-center py-4">No owned items for this slot.</div>
            )}
            {owned.map((i, idx) => (
              <button key={`${i.itemId}-${idx}`} onClick={() => pick(i.itemId, i.itemName, i.augments)}
                onMouseEnter={() => handleRowEnter(i.itemId, i.augments)}
                onMouseMove={handleRowMove}
                onMouseLeave={handleRowLeave}
                className="w-full flex items-center gap-3 p-2 rounded text-left bg-gray-800/50 border border-transparent hover:border-gray-600/40">
                {i.iconPath
                  ? <img src={itemImageUrl(i.iconPath)} alt={i.itemName} className="w-8 h-8 flex-shrink-0" style={{ imageRendering: 'pixelated' }} />
                  : <div className="w-8 h-8 flex-shrink-0 bg-gray-800/50 border border-gray-700/30 rounded-sm" />}
                <div className="min-w-0">
                  <div className="text-xs text-blue-300 truncate">{i.itemName}</div>
                  {i.augments.length > 0 && (
                    <div className="text-[10px] text-amber-300/70 truncate">{i.augments.join(' · ')}</div>
                  )}
                </div>
              </button>
            ))}
          </div>
        ) : (
          <CatalogSearch query={query} setQuery={setQuery} results={catalog} loading={loading} onPick={pick}
            onRowEnter={handleRowEnter} onRowMove={handleRowMove} onRowLeave={handleRowLeave} />
        )}

        {onClear && (
          <div className="px-3 pb-3">
            <button onClick={onClear}
              className="w-full text-xs px-3 py-1.5 rounded bg-rose-950/40 text-rose-300 border border-rose-800/40 hover:bg-rose-900/40">
              Remove from slot
            </button>
          </div>
        )}

        {hoveredDetail && tooltipPos && (
          <div ref={tooltipRef} className="fixed z-[60] pointer-events-none"
            style={{ top: tooltipPos.top, left: tooltipPos.left }}>
            <ItemPreviewBox item={hoveredDetail} augments={hoveredAugments ?? undefined} />
          </div>
        )}
      </div>
    </div>
  )
}

// Catalog search + manual augment entry for the chosen unowned item.
function CatalogSearch({ query, setQuery, results, loading, onPick, onRowEnter, onRowMove, onRowLeave }: {
  query: string; setQuery: (v: string) => void; results: GameItemSummary[]
  loading: boolean; onPick: (itemId: number, itemName: string, augments: string[]) => void
  onRowEnter: (itemId: number, augments?: string[]) => void
  onRowMove: (e: React.MouseEvent) => void
  onRowLeave: () => void
}) {
  const [chosen, setChosen] = useState<GameItemSummary | null>(null)
  const [augText, setAugText] = useState('')

  if (chosen) {
    return (
      <div className="p-3 space-y-2">
        <div className="text-xs text-blue-300">{chosen.name}</div>
        <textarea value={augText} onChange={e => setAugText(e.target.value)}
          placeholder="One augment per line (optional)&#10;e.g. DEX+9&#10;Weapon skill damage +8%"
          className="w-full h-24 bg-gray-800 border border-gray-700 rounded text-xs text-gray-200 p-2 outline-none focus:border-amber-700/50" />
        <div className="flex gap-2 justify-end">
          <button onClick={() => setChosen(null)} className="text-xs px-3 py-1 text-gray-400">Back</button>
          <button onClick={() => onPick(chosen.itemId, chosen.name,
            augText.split('\n').map(s => s.trim()).filter(Boolean))}
            className="text-xs px-3 py-1 rounded bg-indigo-900/50 text-amber-200 border border-amber-700/40">Add</button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-3">
      <input type="text" value={query} onChange={e => setQuery(e.target.value)} autoFocus
        placeholder="Search items..."
        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-gray-200 placeholder:text-gray-500 outline-none focus:border-amber-700/50" />
      <div className="max-h-56 overflow-y-auto mt-2 space-y-1">
        {loading && <div className="text-xs text-gray-500 text-center py-4">Searching...</div>}
        {!loading && query.length >= 2 && results.length === 0 && <div className="text-xs text-gray-500 text-center py-4">No items found</div>}
        {!loading && results.map(item => (
          <button key={item.itemId} onClick={() => setChosen(item)}
            onMouseEnter={() => onRowEnter(item.itemId)}
            onMouseMove={onRowMove}
            onMouseLeave={onRowLeave}
            className="w-full flex items-center gap-3 p-2 rounded text-left bg-gray-800/50 border border-transparent hover:border-gray-600/40">
            {item.iconPath
              ? <img src={itemImageUrl(item.iconPath)} alt={item.name} className="w-8 h-8 flex-shrink-0" style={{ imageRendering: 'pixelated' }} />
              : <div className="w-8 h-8 flex-shrink-0 bg-gray-800/50 border border-gray-700/30 rounded-sm" />}
            <div className="text-xs text-blue-300 truncate min-w-0">{item.name}</div>
          </button>
        ))}
      </div>
    </div>
  )
}
