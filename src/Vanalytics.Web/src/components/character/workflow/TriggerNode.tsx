// src/Vanalytics.Web/src/components/character/workflow/TriggerNode.tsx
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Zap } from 'lucide-react'
import { TRIGGER_DEFS } from './workflowGraph'
import type { WorkflowNodeType } from '../../../types/api'

export default function TriggerNode({ type }: NodeProps) {
  const def = TRIGGER_DEFS[type as Extract<WorkflowNodeType, `trigger:${string}`>]
  if (!def) return null
  return (
    <div className="rounded-lg border border-gray-700 bg-gray-900 shadow-lg min-w-[180px]">
      <div className="flex items-center gap-2 rounded-t-lg bg-gradient-to-b from-rose-700 to-rose-900 px-3 py-1.5 text-xs font-bold text-rose-50">
        <Zap className="h-3.5 w-3.5" /> {def.label}
      </div>
      {def.handles.map((h, i) => (
        <div key={h} className="relative border-t border-gray-800 px-3 py-1.5 text-right text-xs text-gray-300">
          {def.handleLabels[h]}
          <Handle
            type="source"
            position={Position.Right}
            id={h}
            style={{ top: 28 + i * 30, width: 10, height: 10, background: '#0d1117', border: '2px solid #d8b25e' }}
          />
        </div>
      ))}
    </div>
  )
}
