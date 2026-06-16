import type { BlueprintNodeType } from '../../../types/api'

const ITEMS: { type: BlueprintNodeType; label: string; group: string; color: string }[] = [
  { type: 'trigger:precast', label: 'precast', group: 'Triggers', color: '#b3344a' },
  { type: 'trigger:aftercast', label: 'aftercast', group: 'Triggers', color: '#b3344a' },
  { type: 'trigger:status_change', label: 'status_change', group: 'Triggers', color: '#b3344a' },
  { type: 'trigger:midcast', label: 'midcast', group: 'Triggers', color: '#b3344a' },
  { type: 'trigger:buff_change', label: 'buff_change', group: 'Triggers', color: '#b3344a' },
  { type: 'mode', label: 'Mode (set cycle)', group: 'Sets', color: '#34d399' },
]

export default function NodePalette({ x, y, onPick, onClose }: {
  x: number; y: number
  onPick: (type: BlueprintNodeType) => void
  onClose: () => void
}) {
  const groups = [...new Set(ITEMS.map(i => i.group))]
  return (
    <>
      <div className="fixed inset-0 z-10" onClick={onClose} />
      <div className="absolute z-20 w-56 overflow-hidden rounded-lg border border-gray-700 bg-gray-800 shadow-2xl"
        style={{ left: x, top: y }}>
        {groups.map(g => (
          <div key={g}>
            <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wide text-gray-500">{g}</div>
            {ITEMS.filter(i => i.group === g).map(i => (
              <button key={i.type} onClick={() => onPick(i.type)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-gray-200 hover:bg-gray-700">
                <span className="h-2 w-2 rounded-sm" style={{ background: i.color }} /> {i.label}
              </button>
            ))}
          </div>
        ))}
        <div className="border-t border-gray-700 px-3 py-1.5 text-[10px] text-gray-600">Conditions — coming soon</div>
      </div>
    </>
  )
}
