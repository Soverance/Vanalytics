import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Sigma } from 'lucide-react'
import { compareFace } from './blueprintGraph'

export interface CompareNodeData extends Record<string, unknown> {
  resource?: string | null; op?: string | null; value?: number | null
}

export default function CompareNode({ data }: NodeProps) {
  const d = data as CompareNodeData
  return (
    <div className="rounded-lg border border-amber-800 bg-gray-900 shadow-lg min-w-[150px]">
      <Handle type="target" position={Position.Left} id="in"
        style={{ top: 16, width: 10, height: 10, background: '#0d1117', border: '2px solid #38bdf8' }} />
      <div className="flex items-center gap-2 rounded-t-lg bg-gradient-to-b from-amber-600 to-amber-800 px-3 py-1.5 text-xs font-bold text-amber-50">
        <Sigma className="h-3.5 w-3.5" /> Compare
      </div>
      <div className="px-3 py-2 text-xs text-gray-100">{compareFace(d)}</div>
      <Handle type="source" position={Position.Right} id="out"
        style={{ top: 16, width: 10, height: 10, background: '#0d1117', border: '2px solid #34d399' }} />
    </div>
  )
}
