// src/Vanalytics.Web/src/components/character/blueprint/CombineNode.tsx
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Layers } from 'lucide-react'

export interface CombineNodeData extends Record<string, unknown> {
  combineSetIds?: number[]
  // UI-only display names, parallel to combineSetIds.
  setNames?: (string | undefined)[]
}

export default function CombineNode({ data }: NodeProps) {
  const d = data as CombineNodeData
  const ids = d.combineSetIds ?? []
  return (
    <div className="rounded-lg border border-gray-700 bg-gray-900 shadow-lg min-w-[220px]">
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        style={{ top: 16, width: 10, height: 10, background: '#0d1117', border: '2px solid #c084fc' }}
      />
      <div className="flex items-center gap-2 rounded-t-lg bg-gradient-to-b from-purple-700 to-purple-900 px-3 py-1.5 text-xs font-bold text-purple-50">
        <Layers className="h-3.5 w-3.5" /> Combine
      </div>
      <div className="px-3 py-2 text-xs">
        {ids.length < 2 ? (
          <span className="text-gray-500">Add 2+ gear sets →</span>
        ) : (
          <ol className="space-y-0.5">
            {ids.map((id, i) => (
              <li key={i} className="flex items-center gap-1.5 text-gray-200">
                <span className="truncate">{d.setNames?.[i] ?? `#${id}`}</span>
                <span className="ml-auto rounded-full border border-purple-700/50 bg-purple-950/40 px-1.5 text-[9px] text-purple-200">
                  {i === 0 ? 'base' : 'overrides ↑'}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}
