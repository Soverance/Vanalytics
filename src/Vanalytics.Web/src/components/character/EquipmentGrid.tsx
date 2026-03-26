import { useRef, useState } from 'react'
import EquipmentSlot from './EquipmentSlot'
import ItemPreviewBox from '../economy/ItemPreviewBox'
import type { GearEntry, GameItemDetail } from '../../types/api'

const GRID_LAYOUT: string[][] = [
  ['Main', 'Sub', 'Range', 'Ammo'],
  ['Head', 'Neck', 'Ear1', 'Ear2'],
  ['Body', 'Hands', 'Ring1', 'Ring2'],
  ['Back', 'Waist', 'Legs', 'Feet'],
]

interface EquipmentGridProps {
  gear: GearEntry[]
  onSlotClick: (slotName: string) => void
  itemCache: Map<number, GameItemDetail>
}

export default function EquipmentGrid({ gear, onSlotClick, itemCache }: EquipmentGridProps) {
  const gearBySlot = new Map(gear.map(g => [g.slot, g]))
  const [hoveredSlot, setHoveredSlot] = useState<string | null>(null)
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number } | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)

  const handleSlotHover = (slotName: string, element: HTMLElement | null) => {
    if (!element || !gridRef.current) {
      setHoveredSlot(null)
      setTooltipPos(null)
      return
    }
    const g = gearBySlot.get(slotName)
    if (!g || g.itemId === 0) {
      setHoveredSlot(null)
      setTooltipPos(null)
      return
    }
    const gridRect = gridRef.current.getBoundingClientRect()
    const slotRect = element.getBoundingClientRect()
    setHoveredSlot(slotName)
    setTooltipPos({
      top: slotRect.top - gridRect.top,
      left: slotRect.right - gridRect.left + 8,
    })
  }

  const hoveredGear = hoveredSlot ? gearBySlot.get(hoveredSlot) : null
  const hoveredItem = hoveredGear ? itemCache.get(hoveredGear.itemId) : null

  return (
    <div className="relative" ref={gridRef}>
      <div className="bg-gradient-to-b from-indigo-950/95 to-gray-950/95 border-2 border-amber-800/40 rounded-md p-4">
        <div className="text-center text-amber-200/70 text-xs tracking-[2px] uppercase mb-3 border-b border-amber-800/20 pb-2">
          Equipment
        </div>
        <div className="grid grid-cols-4 gap-1.5 justify-center">
          {GRID_LAYOUT.flat().map(slotName => (
            <EquipmentSlot
              key={slotName}
              slotName={slotName}
              gear={gearBySlot.get(slotName)}
              onClick={() => onSlotClick(slotName)}
              onHoverElement={(el) => handleSlotHover(slotName, el)}
            />
          ))}
        </div>
        <div className="text-center text-gray-600 text-[9px] mt-2">
          Click a slot to swap equipment
        </div>
      </div>

      {/* Tooltip */}
      {hoveredItem && tooltipPos && (
        <div
          className="absolute z-50 pointer-events-none"
          style={{ top: tooltipPos.top, left: tooltipPos.left }}
        >
          <ItemPreviewBox item={hoveredItem} />
        </div>
      )}
    </div>
  )
}
