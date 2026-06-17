// src/Vanalytics.Web/src/components/character/blueprint/CondStatNode.tsx
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Activity } from 'lucide-react'
import { condFace } from './blueprintGraph'

export interface CondStatNodeData extends Record<string, unknown> {
  resource?: string | null; op?: string | null; value?: number | null
}

export default function CondStatNode({ data }: NodeProps) {
  const d = data as CondStatNodeData
  return (
    <div className="rounded-lg border border-amber-800 bg-gray-900 shadow-lg min-w-[150px]">
      <div className="flex items-center gap-2 rounded-t-lg bg-gradient-to-b from-amber-600 to-amber-800 px-3 py-1.5 text-xs font-bold text-amber-50">
        <Activity className="h-3.5 w-3.5" /> Stat
      </div>
      <div className="px-3 py-2 text-xs text-gray-100">{condFace('cond:stat', d)}</div>
      <Handle type="source" position={Position.Right} id="out"
        style={{ top: 16, width: 10, height: 10, background: '#0d1117', border: '2px solid #f59e0b' }} />
    </div>
  )
}
