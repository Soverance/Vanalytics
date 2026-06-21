import { Handle, Position, type NodeProps } from '@xyflow/react'
import { MessageCircle } from 'lucide-react'
import { printFace } from './blueprintGraph'

export interface PrintNodeData extends Record<string, unknown> {
  chatText?: string | null; chatColor?: number | null
}

// Friendly add_to_chat node — an exec statement node (exec in/out — chainable).
export default function PrintNode({ data }: NodeProps) {
  const d = data as PrintNodeData
  return (
    <div className="rounded-lg border border-pink-800 bg-gray-900 shadow-lg min-w-[150px]">
      <Handle type="target" position={Position.Left} id="in"
        style={{ top: 16, width: 10, height: 10, background: '#0d1117', border: '2px solid #f472b6' }} />
      <div className="flex items-center gap-2 rounded-t-lg bg-gradient-to-b from-pink-600 to-pink-900 px-3 py-1.5 text-xs font-bold text-pink-50">
        <MessageCircle className="h-3.5 w-3.5" /> Print to chat
      </div>
      <div className="px-3 py-1.5 text-[10px] text-gray-300 truncate">{printFace(d)}</div>
      <Handle type="source" position={Position.Right} id="out"
        style={{ top: 16, width: 10, height: 10, background: '#0d1117', border: '2px solid #f472b6' }} />
    </div>
  )
}
