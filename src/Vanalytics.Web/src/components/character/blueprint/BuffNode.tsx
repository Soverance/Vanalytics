import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Sparkles } from 'lucide-react'
import { labelForAction } from './blueprintGraph'

export interface BuffNodeData extends Record<string, unknown> { buffName?: string | null }

export default function BuffNode({ data }: NodeProps) {
  const d = data as BuffNodeData
  return (
    <div className="rounded-lg border border-emerald-800 bg-gray-900 shadow-lg min-w-[140px]">
      <div className="flex items-center gap-2 rounded-t-lg bg-gradient-to-b from-emerald-700 to-emerald-900 px-3 py-1.5 text-xs font-bold text-emerald-50">
        <Sparkles className="h-3.5 w-3.5" /> {labelForAction(d.buffName) || 'Buff active'}
      </div>
      <Handle type="source" position={Position.Right} id="out"
        style={{ top: 16, width: 10, height: 10, background: '#0d1117', border: '2px solid #34d399' }} />
    </div>
  )
}
