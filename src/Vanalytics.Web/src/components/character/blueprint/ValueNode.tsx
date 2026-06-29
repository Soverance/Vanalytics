import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Gauge } from 'lucide-react'
import { statResourceLabel } from './blueprintGraph'

export interface ValueNodeData extends Record<string, unknown> { resource?: string | null }

export default function ValueNode({ data }: NodeProps) {
  const d = data as ValueNodeData
  return (
    <div className="rounded-lg border border-sky-800 bg-gray-900 shadow-lg min-w-[120px]">
      <div className="flex items-center gap-2 rounded-t-lg bg-gradient-to-b from-sky-700 to-sky-900 px-3 py-1.5 text-xs font-bold text-sky-50">
        <Gauge className="h-3.5 w-3.5" /> {statResourceLabel(d.resource)}
      </div>
      <Handle type="source" position={Position.Right} id="out"
        style={{ top: 16, width: 10, height: 10, background: '#0d1117', border: '2px solid #38bdf8' }} />
    </div>
  )
}
