import EquipmentSlot from './EquipmentSlot'
import type { GearEntry } from '../../types/api'

const GRID_LAYOUT: string[][] = [
  ['Main', 'Sub', 'Range', 'Ammo'],
  ['Head', 'Body', 'Hands', 'Ear1'],
  ['Legs', 'Feet', 'Neck', 'Ear2'],
  ['Waist', 'Back', 'Ring1', 'Ring2'],
]

interface EquipmentGridProps {
  gear: GearEntry[]
  onSlotClick: (slotName: string) => void
}

export default function EquipmentGrid({ gear, onSlotClick }: EquipmentGridProps) {
  const gearBySlot = new Map(gear.map(g => [g.slot, g]))

  return (
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
          />
        ))}
      </div>
      <div className="text-center text-gray-600 text-[9px] mt-2">
        Click a slot to swap equipment
      </div>
    </div>
  )
}
