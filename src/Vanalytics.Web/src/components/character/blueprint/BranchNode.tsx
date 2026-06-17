// src/Vanalytics.Web/src/components/character/blueprint/BranchNode.tsx
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { GitBranch } from 'lucide-react'

const dot = { width: 10, height: 10, background: '#0d1117', border: '2px solid #d8b25e' }

export default function BranchNode(_: NodeProps) {
  return (
    <div className="rounded-lg border border-gray-700 bg-gray-900 shadow-lg min-w-[150px]">
      {/* exec in */}
      <Handle type="target" position={Position.Left} id="in" style={{ ...dot, top: 16 }} />
      {/* condition in (lower-left, distinct) */}
      <Handle type="target" position={Position.Left} id="cond" style={{ ...dot, top: 40, border: '2px solid #60a5fa' }} />
      <div className="flex items-center gap-2 rounded-t-lg bg-gradient-to-b from-slate-600 to-slate-800 px-3 py-1.5 text-xs font-bold text-slate-50">
        <GitBranch className="h-3.5 w-3.5" /> Branch
      </div>
      <div className="px-3 py-1 text-[10px] text-blue-300">condition →</div>
      <div className="relative border-t border-gray-800 px-3 py-1.5 text-right text-xs text-emerald-300">
        True
        <Handle type="source" position={Position.Right} id="true" style={dot} />
      </div>
      <div className="relative border-t border-gray-800 px-3 py-1.5 text-right text-xs text-rose-300">
        False
        <Handle type="source" position={Position.Right} id="false" style={dot} />
      </div>
    </div>
  )
}
