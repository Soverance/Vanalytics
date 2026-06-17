// src/Vanalytics.Web/src/components/character/blueprint/CondBuffInspector.tsx
import { useMemo, useState } from 'react'
import { actionCatalog, labelForAction } from './blueprintGraph'

export default function CondBuffInspector({ buffName, onChange }: {
  buffName: string | null | undefined
  onChange: (raw: string) => void   // stores the RAW en (e.g. "Sneak Attack")
}) {
  const [q, setQ] = useState('')
  const all = useMemo(() => actionCatalog('Buff'), [])
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const list = needle ? all.filter(a => (a.label ?? a.name).toLowerCase().includes(needle)) : all
    return list.slice(0, 200)
  }, [all, q])

  return (
    <div className="w-72 flex-none overflow-auto border-l border-gray-800 bg-gray-900 p-4">
      <h4 className="mb-1 text-[11px] uppercase tracking-wide text-gray-500">Buff active?</h4>
      <p className="mb-2 text-xs text-emerald-300">{buffName ? labelForAction(buffName) : 'Pick a buff to test for.'}</p>
      <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search buffs…"
        className="mb-2 w-full rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-sm text-gray-200 outline-none" />
      <div className="max-h-[60vh] overflow-y-auto rounded border border-gray-800">
        {rows.map(a => (
          <button key={a.id} onClick={() => onChange(a.name)}
            className={`flex w-full items-center px-3 py-1.5 text-left text-xs hover:bg-gray-700 ${a.name === buffName ? 'bg-gray-800 text-emerald-200' : 'text-gray-200'}`}>
            {a.label ?? a.name}{a.name === buffName ? ' ✓' : ''}
          </button>
        ))}
        {rows.length === 0 && <div className="px-3 py-2 text-xs text-gray-500">No matches.</div>}
      </div>
    </div>
  )
}
