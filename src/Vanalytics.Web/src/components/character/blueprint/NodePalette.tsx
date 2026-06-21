import { useState } from 'react'
import { ClipboardPaste, Search } from 'lucide-react'
import type { BlueprintNodeType } from '../../../types/api'
import { VALUE_SOURCES } from './blueprintGraph'
import { BUFFS } from '../../../lib/buffs'

interface Item { key: string; type: BlueprintNodeType; label: string; group: string; color: string; data?: Record<string, unknown> }

const STATIC_ITEMS: Item[] = [
  { key: 'trigger:precast', type: 'trigger:precast', label: 'precast', group: 'Triggers', color: '#b3344a' },
  { key: 'trigger:aftercast', type: 'trigger:aftercast', label: 'aftercast', group: 'Triggers', color: '#b3344a' },
  { key: 'trigger:status_change', type: 'trigger:status_change', label: 'status_change', group: 'Triggers', color: '#b3344a' },
  { key: 'trigger:midcast', type: 'trigger:midcast', label: 'midcast', group: 'Triggers', color: '#b3344a' },
  { key: 'trigger:buff_change', type: 'trigger:buff_change', label: 'buff_change', group: 'Triggers', color: '#b3344a' },
  { key: 'trigger:pet_change', type: 'trigger:pet_change', label: 'pet_change', group: 'Pet Events', color: '#b3344a' },
  { key: 'trigger:pet_status_change', type: 'trigger:pet_status_change', label: 'pet_status_change', group: 'Pet Events', color: '#b3344a' },
  { key: 'trigger:pet_midcast', type: 'trigger:pet_midcast', label: 'pet_midcast', group: 'Pet Events', color: '#b3344a' },
  { key: 'trigger:pet_aftercast', type: 'trigger:pet_aftercast', label: 'pet_aftercast', group: 'Pet Events', color: '#b3344a' },
  { key: 'mode', type: 'mode', label: 'Mode (set cycle)', group: 'Sets', color: '#34d399' },
  { key: 'equip', type: 'equip', label: 'Equip Gear Set', group: 'Equip', color: '#6366f1' },
  { key: 'branch', type: 'branch', label: 'Branch (if/else)', group: 'Flow Control', color: '#94a3b8' },
  { key: 'op:and', type: 'op:and', label: 'AND', group: 'Flow Control', color: '#a78bfa' },
  { key: 'op:or', type: 'op:or', label: 'OR', group: 'Flow Control', color: '#a78bfa' },
  { key: 'op:not', type: 'op:not', label: 'NOT', group: 'Flow Control', color: '#a78bfa' },
  { key: 'op:compare', type: 'op:compare', label: 'Compare (≷)', group: 'Flow Control', color: '#f59e0b' },
  { key: 'spell', type: 'spell', label: 'Spell / Action is…', group: 'Flow Control', color: '#a78bfa' },
  { key: 'pet', type: 'pet', label: 'Pet state is…', group: 'Flow Control', color: '#fb923c' },
  { key: 'world', type: 'world', label: 'World state is…', group: 'Flow Control', color: '#2dd4bf' },
  ...VALUE_SOURCES.map(r => ({ key: `value:${r.value}`, type: 'value' as const, label: r.label, group: 'Values', color: '#38bdf8', data: { resource: r.value } })),
  { key: 'comment', type: 'comment', label: 'Comment', group: 'Annotation', color: '#e5e7eb' },
  { key: 'setup', type: 'setup', label: 'Setup (file load)', group: 'Setup', color: '#eab308' },
  { key: 'lua', type: 'lua', label: 'Custom Lua', group: 'Flow Control', color: '#eab308' },
  { key: 'print', type: 'print', label: 'Print to chat', group: 'Flow Control', color: '#f472b6' },
]

const BUFF_ITEMS: Item[] = BUFFS.map(b => ({ key: `buff:${b.id}`, type: 'buff' as const, label: b.label, group: 'Buffs', color: '#34d399', data: { buffName: b.name } }))

export default function NodePalette({ x, y, onPick, onClose, onPaste, filter }: {
  x: number; y: number
  onPick: (type: BlueprintNodeType, data?: Record<string, unknown>) => void
  onClose: () => void
  onPaste?: () => void
  filter?: (type: BlueprintNodeType) => boolean
}) {
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  // Buffs are a huge catalog — only surface them once the user searches, to keep the menu snappy.
  const pool = q ? [...STATIC_ITEMS, ...BUFF_ITEMS] : STATIC_ITEMS
  const items = pool.filter(i => (!filter || filter(i.type)) && (!q || i.label.toLowerCase().includes(q)))
  const groups = [...new Set(items.map(i => i.group))]
  const buffsAvailable = !filter || filter('buff')
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
                <button key={i.key} onClick={() => onPick(i.type, i.data)}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-gray-200 hover:bg-gray-700">
                  <span className="h-2 w-2 rounded-sm" style={{ background: i.color }} /> {i.label}
                </button>
              ))}
            </div>
          ))}
          {!q && buffsAvailable && (
            <div className="px-3 pt-2 pb-2 text-[10px] uppercase tracking-wide text-gray-500">
              Buffs — type to search
            </div>
          )}
        </div>
      </div>
    </>
  )
}
