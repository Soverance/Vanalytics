import { NodeResizer, useReactFlow, type NodeProps } from '@xyflow/react'
import { MessageSquare } from 'lucide-react'

export interface CommentNodeData extends Record<string, unknown> {
  text?: string | null; width?: number | null; height?: number | null
}

// A UE-style comment frame: a resizable, light-alpha white box that sits behind the real nodes
// (layered via displayNodes) to label/group a cluster. Free-text label is the one place the editor
// allows typing — it's documentation and never reaches codegen. No handles → never wired. The resize
// handles are always shown (not gated on selection) because a comment behind the nodes is hard to
// click-select first.
//
// NOTE: do NOT pass onResize→updateNodeData here. React Flow's resizer already updates node.width/
// height through its own dimensions change (and toGraph persists n.width/height). A manual
// updateNodeData on each resize tick reads a stale store node and dispatches a replace change that
// clobbers the width back, so the node never visibly resizes.
export default function CommentNode({ id, data, selected }: NodeProps) {
  const { updateNodeData } = useReactFlow()
  const d = data as CommentNodeData
  return (
    <div className="h-full w-full rounded-lg border-2 border-white/30 bg-white/5">
      <NodeResizer minWidth={160} minHeight={100} color="#e5e7eb" isVisible={!!selected} />
      <div className="flex items-center gap-1.5 border-b border-white/15 px-2 py-1">
        <MessageSquare className="h-3.5 w-3.5 flex-none text-white/60" />
        <input
          className="nodrag w-full bg-transparent text-xs font-semibold text-gray-100 placeholder-white/40 outline-none"
          value={d.text ?? ''} placeholder="Comment…"
          onChange={e => updateNodeData(id, { text: e.target.value })} />
      </div>
    </div>
  )
}
