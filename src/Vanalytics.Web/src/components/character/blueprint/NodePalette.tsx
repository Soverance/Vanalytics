import { useState } from 'react'
import { ClipboardPaste, Search, ChevronRight, ChevronDown } from 'lucide-react'
import type { BlueprintNodeType } from '../../../types/api'
import {
  buildPaletteGroups, isGroupExpanded, loadPaletteCollapse, savePaletteCollapse, DEFAULT_EXPANDED_GROUPS,
} from './paletteCatalog'

export default function NodePalette({ x, y, onPick, onClose, onPaste, filter }: {
  x: number; y: number
  onPick: (type: BlueprintNodeType, data?: Record<string, unknown>) => void
  onClose: () => void
  onPaste?: () => void
  filter?: (type: BlueprintNodeType) => boolean
}) {
  const [query, setQuery] = useState('')
  const [persisted, setPersisted] = useState<Record<string, boolean>>(() => loadPaletteCollapse())
  const q = query.trim().toLowerCase()
  const groups = buildPaletteGroups({ query, filter })
  // Buffs are search-only; tell the user how to reach them when Conditions is open with no query.
  const buffsAvailable = !filter || filter('buff')

  const toggleGroup = (group: string) => {
    setPersisted(prev => {
      const current = group in prev ? prev[group] : DEFAULT_EXPANDED_GROUPS.has(group)
      const next = { ...prev, [group]: !current }
      savePaletteCollapse(next)
      return next
    })
  }

  return (
    <>
      <div className="fixed inset-0 z-10" onClick={onClose} />
      <div className="absolute z-20 flex max-h-80 w-56 flex-col overflow-hidden rounded-lg border border-gray-700 bg-gray-800 shadow-2xl"
        style={{ left: x, top: y }}>
        <div className="flex items-center gap-1.5 border-b border-gray-700 px-2 py-1.5">
          <Search className="h-3.5 w-3.5 text-gray-500" />
          <input autoFocus value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Search…"
            className="w-full bg-transparent text-xs text-gray-200 placeholder-gray-500 outline-none" />
        </div>
        <div className="styled-scrollbar min-h-0 flex-1 overflow-y-auto">
          {onPaste && (
            <>
              <button onClick={onPaste}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-gray-200 hover:bg-gray-700">
                <ClipboardPaste className="h-3.5 w-3.5" /> Paste here
              </button>
              <div className="border-t border-gray-700" />
            </>
          )}
          {groups.length === 0 && (
            <div className="px-3 py-3 text-center text-[11px] text-gray-500">No matching nodes</div>
          )}
          {groups.map(({ group, items }) => {
            const expanded = isGroupExpanded({ group, query, persisted })
            return (
              <div key={group}>
                <button onClick={() => toggleGroup(group)}
                  className="flex w-full items-center gap-1 px-2 pt-2 pb-1 text-left text-[10px] uppercase tracking-wide text-gray-500 hover:text-gray-300">
                  {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  {group}
                </button>
                {expanded && items.map(i => (
                  <button key={i.key} onClick={() => onPick(i.type, i.data)}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-gray-200 hover:bg-gray-700">
                    <span className="h-2 w-2 rounded-sm" style={{ background: i.color }} /> {i.label}
                  </button>
                ))}
                {expanded && group === 'Conditions' && !q && buffsAvailable && (
                  <div className="px-3 pb-1 pl-7 text-[10px] text-gray-600">Buffs — type to search</div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}
