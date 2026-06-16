import type { GearSetSummary } from '../../../types/api'
import { isFullSet } from './blueprintGraph'

export default function EquipInspector({
  sets, selectedSetId, onChange, actionContext,
  overlayIds, onAddOverlay, onRemoveOverlay, onMoveOverlay,
}: {
  sets: GearSetSummary[]
  selectedSetId: number | null | undefined
  onChange: (setId: number) => void
  actionContext?: string
  overlayIds: number[]
  onAddOverlay: (setId: number) => void
  onRemoveOverlay: (index: number) => void
  onMoveOverlay: (index: number, dir: -1 | 1) => void
}) {
  const setById = new Map(sets.map(s => [s.id, s]))
  return (
    <div className="w-72 flex-none overflow-auto border-l border-gray-800 bg-gray-900 p-4">
      <h4 className="mb-1 text-[11px] uppercase tracking-wide text-gray-500">Equip Gear Set</h4>
      {actionContext && <p className="mb-2 text-xs text-amber-300">{actionContext}</p>}
      <label className="mb-1 block text-xs text-gray-400">Base set</label>
      <select
        value={selectedSetId ?? ''}
        onChange={e => onChange(Number(e.target.value))}
        className="mb-3 w-full rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-sm text-gray-200">
        <option value="" disabled>— pick a set —</option>
        {sets.map(s => (
          <option key={s.id} value={s.id}>
            {s.name}{s.category && s.category !== 'Other' ? ` (${s.category})` : ''}
          </option>
        ))}
      </select>

      <label className="mb-1 block text-xs text-gray-400">Override layers (optional)</label>
      <p className="mb-2 text-[11px] text-gray-500">Each layer overrides the base (and layers above it). Use sparse sets.</p>
      <ol className="mb-2 space-y-1">
        {overlayIds.map((id, i) => {
          const s = setById.get(id)
          const full = isFullSet(s?.slotCount ?? 0)
          return (
            <li key={i} className="rounded border border-gray-800 bg-gray-800/60 px-2 py-1 text-xs text-gray-200">
              <div className="flex items-center gap-1">
                <span className="flex-1 truncate">{s?.name ?? `#${id}`}</span>
                <button onClick={() => onMoveOverlay(i, -1)} disabled={i === 0} className="px-1 text-gray-400 disabled:opacity-30">↑</button>
                <button onClick={() => onMoveOverlay(i, 1)} disabled={i === overlayIds.length - 1} className="px-1 text-gray-400 disabled:opacity-30">↓</button>
                <button onClick={() => onRemoveOverlay(i)} className="px-1 text-rose-300">✕</button>
              </div>
              {full && <p className="mt-0.5 text-[10px] text-amber-300">This full set replaces the layers above it.</p>}
            </li>
          )
        })}
      </ol>
      <select
        value=""
        onChange={e => { if (e.target.value) onAddOverlay(Number(e.target.value)) }}
        className="mb-3 w-full rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-sm text-gray-200">
        <option value="">— add a layer —</option>
        {sets.map(s => (
          <option key={s.id} value={s.id}>
            {s.name}{s.category && s.category !== 'Other' ? ` (${s.category})` : ''}
          </option>
        ))}
      </select>

      {sets.length === 0 && (
        <p className="mt-3 text-xs text-amber-300">
          This job has no gear sets yet. Create some on the character's Gear Sets tab first.
        </p>
      )}
    </div>
  )
}
