// src/Vanalytics.Web/src/components/character/blueprint/CondStatInspector.tsx
import { STAT_RESOURCES, STAT_OPS } from './blueprintGraph'

export default function CondStatInspector({ resource, op, value, onChange }: {
  resource: string | null | undefined
  op: string | null | undefined
  value: number | null | undefined
  onChange: (patch: { resource?: string; op?: string; value?: number }) => void
}) {
  return (
    <div className="w-72 flex-none overflow-auto border-l border-gray-800 bg-gray-900 p-4">
      <h4 className="mb-2 text-[11px] uppercase tracking-wide text-gray-500">Stat threshold</h4>
      <label className="mb-1 block text-xs text-gray-400">Stat</label>
      <select value={resource ?? 'hpp'} onChange={e => onChange({ resource: e.target.value })}
        className="mb-3 w-full rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-sm text-gray-200">
        {STAT_RESOURCES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
      </select>
      <label className="mb-1 block text-xs text-gray-400">Comparison</label>
      <select value={op ?? '<'} onChange={e => onChange({ op: e.target.value })}
        className="mb-3 w-full rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-sm text-gray-200">
        {STAT_OPS.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
      <label className="mb-1 block text-xs text-gray-400">Value</label>
      <input type="number" value={value ?? 0}
        onChange={e => onChange({ value: Math.trunc(Number(e.target.value)) })}
        className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-sm text-gray-200" />
      <p className="mt-3 text-[11px] text-gray-500">Generates <code className="text-gray-300">player.{resource ?? 'hpp'} {op ?? '<'} {value ?? 0}</code>.</p>
    </div>
  )
}
