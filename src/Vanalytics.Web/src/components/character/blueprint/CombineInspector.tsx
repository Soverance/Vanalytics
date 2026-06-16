// src/Vanalytics.Web/src/components/character/blueprint/CombineInspector.tsx
import type { GearSetSummary } from '../../../types/api'
import { isFullSet } from './blueprintGraph'

export default function CombineInspector({
  sets, ids, onAdd, onRemove, onMove,
}: {
  sets: GearSetSummary[]
  ids: number[]
  onAdd: (setId: number) => void
  onRemove: (index: number) => void
  onMove: (index: number, dir: -1 | 1) => void
}) {
  const setById = new Map(sets.map(s => [s.id, s]))
  return (
    <div className="w-72 flex-none overflow-auto border-l border-gray-800 bg-gray-900 p-4">
      <h4 className="mb-1 text-[11px] uppercase tracking-wide text-gray-500">Combine</h4>
      <p className="mb-3 text-[11px] text-gray-500">Lower rows override upper rows. Use sparse sets (only the slots you want to swap) as override layers.</p>

      <label className="mb-1 block text-xs text-gray-400">Layers (top = base)</label>
      {ids.length < 2 && <p className="mb-2 text-xs text-amber-300">Add at least 2 gear sets.</p>}
      <ol className="mb-2 space-y-1">
        {ids.map((id, i) => {
          const s = setById.get(id)
          const slotCount = s?.slotCount ?? 0
          const full = i > 0 && isFullSet(slotCount)
          return (
            <li key={i} className="rounded border border-gray-800 bg-gray-800/60 px-2 py-1 text-xs text-gray-200">
              <div className="flex items-center gap-1">
                <span className="flex-1 truncate">{s?.name ?? `#${id}`}</span>
                {i === 0 && <span className="rounded-full border border-purple-700/50 bg-purple-950/40 px-1.5 text-[9px] text-purple-200">base</span>}
                <button onClick={() => onMove(i, -1)} disabled={i === 0} className="px-1 text-gray-400 disabled:opacity-30">↑</button>
                <button onClick={() => onMove(i, 1)} disabled={i === ids.length - 1} className="px-1 text-gray-400 disabled:opacity-30">↓</button>
                <button onClick={() => onRemove(i)} className="px-1 text-rose-300">✕</button>
              </div>
              {full && <p className="mt-0.5 text-[10px] text-amber-300">This full set replaces the layers above it.</p>}
            </li>
          )
        })}
      </ol>

      <label className="mb-1 block text-xs text-gray-400">Add a layer</label>
      <select
        value=""
        onChange={e => { if (e.target.value) onAdd(Number(e.target.value)) }}
        className="mb-3 w-full rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-sm text-gray-200">
        <option value="">— add a set —</option>
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
