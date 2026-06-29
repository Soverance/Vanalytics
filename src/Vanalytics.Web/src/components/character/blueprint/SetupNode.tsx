import { FileCode } from 'lucide-react'
import { type NodeProps } from '@xyflow/react'
import { setupFace } from './blueprintGraph'

export interface SetupNodeData extends Record<string, unknown> { code?: string | null }

// File-top setup escape hatch. Standalone (no handles, like the comment node): its raw Lua is emitted
// once before get_sets(). Singleton — the editor prevents a second one.
export default function SetupNode({ data }: NodeProps) {
  const d = data as SetupNodeData
  return (
    <div className="rounded-lg border border-yellow-800 bg-gray-900 shadow-lg min-w-[160px]">
      <div className="flex items-center gap-2 rounded-t-lg bg-gradient-to-b from-yellow-700 to-yellow-900 px-3 py-1.5 text-xs font-bold text-yellow-50">
        <FileCode className="h-3.5 w-3.5" /> Setup (file load)
      </div>
      <div className="px-3 py-1.5 font-mono text-[10px] text-gray-400 truncate">{setupFace(d)}</div>
    </div>
  )
}
