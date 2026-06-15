import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { api } from '../../api/client'
import { FFXI_JOBS } from '../../lib/jobs'
import { toRaceId, useSlotDatPaths } from '../../lib/model-mappings'
import ModelViewer from './ModelViewer'
import FullscreenViewer from './FullscreenViewer'
import EquipmentGrid from './EquipmentGrid'
import GearSetSlotPicker from './GearSetSlotPicker'
import type { CharacterDetail, OwnedEquipmentItem, GearSetSlot, GameItemDetail } from '../../types/api'
import { X } from 'lucide-react'
import { GEAR_SET_CATEGORIES } from '../../lib/gearSetCategories'

export interface WorkingSet {
  id: number | null
  name: string
  job: string
  category: string
  tags: string[]
  slots: GearSetSlot[]
}

interface Props {
  initial: WorkingSet
  character: CharacterDetail
  owned: OwnedEquipmentItem[]
  itemCache: Map<number, GameItemDetail>
  onSaveFavorite: (fav: { category: string; animationName: string; motionIndex: number } | null) => void
  knownTags: string[]
  onSave: (body: { name: string; job: string | null; category: string; tags: string[]; slots: GearSetSlot[] }) => Promise<void> | void
  onCancel: () => void
}

const FULLSCREEN_SLOT_IDS: Record<string, number> = {
  Face: 1, Head: 2, Body: 3, Hands: 4, Legs: 5, Feet: 6, Main: 7, Sub: 8, Range: 9,
}

export default function GearSetEditor({
  initial, character, owned, itemCache, knownTags, onSaveFavorite, onSave, onCancel,
}: Props) {
  const [name, setName] = useState(initial.name)
  // Drop any legacy free-text job that isn't a real FFXI job so the select opens on "— None —".
  const [job, setJob] = useState(
    (FFXI_JOBS as readonly string[]).includes(initial.job) ? initial.job : '')
  const [slots, setSlots] = useState<GearSetSlot[]>(initial.slots)
  const [category, setCategory] = useState(initial.category || 'Other')
  const [tags, setTags] = useState<string[]>(initial.tags ?? [])
  const [tagDraft, setTagDraft] = useState('')

  const addTag = (raw: string) => {
    const t = raw.trim()
    if (!t) return
    setTags(prev => prev.some(x => x.toLowerCase() === t.toLowerCase()) ? prev : [...prev, t])
    setTagDraft('')
  }
  const removeTag = (t: string) => setTags(prev => prev.filter(x => x !== t))

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [pickerSlot, setPickerSlot] = useState<string | null>(null)
  // Persists across slot picks; only applied when the set has a job (default on).
  const [jobFilter, setJobFilter] = useState(true)
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

  // Tracks detail fetches already in flight so rapid hovers don't double-fetch
  // (extraDetails in the closure is stale until the next render).
  const inFlight = useRef<Set<number>>(new Set())

  // Fetch the GameItemDetail for one item id into the shared cache if missing.
  // Used by both the slot prefetch below and the slot-picker hover tooltip.
  const ensureDetail = useCallback((id: number) => {
    if (id <= 0) return
    if (itemCache.has(id) || extraDetails.has(id) || inFlight.current.has(id)) return
    inFlight.current.add(id)
    api<GameItemDetail>(`/api/items/${id}`)
      .then(d => setExtraDetails(prev => new Map(prev).set(id, d)))
      .catch(() => {})
      .finally(() => { inFlight.current.delete(id) })
  }, [itemCache, extraDetails])

  // Prefetch detail for any set item so the equipment-panel tooltip has its stat block.
  useEffect(() => {
    slots.forEach(s => ensureDetail(s.itemId))
  }, [slots, ensureDetail])

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

  // Surface save failures inline (the parent unmounts this editor on success).
  const handleSave = async () => {
    setSaving(true)
    setSaveError(null)
    try {
      await onSave({ name, job: job || null, category, tags, slots })
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Failed to save gear set.')
      setSaving(false)
    }
  }

  const fullscreenSlots = Array.from(slotDatPaths.entries())
    .map(([slotName, datPath]) => ({ slotId: FULLSCREEN_SLOT_IDS[slotName] ?? 0, datPath }))
    .filter(s => s.slotId > 0)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <input value={name} onChange={e => setName(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-200" />
        <select value={job} onChange={e => setJob(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-200 w-32">
          <option value="">— None —</option>
          {FFXI_JOBS.map(j => <option key={j} value={j}>{j}</option>)}
        </select>
        <button onClick={handleSave} disabled={saving}
          className="text-xs px-3 py-1.5 rounded bg-indigo-900/50 text-amber-200 border border-amber-700/40 disabled:opacity-50">
          {saving ? 'Saving…' : 'Save'}</button>
        <button onClick={onCancel} className="text-xs px-3 py-1.5 text-gray-400">Cancel</button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <select value={category} onChange={e => setCategory(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-200">
          {GEAR_SET_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        {tags.map(t => (
          <span key={t} className="flex items-center gap-1 text-[10px] text-gray-300 px-1.5 py-0.5 rounded bg-gray-700/50">
            {t}
            <button onClick={() => removeTag(t)} className="text-gray-500 hover:text-rose-300" title="Remove tag">
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input list="gearset-tag-suggestions" value={tagDraft}
          onChange={e => setTagDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(tagDraft) } }}
          onBlur={() => addTag(tagDraft)}
          placeholder="Add tag…"
          className="w-28 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200" />
        <datalist id="gearset-tag-suggestions">
          {knownTags.filter(t => !tags.some(x => x.toLowerCase() === t.toLowerCase())).map(t => <option key={t} value={t} />)}
        </datalist>
      </div>

      {saveError && (
        <div className="text-xs text-rose-300 bg-rose-950/40 border border-rose-800/40 rounded px-3 py-2">
          {saveError}
        </div>
      )}

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
          job={job}
          jobFilter={jobFilter}
          onJobFilterChange={setJobFilter}
          onSelect={upsertSlot}
          onClose={() => setPickerSlot(null)}
          onClear={slotHasItem(pickerSlot) ? () => clearSlot(pickerSlot) : undefined}
          itemCache={mergedCache}
          onEnsureDetail={ensureDetail}
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
