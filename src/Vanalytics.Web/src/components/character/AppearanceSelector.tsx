import { useEffect, useState } from 'react'
import { getFaceVariants, toRaceId } from '../../lib/model-mappings'
import {
  type AppearanceState,
  formatFaceLabel,
  genderOptions,
  isDefaultAppearance,
  stepFace,
} from './appearanceSelector'

interface AppearanceSelectorProps {
  race?: string
  value: AppearanceState
  defaultValue: AppearanceState
  onChange: (next: AppearanceState) => void
}

/**
 * Face/gender picker for the 3D model. Selection is pure view state — nothing
 * persists. Self-contained so a future character creator can reuse it as-is.
 */
export default function AppearanceSelector({ race, value, defaultValue, onChange }: AppearanceSelectorProps) {
  const genders = genderOptions(race)
  const raceId = toRaceId(race, value.gender)
  const [faces, setFaces] = useState<{ name: string; path: string }[]>([])

  useEffect(() => {
    let cancelled = false
    getFaceVariants(raceId).then(f => { if (!cancelled) setFaces(f) })
    return () => { cancelled = true }
  }, [raceId])

  const faceName = faces[value.faceModelId]?.name
  const step = (delta: 1 | -1) =>
    onChange({ ...value, faceModelId: stepFace(value.faceModelId, delta, faces.length) })

  return (
    <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-gray-400">
      {genders.length > 1 && (
        <div className="flex rounded border border-gray-700 overflow-hidden">
          {genders.map(g => (
            <button
              key={g}
              onClick={() => onChange({ gender: g, faceModelId: 0 })}
              className={`px-2.5 py-1 text-xs transition-colors ${
                value.gender === g
                  ? 'bg-gray-700 text-gray-100'
                  : 'bg-gray-900 text-gray-500 hover:text-gray-300'
              }`}
            >
              {g}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={() => step(-1)}
          disabled={faces.length === 0}
          aria-label="Previous face"
          className="rounded border border-gray-700 px-2 py-1 text-xs hover:bg-gray-800 disabled:opacity-40 transition-colors"
        >
          ‹
        </button>
        <span className="text-xs text-gray-300 min-w-[7rem] text-center">
          {faceName ? formatFaceLabel(faceName) : 'Face —'}
          {faces.length > 0 && (
            <span className="text-gray-500"> · {value.faceModelId + 1} of {faces.length}</span>
          )}
        </span>
        <button
          onClick={() => step(1)}
          disabled={faces.length === 0}
          aria-label="Next face"
          className="rounded border border-gray-700 px-2 py-1 text-xs hover:bg-gray-800 disabled:opacity-40 transition-colors"
        >
          ›
        </button>
      </div>

      {!isDefaultAppearance(value, defaultValue) && (
        <button
          onClick={() => onChange(defaultValue)}
          className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
        >
          Reset to memorial
        </button>
      )}
    </div>
  )
}
