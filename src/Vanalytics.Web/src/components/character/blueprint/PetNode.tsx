import { Handle, Position, type NodeProps } from '@xyflow/react'
import { PawPrint } from 'lucide-react'
import { petFace } from './blueprintGraph'

export interface PetNodeData extends Record<string, unknown> {
  petField?: 'exists' | 'status' | null
  petValue?: string | null
}

export default function PetNode({ data }: NodeProps) {
  const d = data as PetNodeData
  return (
    <div className="rounded-lg border border-orange-800 bg-gray-900 shadow-lg min-w-[140px]">
      <div className="flex items-center gap-2 rounded-t-lg bg-gradient-to-b from-orange-700 to-orange-900 px-3 py-1.5 text-xs font-bold text-orange-50">
        <PawPrint className="h-3.5 w-3.5" /> {petFace(d)}
      </div>
      <Handle type="source" position={Position.Right} id="out"
        style={{ top: 16, width: 10, height: 10, background: '#0d1117', border: '2px solid #fb923c' }} />
    </div>
  )
}
