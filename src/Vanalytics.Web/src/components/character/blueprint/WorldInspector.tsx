import { useEffect, useMemo, useState } from 'react'
import { SPELL_ELEMENTS } from './blueprintGraph'

type Field = 'weather' | 'day' | 'moghouse' | 'zone'
interface ZoneEntry { id: number; name: string }

export default function WorldInspector({ field, value, label, onChange }: {
  field: Field
  value: string | null | undefined
  label: string | null | undefined
  onChange: (patch: { worldField?: Field; worldValue?: string | null; worldLabel?: string | null }) => void
}) {
  const [zones, setZones] = useState<ZoneEntry[]>([])
  const [zonesLoaded, setZonesLoaded] = useState(false)
  const [q, setQ] = useState('')

  useEffect(() => {
    if (field !== 'zone' || zonesLoaded) return
    fetch('/api/zones').then(r => r.json())
      .then((data: ZoneEntry[]) => setZones(data))
      .catch(() => setZones([]))
      .finally(() => setZonesLoaded(true))
  }, [field, zonesLoaded])

  useEffect(() => { setQ('') }, [field])

  const zoneRows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const list = needle ? zones.filter(z => z.name.toLowerCase().includes(needle)) : zones
    return list.slice(0, 200)
  }, [zones, q])

  return (
    <div className="w-72 flex-none overflow-auto border-l border-gray-800 bg-gray-900 p-4">
      <h4 className="mb-2 text-[11px] uppercase tracking-wide text-gray-500">World condition</h4>

      <label className="mb-1 block text-xs text-gray-400">Field</label>
      <select value={field}
        onChange={e => onChange({ worldField: e.target.value as Field, worldValue: null, worldLabel: null })}
        className="mb-3 w-full rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-sm text-gray-200">
        <option value="weather">Weather element</option>
        <option value="day">Day element</option>
        <option value="moghouse">In Mog House</option>
        <option value="zone">Zone</option>
      </select>

      {(field === 'weather' || field === 'day') && (
        <>
          <label className="mb-1 block text-xs text-gray-400">Element</label>
          <select value={value ?? ''} onChange={e => onChange({ worldValue: e.target.value || null })}
            className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-sm text-gray-200">
            <option value="">— choose —</option>
            {SPELL_ELEMENTS.map(el => <option key={el} value={el}>{el}</option>)}
          </select>
        </>
      )}

      {field === 'moghouse' && (
        <p className="text-xs text-gray-500">Fires while you're in your Mog House. No value needed.</p>
      )}

      {field === 'zone' && (
        <>
          <label className="mb-1 block text-xs text-gray-400">
            {label ? `Zone: ${label}` : 'Choose a zone'}
          </label>
          <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search zones…"
            className="mb-2 w-full rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-sm text-gray-200 outline-none" />
          <div className="max-h-72 overflow-y-auto rounded border border-gray-800">
            {!zonesLoaded && <div className="px-3 py-2 text-xs text-gray-500">Loading zones…</div>}
            {zonesLoaded && zoneRows.map(z => (
              <button key={z.id} onClick={() => onChange({ worldValue: String(z.id), worldLabel: z.name })}
                className={`flex w-full items-center px-3 py-1.5 text-left text-xs hover:bg-gray-700 ${String(z.id) === value ? 'text-teal-300' : 'text-gray-200'}`}>
                {z.name}{String(z.id) === value ? ' ✓' : ''}
              </button>
            ))}
            {zonesLoaded && zoneRows.length === 0 && <div className="px-3 py-2 text-xs text-gray-500">No matches.</div>}
          </div>
        </>
      )}
    </div>
  )
}
