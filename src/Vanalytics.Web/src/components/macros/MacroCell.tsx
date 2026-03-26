import type { MacroDetail } from '../../api/macros'

interface MacroCellProps {
  macro: MacroDetail | null
  isSelected: boolean
  onClick: () => void
}

export default function MacroCell({ macro, isSelected, onClick }: MacroCellProps) {
  const isEmpty = !macro || !macro.name
  return (
    <button
      onClick={onClick}
      title={macro?.line1 || undefined}
      className={`w-16 h-12 rounded border text-center text-[11px] transition-all flex flex-col items-center justify-center ${
        isSelected
          ? 'border-blue-400 bg-blue-900/40'
          : isEmpty
            ? 'border-gray-800 bg-gray-900/50 text-gray-700'
            : 'border-gray-700 bg-gray-800 text-gray-300 hover:border-gray-500'
      }`}
    >
      <span className="truncate w-full px-0.5 leading-tight">{isEmpty ? '--' : macro!.name}</span>
    </button>
  )
}
