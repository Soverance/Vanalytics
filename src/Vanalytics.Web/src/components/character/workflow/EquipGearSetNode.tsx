// src/Vanalytics.Web/src/components/character/workflow/EquipGearSetNode.tsx
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Shield } from 'lucide-react'

export interface EquipNodeData extends Record<string, unknown> {
  gearSetId?: number | null
  setName?: string
  category?: string
  actionName?: string | null
}

export default function EquipGearSetNode({ data }: NodeProps) {
  const d = data as EquipNodeData
  return (
    <div className="rounded-lg border border-gray-700 bg-gray-900 shadow-lg min-w-[200px]">
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        style={{ top: 16, width: 10, height: 10, background: '#0d1117', border: '2px solid #d8b25e' }}
      />
      <div className="flex items-center gap-2 rounded-t-lg bg-gradient-to-b from-indigo-700 to-indigo-900 px-3 py-1.5 text-xs font-bold text-indigo-50">
        <Shield className="h-3.5 w-3.5" /> {d.actionName ?? 'Equip Gear Set'}
      </div>
      <div className="px-3 py-2 text-xs">
        {d.gearSetId != null ? (
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-gray-100">{d.setName ?? `#${d.gearSetId}`}</span>
            {d.category && (
              <span className="rounded-full border border-indigo-700/50 bg-indigo-950/40 px-1.5 text-[9px] text-indigo-200">
                {d.category}
              </span>
            )}
          </div>
        ) : (
          <span className="text-gray-500">Pick a gear set →</span>
        )}
      </div>
    </div>
  )
}
