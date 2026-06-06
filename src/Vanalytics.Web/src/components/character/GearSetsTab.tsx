import { useState, useEffect } from 'react'
import { Plus, Download, Trash2, Camera } from 'lucide-react'
import { api } from '../../api/client'
import { useCharacterGearSets } from '../../hooks/useCharacterGearSets'
import GearSetEditor, { type WorkingSet } from './GearSetEditor'
import GearSetExportModal from './GearSetExportModal'
import type { CharacterDetail, GearEntry, OwnedEquipmentItem, GearSetSlot, GameItemDetail } from '../../types/api'

interface Props {
  character: CharacterDetail
  gear: GearEntry[]                  // currently-equipped, for Snapshot + name resolution
  itemCache: Map<number, GameItemDetail>
  onSaveFavorite: (fav: { category: string; animationName: string; motionIndex: number } | null) => void
}

export default function GearSetsTab({ character, gear, itemCache, onSaveFavorite }: Props) {
  const characterId = character.id
  const { sets, createSet, updateSet, deleteSet, getSet } = useCharacterGearSets(characterId)
  const [editing, setEditing] = useState<WorkingSet | null>(null)
  const [exporting, setExporting] = useState<{ name: string; slots: GearSetSlot[] } | null>(null)
  const [owned, setOwned] = useState<OwnedEquipmentItem[]>([])

  // Owned-item list for availability badges + the picker source.
  useEffect(() => {
    api<OwnedEquipmentItem[]>(`/api/characters/${characterId}/gear-sets/owned-equipment`)
      .then(d => setOwned(d ?? []))
      .catch(() => setOwned([]))
  }, [characterId])

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

  const save = async (body: { name: string; job: string | null; slots: GearSetSlot[] }) => {
    if (editing?.id == null) await createSet(body)
    else await updateSet(editing.id, body)
    setEditing(null)
  }

  // ---- Editor view ----
  if (editing) {
    return (
      <GearSetEditor
        key={editing.id ?? 'new'}
        initial={editing}
        character={character}
        owned={owned}
        itemCache={itemCache}
        onSaveFavorite={onSaveFavorite}
        onSave={save}
        onCancel={() => setEditing(null)}
      />
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
