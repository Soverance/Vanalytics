import { MacroPageDetail, MacroDetail } from '../../api/macros'
import MacroCell from './MacroCell'

interface MacroPageReelProps {
  pages: MacroPageDetail[]
  currentPage: number
  onPageChange: (page: number) => void
  selectedMacro: { set: 'Ctrl' | 'Alt'; position: number } | null
  onMacroSelect: (set: 'Ctrl' | 'Alt', position: number) => void
}

export default function MacroPageReel({ pages, currentPage, onPageChange, selectedMacro, onMacroSelect }: MacroPageReelProps) {
  const visibleOffsets = [-2, -1, 0, 1, 2]

  const getMacro = (page: MacroPageDetail, set: 'Ctrl' | 'Alt', position: number): MacroDetail | null => {
    return page.macros.find(m => m.set === set && m.position === position) ?? null
  }

  const renderGrid = (page: MacroPageDetail, isCurrent: boolean) => {
    const positions = Array.from({ length: 10 }, (_, i) => i + 1)
    return (
      <div className="flex gap-4">
        {/* Ctrl column */}
        <div>
          <div className="text-[10px] text-gray-500 text-center mb-1">Ctrl</div>
          <div className="flex flex-col gap-1">
            {positions.map(pos => (
              <MacroCell
                key={`ctrl-${pos}`}
                macro={getMacro(page, 'Ctrl', pos)}
                isSelected={isCurrent && selectedMacro?.set === 'Ctrl' && selectedMacro.position === pos}
                onClick={() => isCurrent && onMacroSelect('Ctrl', pos)}
              />
            ))}
          </div>
        </div>
        {/* Alt column */}
        <div>
          <div className="text-[10px] text-gray-500 text-center mb-1">Alt</div>
          <div className="flex flex-col gap-1">
            {positions.map(pos => (
              <MacroCell
                key={`alt-${pos}`}
                macro={getMacro(page, 'Alt', pos)}
                isSelected={isCurrent && selectedMacro?.set === 'Alt' && selectedMacro.position === pos}
                onClick={() => isCurrent && onMacroSelect('Alt', pos)}
              />
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ perspective: '800px' }}>
        {visibleOffsets.map(offset => {
          const pageNum = currentPage + offset
          const page = pages.find(p => p.pageNumber === pageNum)
          if (!page) return null

          const isCurrent = offset === 0
          const absOffset = Math.abs(offset)
          const scale = 1 - absOffset * 0.15
          const opacity = isCurrent ? 1 : Math.max(0.15, 1 - absOffset * 0.35)
          const translateY = offset * 60
          const rotateX = offset * -8
          const zIndex = 10 - absOffset

          return (
            <div
              key={pageNum}
              className={`transition-all duration-300 ${isCurrent ? '' : 'pointer-events-none'}`}
              style={{
                transform: `translateY(${translateY}px) scale(${scale}) rotateX(${rotateX}deg)`,
                opacity,
                zIndex,
                position: isCurrent ? 'relative' : 'absolute',
                top: isCurrent ? undefined : '0',
                left: isCurrent ? undefined : '0',
                right: isCurrent ? undefined : '0',
              }}
              onClick={() => !isCurrent && onPageChange(pageNum)}
            >
              {isCurrent && (
                <div className="text-xs text-gray-400 text-center mb-2">
                  Page {pageNum} of {pages.length}
                </div>
              )}
              {renderGrid(page, isCurrent)}
            </div>
          )
        })}
      </div>

      {/* Page navigation */}
      <div className="flex items-center gap-3 mt-4">
        <button
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage <= 1}
          className="text-gray-400 hover:text-white disabled:text-gray-700 text-sm"
        >
          Prev
        </button>
        <span className="text-gray-500 text-xs">{currentPage} / {pages.length}</span>
        <button
          onClick={() => onPageChange(Math.min(pages.length, currentPage + 1))}
          disabled={currentPage >= pages.length}
          className="text-gray-400 hover:text-white disabled:text-gray-700 text-sm"
        >
          Next
        </button>
      </div>
    </div>
  )
}
