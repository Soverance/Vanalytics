import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Wand } from 'lucide-react'
import { spellFace } from './blueprintGraph'

export interface SpellNodeData extends Record<string, unknown> {
  spellField?: 'name' | 'skill' | 'element' | 'contains' | 'bluCategory' | null
  spellValue?: string | null
}

export default function SpellNode({ data }: NodeProps) {
  const d = data as SpellNodeData
  return (
    <div className="rounded-lg border border-violet-800 bg-gray-900 shadow-lg min-w-[140px]">
      <div className="flex items-center gap-2 rounded-t-lg bg-gradient-to-b from-violet-700 to-violet-900 px-3 py-1.5 text-xs font-bold text-violet-50">
        <Wand className="h-3.5 w-3.5" /> {spellFace(d)}
      </div>
      <Handle type="source" position={Position.Right} id="out"
        style={{ top: 16, width: 10, height: 10, background: '#0d1117', border: '2px solid #a78bfa' }} />
    </div>
  )
}
