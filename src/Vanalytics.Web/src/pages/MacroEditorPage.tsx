import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { listMacroBooks, getMacroBook, updateMacroBook, MacroBookSummary, MacroBookDetail, MacroDetail } from '../api/macros'
import MacroPageReel from '../components/macros/MacroPageReel'
import MacroEditorPanel from '../components/macros/MacroEditorPanel'
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
    <div className="flex gap-4 p-4 h-full">
      {/* Book Selector */}
      <div className="w-48 flex-shrink-0 space-y-1">
        <Link to={`/characters/${id}`} className="text-blue-400 hover:underline text-sm mb-3 block">
          &larr; Back to character
        </Link>
        <h3 className="text-sm font-medium text-gray-300 mb-2">Macro Books</h3>
        {books.map((book) => (
          <button
            key={book.bookNumber}
            onClick={() => selectBook(book.bookNumber)}
            className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
              selectedBookNumber === book.bookNumber
                ? 'bg-blue-600 text-white'
                : book.isEmpty
                  ? 'text-gray-600 hover:bg-gray-800'
                  : 'text-gray-300 hover:bg-gray-800'
            }`}
          >
            <div className="flex items-center justify-between">
              <span>Book {book.bookNumber}</span>
              {book.pendingPush && <span className="w-2 h-2 rounded-full bg-yellow-400" title="Pending sync" />}
            </div>
            <div className="text-xs text-gray-500 truncate">{book.previewLabel}</div>
          </button>
        ))}
      </div>

      {/* Main Content - placeholder until Tasks 9-10 */}
      <div className="flex-1 min-w-0">
        {selectedBook ? (
          <div className="flex gap-6">
            <MacroPageReel
              pages={selectedBook.pages}
              currentPage={currentPage}
              onPageChange={setCurrentPage}
              selectedMacro={selectedMacro}
              onMacroSelect={(set, position) => setSelectedMacro({ set, position })}
            />
            {selectedMacro && selectedBook && (() => {
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
        ) : (
          <div className="text-gray-500 text-sm p-4">Select a macro book to view.</div>
        )}
      </div>
    </div>
  )
}
