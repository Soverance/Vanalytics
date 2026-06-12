import { useState, useEffect, useMemo, useRef } from 'react'
import { ArrowLeft } from 'lucide-react'
import { api } from '../../api/client'
import { toRaceId, useSlotDatPaths } from '../../lib/model-mappings'
import ModelViewer from './ModelViewer'
import EquipmentGrid from './EquipmentGrid'
import { categoryLabel } from '../../lib/gearSetCategories'
import type { CharacterDetail, GearEntry, GearSetDetail, GameItemDetail } from '../../types/api'

interface Props {
  detail: GearSetDetail
  character: CharacterDetail
  pageItemCache: Map<number, GameItemDetail>
  onClose: () => void
}

export default function GearSetReadOnlyView({ detail, character, pageItemCache, onClose }: Props) {
  const [extraDetails, setExtraDetails] = useState<Map<number, GameItemDetail>>(new Map())
  // Tracks item ids that are already fetched or currently in-flight to prevent duplicate requests.
  const fetchedIds = useRef<Set<number>>(new Set())

  // Fetch item details for any slot item not already in the page's itemCache.
  useEffect(() => {
    const missing = detail.slots
      .map(s => s.itemId)
      .filter(id => id > 0 && !pageItemCache.has(id) && !fetchedIds.current.has(id))
    if (missing.length === 0) return
    missing.forEach(id => {
      fetchedIds.current.add(id)
      api<GameItemDetail>(`/api/items/${id}`)
        .then(d => setExtraDetails(prev => new Map(prev).set(id, d)))
        .catch(() => {})
    })
  }, [detail.slots, pageItemCache])

  // Merge the page's itemCache with locally-fetched details.
  const itemCache = useMemo(() => {
    const m = new Map(pageItemCache)
    extraDetails.forEach((v, k) => m.set(k, v))
    return m
  }, [pageItemCache, extraDetails])

  // GearSetSlot and GearEntry are structurally identical — cast directly.
  const gear = detail.slots as GearEntry[]

  // 3D model support: compute DAT paths from set slots + character race/gender/face.
  const raceId = toRaceId(character.race, character.gender)
  const { slotDatPaths } = useSlotDatPaths(gear, raceId, character.faceModelId)

  return (
    <div className="space-y-4">
      {/* Header row: back button + set metadata */}
      <div className="flex items-start gap-3">
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded bg-gray-800/60 text-gray-300 border border-gray-700/40 hover:text-gray-100 flex-shrink-0"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center flex-wrap gap-2">
            <span className="text-sm font-medium text-gray-200">{detail.name}</span>
            {detail.job && (
              <span className="text-[10px] text-amber-300/70 px-1.5 py-0.5 rounded bg-indigo-900/40">
                {detail.job}
              </span>
            )}
            <span className="text-[10px] text-sky-300/70 px-1.5 py-0.5 rounded bg-sky-900/30">
              {categoryLabel(detail.category)}
            </span>
            {detail.tags.map(t => (
              <span key={t} className="text-[10px] text-gray-400 px-1.5 py-0.5 rounded bg-gray-700/40">
                {t}
              </span>
            ))}
          </div>
          <div className="text-[10px] text-gray-500 mt-0.5">
            {detail.slots.length} slot{detail.slots.length !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      {/* Equipment grid + 3D model viewer */}
      <div className="flex gap-4">
        <ModelViewer
          race={character.race}
          gender={character.gender}
          gear={gear}
          slotDatPaths={slotDatPaths}
          favoriteAnimation={character.favoriteAnimation}
        />
        <div className="w-[400px] flex-shrink-0">
          <EquipmentGrid
            gear={gear}
            onSlotClick={() => {}}
            itemCache={itemCache}
            readOnly
          />
        </div>
      </div>
    </div>
  )
}
