import { itemImageUrl } from '../../utils/imageUrl'
import type { GearEntry } from '../../types/api'

const VISUAL_SLOTS = new Set([
  'Main', 'Sub', 'Range', 'Head', 'Body', 'Hands', 'Legs', 'Feet'
])

interface EquipmentSlotProps {
  slotName: string
  gear?: GearEntry
  onClick: () => void
  onHoverElement?: (element: HTMLElement | null) => void
}

export default function EquipmentSlot({ slotName, gear, onClick, onHoverElement }: EquipmentSlotProps) {
  const isVisual = VISUAL_SLOTS.has(slotName)
  const isEmpty = !gear || gear.itemId === 0

  return (
    <button
      onClick={onClick}
      onMouseEnter={(e) => onHoverElement?.(e.currentTarget)}
      onMouseLeave={() => onHoverElement?.(null)}
      className={`
        flex flex-col items-center justify-center p-1.5 rounded cursor-pointer
        transition-colors duration-150
        ${isVisual
          ? 'border border-amber-700/50 hover:border-amber-500/70 bg-indigo-950/80'
          : 'border border-gray-700/40 hover:border-gray-500/50 bg-indigo-950/60'
        }
      `}
    >
      <div className="w-8 h-8 mb-0.5 flex items-center justify-center">
        {!isEmpty && gear?.itemId ? (
          <img
            src={itemImageUrl(`icons/${gear.itemId}.png`)}
            alt={gear.itemName}
            className="w-8 h-8"
            style={{ imageRendering: 'pixelated' }}
          />
        ) : (
          <div className="w-8 h-8 bg-gray-800/50 border border-gray-700/30 rounded-sm" />
        )}
      </div>
      <span className="text-[9px] text-gray-400/70 leading-tight">{slotName}</span>
      <span className="text-[8px] text-blue-300/70 leading-tight mt-0.5 max-w-[78px] truncate">
        {isEmpty ? '—' : gear!.itemName}
      </span>
    </button>
  )
}
