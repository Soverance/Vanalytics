import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { listMacroBooks, getMacroBook, updateMacroBook } from '../api/macros'
import type { MacroBookSummary, MacroBookDetail } from '../api/macros'
import MacroPageReel from '../components/macros/MacroPageReel'
import MacroEditorPanel from '../components/macros/MacroEditorPanel'
import MacroHistoryPanel from '../components/macros/MacroHistoryPanel'
import { ApiError } from '../api/client'

export default function MacroEditorPage() {
  const { id } = useParams<{ id: string }>()
  const [books, setBooks] = useState<MacroBookSummary[]>([])
  const [selectedBook, setSelectedBook] = useState<MacroBookDetail | null>(null)
  const [selectedBookNumber, setSelectedBookNumber] = useState<number | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedMacro, setSelectedMacro] = useState<{ set: 'Ctrl' | 'Alt'; position: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showHistory, setShowHistory] = useState(false)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    listMacroBooks(id)
      .then(setBooks)
      .catch((err) => {
        if (err instanceof ApiError) setError(err.message)
        else setError('Failed to load macros')
      })
      .finally(() => setLoading(false))
  }, [id])

  const selectBook = async (bookNumber: number) => {
    if (!id) return
    setSelectedBookNumber(bookNumber)
    setSelectedMacro(null)
    setCurrentPage(1)
    setShowHistory(false)
    try {
      const detail = await getMacroBook(id, bookNumber)
      setSelectedBook(detail)
    } catch {
      setError('Failed to load macro book')
    }
  }

  if (loading) return <div className="p-6 text-gray-400">Loading macros...</div>
  if (error) return <div className="p-6 text-red-400">{error}</div>
  if (books.length === 0) {
    return (
      <div className="p-6 text-gray-400">
        <p>No macro data synced yet. Use the Windower addon to sync your macros.</p>
        <Link to={`/characters/${id}`} className="text-blue-400 hover:underline text-sm mt-2 block">
          Back to character
        </Link>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to={`/characters/${id}`} className="text-blue-400 hover:underline text-sm">
            &larr; Back
          </Link>
          <h2 className="text-lg font-medium text-gray-200">Macro Editor</h2>
        </div>
      </div>

      {/* Book selector — file cabinet tabs, 10 per row */}
      <div className="space-y-0">
        {[0, 1].map(row => (
          <div key={row} className="flex">
            {books.slice(row * 10, row * 10 + 10).map((book) => {
              const isSelected = selectedBookNumber === book.bookNumber
              return (
                <button
                  key={book.bookNumber}
                  onClick={() => selectBook(book.bookNumber)}
                  className={`relative px-3 py-1 text-xs transition-colors truncate border-t border-x -mb-px ${
                    isSelected
                      ? 'bg-gray-800 text-blue-400 border-gray-600 z-10 font-medium'
                      : book.isEmpty
                        ? 'bg-gray-900/60 text-gray-600 border-gray-800 hover:text-gray-400 hover:bg-gray-800/80'
                        : 'bg-gray-900 text-gray-400 border-gray-700 hover:text-gray-200 hover:bg-gray-800'
                  }`}
                  style={{
                    borderRadius: '6px 6px 0 0',
                    minWidth: '0',
                    flex: '1 1 0',
                    maxWidth: '110px',
                  }}
                >
                  <span className="truncate block">{book.bookTitle}</span>
                  {book.pendingPush && (
                    <span className="absolute top-0.5 right-1 w-1.5 h-1.5 rounded-full bg-yellow-400" title="Edited on web — waiting for addon to pull" />
                  )}
                </button>
              )
            })}
          </div>
        ))}
        <div className="border-b border-gray-700" />
        {selectedBookNumber && (
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="text-xs text-blue-400 hover:text-blue-300 ml-2"
          >
            {showHistory ? 'Close History' : 'History'}
          </button>
        )}
      </div>

      {/* Macro grid + editor */}
      {selectedBook ? (
        <div className="mt-14">
          <div className="flex gap-6 items-start justify-center">
            {/* Page reel with horizontal macro grid */}
            <div className="flex-shrink-0">
              <MacroPageReel
                pages={selectedBook.pages}
                currentPage={currentPage}
                onPageChange={setCurrentPage}
                selectedMacro={selectedMacro}
                onMacroSelect={(set, position) => setSelectedMacro({ set, position })}
              />
            </div>

            {/* History or Editor panel */}
            {showHistory && selectedBookNumber && id ? (
              <MacroHistoryPanel
                characterId={id}
                bookNumber={selectedBookNumber}
                onRestore={(detail) => {
                  setSelectedBook(detail)
                  listMacroBooks(id).then(setBooks)
                }}
                onClose={() => setShowHistory(false)}
              />
            ) : selectedMacro && (() => {
              const page = selectedBook.pages.find(p => p.pageNumber === currentPage)
              const macro = page?.macros.find(m => m.set === selectedMacro.set && m.position === selectedMacro.position)
              if (!macro) return null
              return (
                <MacroEditorPanel
                  macro={macro}
                  onSave={async (updated) => {
                    if (!id || !selectedBook) return
                    const updatedPages = selectedBook.pages.map(p => ({
                      pageNumber: p.pageNumber,
                      macros: p.macros.map(m =>
                        m.set === updated.set && m.position === updated.position && p.pageNumber === currentPage
                          ? updated
                          : m
                      ),
                    }))
                    try {
                      const result = await updateMacroBook(id, selectedBook.bookNumber, { pages: updatedPages })
                      setSelectedBook(result)
                      const updatedBooks = await listMacroBooks(id)
                      setBooks(updatedBooks)
                    } catch {
                      setError('Failed to save macro')
                    }
                  }}
                  onClose={() => setSelectedMacro(null)}
                />
              )
            })()}
          </div>
        </div>
      ) : (
        <div className="text-gray-500 text-sm py-8 text-center">Select a book above to view its macros.</div>
      )}
    </div>
  )
}
