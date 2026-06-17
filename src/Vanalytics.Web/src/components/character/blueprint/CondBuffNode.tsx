// src/Vanalytics.Web/src/components/character/blueprint/CondBuffNode.tsx
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Sparkles } from 'lucide-react'
import { condFace } from './blueprintGraph'

export interface CondBuffNodeData extends Record<string, unknown> { buffName?: string | null }

export default function CondBuffNode({ data }: NodeProps) {
  const d = data as CondBuffNodeData
  return (
    <div className="rounded-lg border border-emerald-800 bg-gray-900 shadow-lg min-w-[150px]">
      <div className="flex items-center gap-2 rounded-t-lg bg-gradient-to-b from-emerald-700 to-emerald-900 px-3 py-1.5 text-xs font-bold text-emerald-50">
        <Sparkles className="h-3.5 w-3.5" /> Buff active
      </div>
      <div className="px-3 py-2 text-xs text-gray-100">{condFace('cond:buff', d)}</div>
      <Handle type="source" position={Position.Right} id="out"
        style={{ top: 16, width: 10, height: 10, background: '#0d1117', border: '2px solid #34d399' }} />
    </div>
  )
}
