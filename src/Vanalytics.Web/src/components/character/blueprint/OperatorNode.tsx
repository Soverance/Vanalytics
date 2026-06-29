import { Handle, Position, type NodeProps } from '@xyflow/react'

const dot = { width: 10, height: 10, background: '#0d1117', border: '2px solid #34d399' }
const LABEL: Record<string, string> = { 'op:and': 'AND', 'op:or': 'OR', 'op:not': 'NOT' }

export default function OperatorNode({ type }: NodeProps) {
  const unary = type === 'op:not'
  return (
    <div className="rounded-lg border border-violet-800 bg-gray-900 shadow-lg min-w-[90px]">
      {unary
        ? <Handle type="target" position={Position.Left} id="in" style={{ ...dot, top: 16 }} />
        : <>
            <Handle type="target" position={Position.Left} id="a" style={{ ...dot, top: 14 }} />
            <Handle type="target" position={Position.Left} id="b" style={{ ...dot, top: 32 }} />
          </>}
      <div className="rounded-t-lg bg-gradient-to-b from-violet-700 to-violet-900 px-3 py-1.5 text-center text-xs font-bold text-violet-50">
        {LABEL[type ?? ''] ?? 'OP'}
      </div>
      <div className="py-1" />
      <Handle type="source" position={Position.Right} id="out" style={{ ...dot, top: 16 }} />
    </div>
  )
}
