import type { GearSetSummary } from '../../../types/api'

export default function EquipInspector({ sets, selectedSetId, onChange }: {
  sets: GearSetSummary[]
  selectedSetId: number | null | undefined
  onChange: (setId: number) => void
}) {
  return (
    <div className="w-72 flex-none overflow-auto border-l border-gray-800 bg-gray-900 p-4">
      <h4 className="mb-1 text-[11px] uppercase tracking-wide text-gray-500">Equip Gear Set</h4>
      <label className="mb-1 block text-xs text-gray-400">Gear Set</label>
      <select
        value={selectedSetId ?? ''}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-sm text-gray-200">
        <option value="" disabled>— pick a set —</option>
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
