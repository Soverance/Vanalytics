import type { MacroPageDetail, MacroDetail } from '../../api/macros'
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
  const positions = Array.from({ length: 10 }, (_, i) => i + 1)
  const totalPages = pages.length

  // Wrap page number for infinite scrolling
  const wrapPage = (n: number): number => {
    if (totalPages === 0) return 1
    return ((n - 1 + totalPages) % totalPages) + 1
  }

  const getMacro = (page: MacroPageDetail, set: 'Ctrl' | 'Alt', position: number): MacroDetail | null => {
    return page.macros.find(m => m.set === set && m.position === position) ?? null
  }

  // Horizontal 10x2 grid: row of 10 Ctrl macros, row of 10 Alt macros
  const renderGrid = (page: MacroPageDetail, isCurrent: boolean) => (
    <div>
      {/* Ctrl row */}
      <div className="flex items-center gap-1 mb-1">
        <span className="text-[10px] text-gray-500 w-7 text-right mr-1">Ctrl</span>
        {positions.map(pos => (
          <MacroCell
            key={`ctrl-${pos}`}
            macro={getMacro(page, 'Ctrl', pos)}
            isSelected={isCurrent && selectedMacro?.set === 'Ctrl' && selectedMacro.position === pos}
            onClick={() => isCurrent && onMacroSelect('Ctrl', pos)}
          />
        ))}
      </div>
      {/* Alt row */}
      <div className="flex items-center gap-1">
        <span className="text-[10px] text-gray-500 w-7 text-right mr-1">Alt</span>
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
  )

  return (
    <div className="flex flex-col items-center">
      {/* Page reel - vertical stack with 3D perspective */}
      <div className="relative" style={{ perspective: '600px' }}>
        {visibleOffsets.map(offset => {
          const pageNum = wrapPage(currentPage + offset)
          const page = pages.find(p => p.pageNumber === pageNum)
          if (!page) return null

          const isCurrent = offset === 0
          const absOffset = Math.abs(offset)
          const scale = 1 - absOffset * 0.12
          const opacity = isCurrent ? 1 : Math.max(0.1, 1 - absOffset * 0.4)
          const translateY = offset * 45
          const rotateX = offset * -6
          const zIndex = 10 - absOffset

          return (
            <div
              key={pageNum}
              className={`transition-all duration-300 ${isCurrent ? '' : 'cursor-pointer'}`}
              style={{
                transform: `translateY(${translateY}px) scale(${scale}) rotateX(${rotateX}deg)`,
                opacity,
                zIndex,
                position: isCurrent ? 'relative' : 'absolute',
                top: isCurrent ? undefined : '0',
                left: isCurrent ? undefined : '0',
                right: isCurrent ? undefined : '0',
                pointerEvents: isCurrent ? undefined : 'none',
              }}
            >
              {renderGrid(page, isCurrent)}
            </div>
          )
        })}
      </div>

      {/* Page navigation */}
      <div className="flex items-center gap-4 mt-4">
        <button
          onClick={() => onPageChange(wrapPage(currentPage - 1))}
          className="text-gray-400 hover:text-white text-sm px-2"
        >
          &uarr; Prev
        </button>
        <span className="text-gray-500 text-xs">Page {currentPage} / {totalPages}</span>
        <button
          onClick={() => onPageChange(wrapPage(currentPage + 1))}
          className="text-gray-400 hover:text-white text-sm px-2"
        >
          Next &darr;
        </button>
      </div>
    </div>
  )
}
