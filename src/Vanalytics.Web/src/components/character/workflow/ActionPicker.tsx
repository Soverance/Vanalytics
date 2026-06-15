// src/Vanalytics.Web/src/components/character/workflow/ActionPicker.tsx
import { useMemo, useState } from 'react'
import { actionCatalog, type ActionCategory } from './workflowGraph'

const CATEGORY_LABEL: Record<ActionCategory, string> = {
  WeaponSkill: 'Weapon Skill', JobAbility: 'Job Ability', Magic: 'Magic', Buff: 'Buff',
}

export default function ActionPicker({ x, y, category, allowGeneric, disabledNames, onPick, onClose }: {
  x: number; y: number
  category: ActionCategory
  allowGeneric: boolean
  disabledNames: Set<string>
  onPick: (actionName: string | null) => void   // null = generic default
  onClose: () => void
}) {
  const [q, setQ] = useState('')
  const all = useMemo(() => actionCatalog(category), [category])
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const list = needle ? all.filter(a => a.name.toLowerCase().includes(needle)) : all
    return list.slice(0, 200)
  }, [all, q])

  return (
    <>
      <div className="fixed inset-0 z-10" onClick={onClose} />
      <div className="absolute z-20 w-64 overflow-hidden rounded-lg border border-gray-700 bg-gray-800 shadow-2xl"
        style={{ left: x, top: y }}>
        <input autoFocus value={q} onChange={e => setQ(e.target.value)}
          placeholder={`Search ${CATEGORY_LABEL[category]}…`}
          className="w-full border-b border-gray-700 bg-gray-900 px-3 py-2 text-xs text-gray-200 outline-none" />
        <div className="max-h-72 overflow-y-auto">
          {allowGeneric && (
          <button onClick={() => onPick(null)}
            className="flex w-full items-center gap-2 border-b border-gray-700/60 px-3 py-1.5 text-left text-xs font-semibold text-amber-200 hover:bg-gray-700">
            Any {CATEGORY_LABEL[category]} (default)
          </button>
          )}
          {rows.map(a => {
            const disabled = disabledNames.has(a.name)
            return (
              <button key={a.id} disabled={disabled} onClick={() => onPick(a.name)}
                className="flex w-full items-center px-3 py-1.5 text-left text-xs text-gray-200 hover:bg-gray-700 disabled:cursor-not-allowed disabled:text-gray-600 disabled:hover:bg-transparent">
                {a.label ?? a.name}{disabled ? ' ✓' : ''}
              </button>
            )
          })}
          {rows.length === 0 && <div className="px-3 py-2 text-xs text-gray-500">No matches.</div>}
        </div>
      </div>
    </>
  )
}
