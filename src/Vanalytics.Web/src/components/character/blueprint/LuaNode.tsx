import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Code2 } from 'lucide-react'
import { luaFace } from './blueprintGraph'

export interface LuaNodeData extends Record<string, unknown> { code?: string | null }

// In-event raw Lua, an exec statement node (exec in/out — chainable in wiring order).
export default function LuaNode({ data }: NodeProps) {
  const d = data as LuaNodeData
  return (
    <div className="rounded-lg border border-yellow-800 bg-gray-900 shadow-lg min-w-[150px]">
      <Handle type="target" position={Position.Left} id="in"
        style={{ top: 16, width: 10, height: 10, background: '#0d1117', border: '2px solid #eab308' }} />
      <div className="flex items-center gap-2 rounded-t-lg bg-gradient-to-b from-yellow-700 to-yellow-900 px-3 py-1.5 text-xs font-bold text-yellow-50">
        <Code2 className="h-3.5 w-3.5" /> Custom Lua
      </div>
      <div className="px-3 py-1.5 font-mono text-[10px] text-gray-400 truncate">{luaFace(d)}</div>
      <Handle type="source" position={Position.Right} id="out"
        style={{ top: 16, width: 10, height: 10, background: '#0d1117', border: '2px solid #eab308' }} />
    </div>
  )
}
