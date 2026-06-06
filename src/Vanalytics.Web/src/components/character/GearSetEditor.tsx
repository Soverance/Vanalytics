import { useState, useEffect, useMemo } from 'react'
import { api } from '../../api/client'
import { toRaceId, useSlotDatPaths } from '../../lib/model-mappings'
import ModelViewer from './ModelViewer'
import FullscreenViewer from './FullscreenViewer'
import EquipmentGrid from './EquipmentGrid'
import GearSetSlotPicker from './GearSetSlotPicker'
import type { CharacterDetail, OwnedEquipmentItem, GearSetSlot, GameItemDetail } from '../../types/api'

export interface WorkingSet {
  id: number | null
  name: string
  job: string
  slots: GearSetSlot[]
}

interface Props {
  initial: WorkingSet
  character: CharacterDetail
  owned: OwnedEquipmentItem[]
  itemCache: Map<number, GameItemDetail>
  onSaveFavorite: (fav: { category: string; animationName: string; motionIndex: number } | null) => void
  onSave: (body: { name: string; job: string | null; slots: GearSetSlot[] }) => Promise<void> | void
  onCancel: () => void
}

const FULLSCREEN_SLOT_IDS: Record<string, number> = {
  Face: 1, Head: 2, Body: 3, Hands: 4, Legs: 5, Feet: 6, Main: 7, Sub: 8, Range: 9,
}

export default function GearSetEditor({
  initial, character, owned, itemCache, onSaveFavorite, onSave, onCancel,
}: Props) {
  const [name, setName] = useState(initial.name)
  const [job, setJob] = useState(initial.job)
  const [slots, setSlots] = useState<GearSetSlot[]>(initial.slots)
  const [pickerSlot, setPickerSlot] = useState<string | null>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const [extraDetails, setExtraDetails] = useState<Map<number, GameItemDetail>>(new Map())

  const raceId = toRaceId(character.race, character.gender)
  const { slotDatPaths } = useSlotDatPaths(slots, raceId, character.faceModelId)

  const ownedIds = useMemo(() => new Set(owned.map(o => o.itemId)), [owned])
  const unavailableSlots = useMemo(
    () => new Set(slots.filter(s => !ownedIds.has(s.itemId)).map(s => s.slot)),
    [slots, ownedIds])

  // Merge the page's itemCache with locally-fetched details so the equipment
  // panel's hover tooltip works for set items that aren't currently equipped.
  const mergedCache = useMemo(() => {
    const m = new Map(itemCache)
    extraDetails.forEach((v, k) => m.set(k, v))
    return m
  }, [itemCache, extraDetails])

  // Fetch detail for any set item missing from both caches (tooltip stat block).
  useEffect(() => {
    const missing = slots
      .map(s => s.itemId)
      .filter(id => id > 0 && !itemCache.has(id) && !extraDetails.has(id))
    if (missing.length === 0) return
    missing.forEach(id => {
      api<GameItemDetail>(`/api/items/${id}`)
        .then(d => setExtraDetails(prev => new Map(prev).set(id, d)))
        .catch(() => {})
    })
  }, [slots, itemCache, extraDetails])

  const upsertSlot = (slot: GearSetSlot) => {
    setSlots(prev => [...prev.filter(s => s.slot !== slot.slot), slot])
    setPickerSlot(null)
  }
  const clearSlot = (slotName: string) => {
    setSlots(prev => prev.filter(s => s.slot !== slotName))
    setPickerSlot(null)
  }

  const slotHasItem = (slotName: string | null) =>
    slotName != null && slots.some(s => s.slot === slotName)

  const fullscreenSlots = Array.from(slotDatPaths.entries())
    .map(([slotName, datPath]) => ({ slotId: FULLSCREEN_SLOT_IDS[slotName] ?? 0, datPath }))
    .filter(s => s.slotId > 0)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <input value={name} onChange={e => setName(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-200" />
        <input value={job} onChange={e => setJob(e.target.value)} placeholder="Job (optional)"
          className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-200 w-32" />
        <button onClick={() => onSave({ name, job: job || null, slots })}
          className="text-xs px-3 py-1.5 rounded bg-indigo-900/50 text-amber-200 border border-amber-700/40">Save</button>
        <button onClick={onCancel} className="text-xs px-3 py-1.5 text-gray-400">Cancel</button>
      </div>

      <div className="flex gap-4">
        <ModelViewer
          race={character.race}
          gender={character.gender}
          gear={slots}
          slotDatPaths={slotDatPaths}
          onRequestFullscreen={() => setFullscreen(true)}
          favoriteAnimation={character.favoriteAnimation}
          onSaveFavorite={onSaveFavorite}
        />
        <div className="w-[400px] flex-shrink-0">
          <EquipmentGrid
            gear={slots}
            onSlotClick={setPickerSlot}
            itemCache={mergedCache}
            unavailableSlots={unavailableSlots}
          />
        </div>
      </div>

      {pickerSlot && (
        <GearSetSlotPicker
          slotName={pickerSlot}
          ownedItems={owned}
          onSelect={upsertSlot}
          onClose={() => setPickerSlot(null)}
          onClear={slotHasItem(pickerSlot) ? () => clearSlot(pickerSlot) : undefined}
        />
      )}

      {fullscreen && (
        <FullscreenViewer
          race={character.race}
          gender={character.gender}
          characterName={character.name}
          server={character.server}
          slots={fullscreenSlots}
          onExit={() => setFullscreen(false)}
        />
      )}
    </div>
  )
}
