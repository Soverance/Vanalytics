// src/Vanalytics.Web/src/components/character/blueprint/ModeNode.tsx
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Repeat } from 'lucide-react'
import type { ModeMember } from '../../../types/api'

export interface ModeNodeData extends Record<string, unknown> {
  modeName?: string
  modeCommand?: string | null
  members?: ModeMember[]
  memberNames?: (string | undefined)[]   // UI-only display names, parallel to members
}

export default function ModeNode({ data }: NodeProps) {
  const d = data as ModeNodeData
  const name = d.modeName?.trim() || 'Mode'
  const command = d.modeCommand?.trim() || `cycle ${name} set`
  const members = d.members ?? []
  return (
    <div className="rounded-lg border border-gray-700 bg-gray-900 shadow-lg min-w-[220px]">
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        style={{ top: 16, width: 10, height: 10, background: '#0d1117', border: '2px solid #6ee7b7' }}
      />
      <div className="flex items-center gap-2 rounded-t-lg bg-gradient-to-b from-emerald-700 to-emerald-900 px-3 py-1.5 text-xs font-bold text-emerald-50">
        <Repeat className="h-3.5 w-3.5" /> Mode: {name}
      </div>
      <div className="px-3 py-2 text-xs">
        {members.length === 0 ? (
          <span className="text-gray-500">Add member sets →</span>
        ) : (
          <ol className="space-y-0.5">
            {members.map((m, i) => (
              <li key={i} className="flex items-center gap-1.5 text-gray-200">
                <span className="text-gray-500">{i + 1}.</span>
                <span className="truncate">{d.memberNames?.[i] ?? m.label ?? `#${m.gearSetId}`}</span>
                {i === 0 && (
                  <span className="rounded-full border border-emerald-700/50 bg-emerald-950/40 px-1.5 text-[9px] text-emerald-200">
                    default
                  </span>
                )}
              </li>
            ))}
          </ol>
        )}
        <div className="mt-2 border-t border-gray-800 pt-1.5 text-[10px] text-gray-400">
          ⌨ /console gs c {command}
        </div>
      </div>
    </div>
  )
}
