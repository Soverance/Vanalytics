import { useEffect, useMemo, useState } from 'react'
import { allActionsCatalog, SPELL_SKILLS, SPELL_ELEMENTS, SPELL_FAMILIES, familyMatchCount, SPELL_BLU_CATEGORIES, bluCategoryMembers } from './blueprintGraph'

type Field = 'name' | 'skill' | 'element' | 'contains' | 'bluCategory'

export default function SpellInspector({ field, value, onChange }: {
  field: Field
  value: string | null | undefined
  onChange: (patch: { spellField?: Field; spellValue?: string | null }) => void
}) {
  const [q, setQ] = useState('')
  useEffect(() => { setQ('') }, [field])
  const actions = useMemo(() => allActionsCatalog(), [])
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const list = needle ? actions.filter(a => a.name.toLowerCase().includes(needle)) : actions
    return list.slice(0, 200)
  }, [actions, q])

  return (
    <div className="w-72 flex-none overflow-auto border-l border-gray-800 bg-gray-900 p-4">
      <h4 className="mb-2 text-[11px] uppercase tracking-wide text-gray-500">Spell condition</h4>

      <label className="mb-1 block text-xs text-gray-400">Field</label>
      <select value={field} onChange={e => onChange({ spellField: e.target.value as Field, spellValue: null })}
        className="mb-3 w-full rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-sm text-gray-200">
        <option value="name">Action name</option>
        <option value="skill">Spell skill</option>
        <option value="element">Spell element</option>
        <option value="contains">Name contains</option>
        <option value="bluCategory">BLU category</option>
      </select>

      {field === 'name' && (
        <>
          <label className="mb-1 block text-xs text-gray-400">
            {value ? `Action: ${value}` : 'Choose an action'}
          </label>
          <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search WS / JA / spell…"
            className="mb-2 w-full rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-sm text-gray-200 outline-none" />
          <div className="max-h-72 overflow-y-auto rounded border border-gray-800">
            {rows.map((a, i) => (
              <button key={`${a.id}-${i}`} onClick={() => onChange({ spellValue: a.name })}
                className={`flex w-full items-center px-3 py-1.5 text-left text-xs hover:bg-gray-700 ${a.name === value ? 'text-violet-300' : 'text-gray-200'}`}>
                {a.name}{a.name === value ? ' ✓' : ''}
              </button>
            ))}
            {rows.length === 0 && <div className="px-3 py-2 text-xs text-gray-500">No matches.</div>}
          </div>
        </>
      )}

      {field === 'skill' && (
        <>
          <label className="mb-1 block text-xs text-gray-400">Skill</label>
          <select value={value ?? ''} onChange={e => onChange({ spellValue: e.target.value || null })}
            className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-sm text-gray-200">
            <option value="">— choose —</option>
            {SPELL_SKILLS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </>
      )}

      {field === 'element' && (
        <>
          <label className="mb-1 block text-xs text-gray-400">Element</label>
          <select value={value ?? ''} onChange={e => onChange({ spellValue: e.target.value || null })}
            className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-sm text-gray-200">
            <option value="">— choose —</option>
            {SPELL_ELEMENTS.map(el => <option key={el} value={el}>{el}</option>)}
          </select>
        </>
      )}

      {field === 'contains' && (
        <>
          <label className="mb-1 block text-xs text-gray-400">Family</label>
          <select value={value ?? ''} onChange={e => onChange({ spellValue: e.target.value || null })}
            className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-sm text-gray-200">
            <option value="">— choose —</option>
            {SPELL_FAMILIES.map(f => (
              <option key={f.value} value={f.value}>{f.label} ({familyMatchCount(f.value)})</option>
            ))}
          </select>
        </>
      )}
      {field === 'bluCategory' && (
        <>
          <label className="mb-1 block text-xs text-gray-400">BLU category</label>
          <select value={value ?? ''} onChange={e => onChange({ spellValue: e.target.value || null })}
            className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-sm text-gray-200">
            <option value="">— choose —</option>
            {SPELL_BLU_CATEGORIES.map(c => (
              <option key={c} value={c}>{c} ({bluCategoryMembers(c).length})</option>
            ))}
          </select>
          {value && (
            <p className="mt-2 text-[11px] leading-snug text-gray-500">
              matches {bluCategoryMembers(value).length}: {bluCategoryMembers(value).slice(0, 8).join(', ')}
              {bluCategoryMembers(value).length > 8 ? ', …' : ''}
            </p>
          )}
        </>
      )}
    </div>
  )
}
