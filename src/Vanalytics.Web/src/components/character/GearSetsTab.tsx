import { useState, useEffect } from 'react'
import { Plus, Download, Trash2, Camera } from 'lucide-react'
import { api } from '../../api/client'
import { itemImageUrl } from '../../utils/imageUrl'
import { useCharacterGearSets } from '../../hooks/useCharacterGearSets'
import GearSetSlotPicker from './GearSetSlotPicker'
import GearSetExportModal from './GearSetExportModal'
import type { GearEntry, OwnedEquipmentItem, GearSetSlot, GameItemDetail } from '../../types/api'

const GRID_LAYOUT: string[][] = [
  ['Main', 'Sub', 'Range', 'Ammo'],
  ['Head', 'Neck', 'Ear1', 'Ear2'],
  ['Body', 'Hands', 'Ring1', 'Ring2'],
  ['Back', 'Waist', 'Legs', 'Feet'],
]

interface Props {
  characterId: string
  gear: GearEntry[]                  // currently-equipped, for Snapshot + name resolution
  itemCache: Map<number, GameItemDetail>
}

export default function GearSetsTab({ characterId, gear, itemCache }: Props) {
  const { sets, createSet, updateSet, deleteSet, getSet } = useCharacterGearSets(characterId)
  const [editing, setEditing] = useState<{ id: number | null; name: string; job: string; slots: GearSetSlot[] } | null>(null)
  const [pickerSlot, setPickerSlot] = useState<string | null>(null)
  const [exporting, setExporting] = useState<{ name: string; slots: GearSetSlot[] } | null>(null)
  const [owned, setOwned] = useState<OwnedEquipmentItem[]>([])

  // Owned-item set for availability + the picker source.
  useEffect(() => {
    api<OwnedEquipmentItem[]>(`/api/characters/${characterId}/gear-sets/owned-equipment`)
      .then(d => setOwned(d ?? []))
      .catch(() => setOwned([]))
  }, [characterId])
  const ownedIds = new Set(owned.map(o => o.itemId))

  const resolveName = (itemId: number, fallback: string) =>
    fallback || itemCache.get(itemId)?.name || owned.find(o => o.itemId === itemId)?.itemName || `#${itemId}`

  const snapshot = () => {
    const slots: GearSetSlot[] = gear
      .filter(g => g.itemId !== 0)
      .map(g => ({ slot: g.slot, itemId: g.itemId, itemName: g.itemName, augments: g.augments }))
    setEditing({ id: null, name: 'New Set', job: '', slots })
  }

  const blank = () => setEditing({ id: null, name: 'New Set', job: '', slots: [] })

  const openExisting = async (setId: number) => {
    const detail = await getSet(setId)
    if (!detail) return
    const slots = detail.slots.map(s => ({ ...s, itemName: resolveName(s.itemId, s.itemName) }))
    setEditing({ id: detail.id, name: detail.name, job: detail.job ?? '', slots })
  }

  const save = async () => {
    if (!editing) return
    const body = { name: editing.name, job: editing.job || null, slots: editing.slots }
    if (editing.id == null) await createSet(body)
    else await updateSet(editing.id, body)
    setEditing(null)
  }

  const setSlot = (slot: GearSetSlot) => {
    setEditing(e => e ? { ...e, slots: [...e.slots.filter(s => s.slot !== slot.slot), slot] } : e)
    setPickerSlot(null)
  }
  const clearSlot = (slotName: string) =>
    setEditing(e => e ? { ...e, slots: e.slots.filter(s => s.slot !== slotName) } : e)

  // ---- Editor view ----
  if (editing) {
    const bySlot = new Map(editing.slots.map(s => [s.slot, s]))
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })}
            className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-200" />
          <input value={editing.job} onChange={e => setEditing({ ...editing, job: e.target.value })}
            placeholder="Job (optional)"
            className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-200 w-32" />
          <button onClick={save} className="text-xs px-3 py-1.5 rounded bg-indigo-900/50 text-amber-200 border border-amber-700/40">Save</button>
          <button onClick={() => setEditing(null)} className="text-xs px-3 py-1.5 text-gray-400">Cancel</button>
        </div>

        <div className="grid grid-cols-4 gap-1.5">
          {GRID_LAYOUT.flat().map(slotName => {
            const s = bySlot.get(slotName)
            const missing = s && !ownedIds.has(s.itemId)
            const detail = s ? itemCache.get(s.itemId) : undefined
            const iconPath = s ? (detail?.iconPath ?? owned.find(o => o.itemId === s.itemId)?.iconPath ?? null) : null
            return (
              <button key={slotName} onClick={() => setPickerSlot(slotName)}
                className="relative aspect-square bg-gray-800/40 border border-gray-700/40 rounded flex flex-col items-center justify-center p-1 hover:border-amber-700/40"
                title={s ? s.itemName : slotName}>
                {s && iconPath
                  ? <img src={itemImageUrl(iconPath)} alt={s.itemName} className="w-8 h-8" style={{ imageRendering: 'pixelated' }} />
                  : <span className="text-[9px] text-gray-500">{slotName}</span>}
                {s && s.augments.length > 0 && <span className="absolute top-0.5 right-0.5 text-[8px] text-amber-300">A</span>}
                {missing && <span className="absolute bottom-0.5 left-0.5 text-[7px] text-rose-400/80 bg-gray-950/70 px-0.5 rounded" title="Not currently owned">not owned</span>}
                {s && <span onClick={ev => { ev.stopPropagation(); clearSlot(slotName) }}
                  className="absolute top-0 left-0 text-[9px] text-gray-600 hover:text-rose-400 px-1">×</span>}
              </button>
            )
          })}
        </div>

        {pickerSlot && (
          <GearSetSlotPicker slotName={pickerSlot} ownedItems={owned}
            onSelect={setSlot} onClose={() => setPickerSlot(null)} />
        )}
      </div>
    )
  }

  // ---- List view ----
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <button onClick={snapshot} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded bg-indigo-900/50 text-amber-200 border border-amber-700/40">
          <Camera className="h-3.5 w-3.5" /> Snapshot current gear
        </button>
        <button onClick={blank} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded bg-gray-800/60 text-gray-300 border border-gray-700/40">
          <Plus className="h-3.5 w-3.5" /> Blank set
        </button>
      </div>

      {sets.length === 0 && <div className="text-xs text-gray-500 py-6 text-center">No gear sets yet.</div>}

      <div className="space-y-1.5">
        {sets.map(s => (
          <div key={s.id} className="flex items-center gap-3 p-2.5 rounded bg-gray-800/40 border border-gray-700/40">
            <button onClick={() => openExisting(s.id)} className="flex-1 text-left">
              <span className="text-sm text-gray-200">{s.name}</span>
              {s.job && <span className="ml-2 text-[10px] text-amber-300/70 px-1.5 py-0.5 rounded bg-indigo-900/40">{s.job}</span>}
              <span className="ml-2 text-[10px] text-gray-500">{s.slotCount} slots</span>
            </button>
            <button onClick={async () => {
              const d = await getSet(s.id)
              if (d) setExporting({ name: d.name,
                slots: d.slots.map(x => ({ ...x, itemName: resolveName(x.itemId, x.itemName) })) })
            }} className="text-gray-500 hover:text-amber-300" title="Export to GearSwap">
              <Download className="h-4 w-4" />
            </button>
            <button onClick={() => deleteSet(s.id)} className="text-gray-500 hover:text-rose-400" title="Delete">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      {exporting && (
        <GearSetExportModal name={exporting.name} slots={exporting.slots} onClose={() => setExporting(null)} />
      )}
    </div>
  )
}
