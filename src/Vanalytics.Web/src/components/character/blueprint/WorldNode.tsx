import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Globe } from 'lucide-react'
import { worldFace } from './blueprintGraph'

export interface WorldNodeData extends Record<string, unknown> {
  worldField?: 'weather' | 'day' | 'moghouse' | 'zone' | null
  worldValue?: string | null
  worldLabel?: string | null
}

export default function WorldNode({ data }: NodeProps) {
  const d = data as WorldNodeData
  return (
    <div className="rounded-lg border border-teal-800 bg-gray-900 shadow-lg min-w-[140px]">
      <div className="flex items-center gap-2 rounded-t-lg bg-gradient-to-b from-teal-700 to-teal-900 px-3 py-1.5 text-xs font-bold text-teal-50">
        <Globe className="h-3.5 w-3.5" /> {worldFace(d)}
      </div>
      <Handle type="source" position={Position.Right} id="out"
        style={{ top: 16, width: 10, height: 10, background: '#0d1117', border: '2px solid #2dd4bf' }} />
    </div>
  )
}
