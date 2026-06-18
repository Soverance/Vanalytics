import { useState } from 'react'
import { ClipboardPaste, Search } from 'lucide-react'
import type { BlueprintNodeType } from '../../../types/api'

const ITEMS: { type: BlueprintNodeType; label: string; group: string; color: string }[] = [
  { type: 'trigger:precast', label: 'precast', group: 'Triggers', color: '#b3344a' },
  { type: 'trigger:aftercast', label: 'aftercast', group: 'Triggers', color: '#b3344a' },
  { type: 'trigger:status_change', label: 'status_change', group: 'Triggers', color: '#b3344a' },
  { type: 'trigger:midcast', label: 'midcast', group: 'Triggers', color: '#b3344a' },
  { type: 'trigger:buff_change', label: 'buff_change', group: 'Triggers', color: '#b3344a' },
  { type: 'mode', label: 'Mode (set cycle)', group: 'Sets', color: '#34d399' },
  { type: 'equip', label: 'Equip Gear Set', group: 'Equip', color: '#6366f1' },
  { type: 'branch', label: 'Branch (if/else)', group: 'Flow Control', color: '#94a3b8' },
  { type: 'cond:buff', label: 'Condition: Buff active', group: 'Flow Control', color: '#34d399' },
  { type: 'cond:stat', label: 'Condition: HP/MP/TP', group: 'Flow Control', color: '#f59e0b' },
]

export default function NodePalette({ x, y, onPick, onClose, onPaste, filter }: {
  x: number; y: number
  onPick: (type: BlueprintNodeType) => void
  onClose: () => void
  onPaste?: () => void
  filter?: (type: BlueprintNodeType) => boolean
}) {
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const items = ITEMS.filter(i => (!filter || filter(i.type)) && (!q || i.label.toLowerCase().includes(q)))
  const groups = [...new Set(items.map(i => i.group))]
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
        <div className="min-h-0 flex-1 overflow-y-auto">
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
          {groups.map(g => (
            <div key={g}>
              <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wide text-gray-500">{g}</div>
              {items.filter(i => i.group === g).map(i => (
                <button key={i.type} onClick={() => onPick(i.type)}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-gray-200 hover:bg-gray-700">
                  <span className="h-2 w-2 rounded-sm" style={{ background: i.color }} /> {i.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
