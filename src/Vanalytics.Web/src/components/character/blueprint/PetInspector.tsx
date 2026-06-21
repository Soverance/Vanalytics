import { PET_STATUSES } from './blueprintGraph'

type Field = 'exists' | 'status'

export default function PetInspector({ field, value, onChange }: {
  field: Field
  value: string | null | undefined
  onChange: (patch: { petField?: Field; petValue?: string | null }) => void
}) {
  return (
    <div className="w-72 flex-none overflow-auto border-l border-gray-800 bg-gray-900 p-4">
      <h4 className="mb-2 text-[11px] uppercase tracking-wide text-gray-500">Pet condition</h4>

      <label className="mb-1 block text-xs text-gray-400">Field</label>
      <select value={field} onChange={e => onChange({ petField: e.target.value as Field, petValue: null })}
        className="mb-3 w-full rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-sm text-gray-200">
        <option value="exists">Pet exists</option>
        <option value="status">Pet status</option>
      </select>

      {field === 'status' && (
        <>
          <label className="mb-1 block text-xs text-gray-400">Status</label>
          <select value={value ?? ''} onChange={e => onChange({ petValue: e.target.value || null })}
            className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-sm text-gray-200">
            <option value="">— choose —</option>
            {PET_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </>
      )}
    </div>
  )
}
