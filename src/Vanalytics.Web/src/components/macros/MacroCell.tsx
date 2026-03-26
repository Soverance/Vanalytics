import { MacroDetail } from '../../api/macros'

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
      className={`w-20 h-16 rounded border text-center text-xs transition-all flex flex-col items-center justify-center gap-0.5 ${
        isSelected
          ? 'border-blue-400 bg-blue-900/40'
          : isEmpty
            ? 'border-gray-800 bg-gray-900/50 text-gray-700'
            : 'border-gray-700 bg-gray-800 text-gray-300 hover:border-gray-500'
      }`}
    >
      {macro && macro.icon > 0 && (
        <span className="text-[10px] text-gray-500">#{macro.icon}</span>
      )}
      <span className="truncate w-full px-1">{isEmpty ? '--' : macro!.name}</span>
    </button>
  )
}
