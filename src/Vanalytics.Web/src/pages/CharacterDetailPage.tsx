import { useState, useEffect } from 'react'
import { useParams, Link, useSearchParams } from 'react-router-dom'
import { api } from '../api/client'
import type { CharacterDetail, GearEntry, GameItemSummary, GameItemDetail } from '../types/api'
import { listMacroBooks, getMacroBook, updateMacroBook } from '../api/macros'
import type { MacroBookSummary, MacroBookDetail } from '../api/macros'
import LoadingSpinner from '../components/LoadingSpinner'
import JobsGrid from '../components/JobsGrid'
import CraftingTable from '../components/CraftingTable'
import ModelViewer from '../components/character/ModelViewer'
import { useSlotDatPaths, toRaceId } from '../lib/model-mappings'
import EquipmentGrid from '../components/character/EquipmentGrid'
import StatusPanel from '../components/character/StatusPanel'
import EquipmentSwapModal from '../components/character/EquipmentSwapModal'
import FullscreenViewer from '../components/character/FullscreenViewer'
import InventoryTab from '../components/character/InventoryTab'
import RelicsTab from '../components/character/RelicsTab'
import MacroPageReel from '../components/macros/MacroPageReel'
import MacroEditorPanel from '../components/macros/MacroEditorPanel'
import MacroHistoryPanel from '../components/macros/MacroHistoryPanel'
import SessionsTab from '../components/session/SessionsTab'
import { ApiError } from '../api/client'
import CharacterProfileHeader from '../components/character/CharacterProfileHeader'

const STAT_TABS = ['Jobs', 'Crafting', 'Relics'] as const
type StatTab = typeof STAT_TABS[number]

const GEAR_TABS = ['Equipment', 'Inventory', 'Macros', 'Sessions'] as const
type GearTab = typeof GEAR_TABS[number]

export default function CharacterDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const initialGearTab = (searchParams.get('tab') as GearTab) || 'Equipment'
  const [character, setCharacter] = useState<CharacterDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [swapSlot, setSwapSlot] = useState<string | null>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const [localGear, setLocalGear] = useState<GearEntry[]>([])
  const [activeTab, setActiveTab] = useState<StatTab>('Jobs')
  const [gearTab, setGearTab] = useState<GearTab>(initialGearTab)
  const [itemCache, setItemCache] = useState<Map<number, GameItemDetail>>(new Map())

  // Macro state
  const [macroBooks, setMacroBooks] = useState<MacroBookSummary[]>([])
  const [selectedBook, setSelectedBook] = useState<MacroBookDetail | null>(null)
  const [selectedBookNumber, setSelectedBookNumber] = useState<number | null>(null)
  const [currentMacroPage, setCurrentMacroPage] = useState(1)
  const [selectedMacro, setSelectedMacro] = useState<{ set: 'Ctrl' | 'Alt'; position: number } | null>(null)
  const [macroError, setMacroError] = useState('')
  const [showMacroHistory, setShowMacroHistory] = useState(false)
  const [showShareModal, setShowShareModal] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setCharacter(null)
    setLoading(true)
    api<CharacterDetail>(`/api/characters/${id}`)
      .then(setCharacter)
      .catch(() => setCharacter(null))
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    if (character?.gear) setLocalGear(character.gear)
  }, [character?.gear])

  // Pre-fetch item details for all equipped items
  useEffect(() => {
    const ids = localGear.filter(g => g.itemId > 0).map(g => g.itemId)
    const uncached = ids.filter(id => !itemCache.has(id))
    if (uncached.length === 0) return
    uncached.forEach(id => {
      api<GameItemDetail>(`/api/items/${id}`)
        .then(item => {
          setItemCache(prev => new Map(prev).set(id, item))
        })
        .catch(() => {})
    })
  }, [localGear])

  // Load macro books when switching to Macros tab
  useEffect(() => {
    if (gearTab !== 'Macros' || !id) return
    if (macroBooks.length > 0) return // already loaded
    listMacroBooks(id)
      .then(setMacroBooks)
      .catch((err) => {
        if (err instanceof ApiError) setMacroError(err.message)
        else setMacroError('Failed to load macros')
      })
  }, [gearTab, id])

  const raceId = toRaceId(character?.race, character?.gender)
  const { slotDatPaths } = useSlotDatPaths(localGear, raceId, character?.faceModelId)

  const handleSaveFavorite = async (fav: { category: string; animationName: string; motionIndex: number } | null) => {
    if (!character) return
    try {
      await api(`/api/characters/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPublic: character.isPublic, favoriteAnimation: fav }),
      })
      setCharacter(prev => prev ? { ...prev, favoriteAnimation: fav ?? undefined } : prev)
    } catch (err) {
      console.warn('Failed to save favorite animation:', err)
    }
  }

  const handleTogglePublic = async () => {
    if (!character) return
    const newPublic = !character.isPublic
    try {
      await api(`/api/characters/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPublic: newPublic, favoriteAnimation: character.favoriteAnimation ?? null }),
      })
      setCharacter(prev => prev ? { ...prev, isPublic: newPublic } : prev)
      if (newPublic) setShowShareModal(true)
    } catch (err) {
      console.warn('Failed to toggle public profile:', err)
    }
  }

  const handleSwapSelect = (item: GameItemSummary) => {
    if (!swapSlot) return
    setLocalGear(prev => prev.map(g =>
      g.slot === swapSlot
        ? { ...g, itemId: item.itemId, itemName: item.name }
        : g
    ))
    setSwapSlot(null)
  }

  const selectMacroBook = async (bookNumber: number) => {
    if (!id) return
    setSelectedBookNumber(bookNumber)
    setSelectedMacro(null)
    setCurrentMacroPage(1)
    setShowMacroHistory(false)
    try {
      const detail = await getMacroBook(id, bookNumber)
      setSelectedBook(detail)
    } catch {
      setMacroError('Failed to load macro book')
    }
  }

  if (loading) return <LoadingSpinner />
  if (!character) return <p className="text-red-400">Character not found.</p>

  return (
    <div>
      <Link to="/characters" className="text-sm text-blue-400 hover:underline mb-4 inline-block">
        &larr; Back to Characters
      </Link>

      <CharacterProfileHeader
        character={character}
        showPublicButton
        onTogglePublic={handleTogglePublic}
        onShareClick={() => setShowShareModal(true)}
      />

      <section className="mb-8">
        <div className="flex gap-8">
          {/* Left column: Jobs / Crafting */}
          <div className="flex-1 min-w-0">
            <div className="flex gap-1 border-b border-gray-700 mb-4">
              {STAT_TABS.map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${
                    activeTab === tab
                      ? 'text-blue-400 border-b-2 border-blue-400 -mb-px'
                      : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
            <div className="h-[400px] overflow-y-auto styled-scrollbar">
              {activeTab === 'Jobs' && <JobsGrid jobs={character.jobs} />}
              {activeTab === 'Crafting' && <CraftingTable skills={character.craftingSkills} />}
              {activeTab === 'Relics' && <RelicsTab characterId={character.id} />}
            </div>
          </div>

          {/* Right column: Status panel */}
          <div className="w-72 flex-shrink-0">
            <StatusPanel
              character={character}
              gear={localGear}
              itemCache={itemCache}
            />
          </div>
        </div>
      </section>

      {/* Equipment / Inventory / Macros tabbed panel */}
      <section className="mb-8">
        <div className="flex gap-1 border-b border-gray-700 mb-4">
          {GEAR_TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setGearTab(tab)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                gearTab === tab
                  ? 'text-blue-400 border-b-2 border-blue-400 -mb-px'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Equipment tab: hidden instead of unmounted to preserve ModelViewer state */}
        <div className={gearTab === 'Equipment' ? '' : 'hidden'}>
          <div className="flex gap-4">
            <ModelViewer
              key={character.id}
              race={character.race}
              gender={character.gender}
              gear={localGear}
              slotDatPaths={slotDatPaths}
              onRequestFullscreen={() => setFullscreen(true)}
              favoriteAnimation={character.favoriteAnimation}
              onSaveFavorite={handleSaveFavorite}
            />
            <div className="w-[400px] flex-shrink-0">
              <EquipmentGrid
                gear={localGear}
                onSlotClick={(slot) => setSwapSlot(slot)}
                itemCache={itemCache}
              />
            </div>
          </div>
        </div>

        {gearTab === 'Inventory' && (
          <InventoryTab characterId={character.id} />
        )}

        {gearTab === 'Macros' && (
          <div>
            {macroError && <div className="text-red-400 text-sm mb-2">{macroError}</div>}
            {macroBooks.length === 0 && !macroError ? (
              <div className="text-gray-500 text-sm py-4">
                No macro data synced yet. Macros sync automatically from your Windower addon — view and edit them here once synced.{' '}
                <Link to="/setup?tab=macros" className="text-blue-400 hover:underline">Learn more</Link>
              </div>
            ) : (
              <>
                {/* Book selector tabs — file cabinet style, 10 per row */}
                <div className="space-y-0 mb-4">
                  {[0, 1].map(row => (
                    <div key={row} className="flex">
                      {macroBooks.slice(row * 10, row * 10 + 10).map((book) => {
                        const isSelected = selectedBookNumber === book.bookNumber
                        return (
                          <button
                            key={book.bookNumber}
                            onClick={() => selectMacroBook(book.bookNumber)}
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
                      onClick={() => setShowMacroHistory(!showMacroHistory)}
                      className="text-xs text-blue-400 hover:text-blue-300 ml-2"
                    >
                      {showMacroHistory ? 'Close History' : 'History'}
                    </button>
                  )}
                </div>

                {/* Macro grid + editor */}
                {selectedBook ? (
                  <div className="mt-14">
                    <div className="flex gap-6 items-start justify-center">
                      <div className="flex-shrink-0">
                        <MacroPageReel
                          pages={selectedBook.pages}
                          currentPage={currentMacroPage}
                          onPageChange={setCurrentMacroPage}
                          selectedMacro={selectedMacro}
                          onMacroSelect={(set, position) => setSelectedMacro({ set, position })}
                        />
                      </div>

                      {showMacroHistory && selectedBookNumber && id ? (
                        <MacroHistoryPanel
                          characterId={id}
                          bookNumber={selectedBookNumber}
                          onRestore={(detail) => {
                            setSelectedBook(detail)
                            listMacroBooks(id).then(setMacroBooks)
                          }}
                          onClose={() => setShowMacroHistory(false)}
                        />
                      ) : selectedMacro && (() => {
                        const page = selectedBook.pages.find(p => p.pageNumber === currentMacroPage)
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
                                  m.set === updated.set && m.position === updated.position && p.pageNumber === currentMacroPage
                                    ? updated
                                    : m
                                ),
                              }))
                              try {
                                const result = await updateMacroBook(id, selectedBook.bookNumber, { pages: updatedPages })
                                setSelectedBook(result)
                                const updatedBooks = await listMacroBooks(id)
                                setMacroBooks(updatedBooks)
                              } catch {
                                setMacroError('Failed to save macro')
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
              </>
            )}
          </div>
        )}

        {gearTab === 'Sessions' && (
          <SessionsTab characterId={character.id} />
        )}
      </section>

      {swapSlot && (
        <EquipmentSwapModal
          slotName={swapSlot}
          currentItemId={localGear.find(g => g.slot === swapSlot)?.itemId}
          onSelect={handleSwapSelect}
          onClose={() => setSwapSlot(null)}
        />
      )}

      {fullscreen && (
        <FullscreenViewer
          race={character.race}
          gender={character.gender}
          characterName={character.name}
          server={character.server}
          slots={Array.from(slotDatPaths.entries()).map(([slotName, datPath]) => {
            const slotMap: Record<string, number> = { Face: 1, Head: 2, Body: 3, Hands: 4, Legs: 5, Feet: 6, Main: 7, Sub: 8, Range: 9 }
            return { slotId: slotMap[slotName] ?? 0, datPath }
          }).filter(s => s.slotId > 0)}
          onExit={() => setFullscreen(false)}
        />
      )}
      {showShareModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => { setShowShareModal(false); setCopied(false) }}>
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 max-w-md w-full mx-4" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-2">Public Profile</h2>
            <p className="text-sm text-gray-400 mb-4">
              Your profile is public. Share this link so others can view your character.
            </p>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={`${window.location.origin}/${character.server}/${character.name}`}
                className="flex-1 rounded bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-gray-200 select-all"
                onFocus={e => e.target.select()}
              />
              <button
                onClick={() => {
                  navigator.clipboard.writeText(`${window.location.origin}/${character.server}/${character.name}`)
                  setCopied(true)
                  setTimeout(() => setCopied(false), 2000)
                }}
                className="rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500 transition-colors whitespace-nowrap"
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <div className="mt-4 flex items-center justify-between">
              <button
                onClick={async () => {
                  await handleTogglePublic()
                  setShowShareModal(false)
                  setCopied(false)
                }}
                className="text-xs text-red-400 hover:text-red-300"
              >
                Make Private
              </button>
              <button
                onClick={() => { setShowShareModal(false); setCopied(false) }}
                className="rounded bg-gray-800 px-4 py-1.5 text-sm text-gray-300 hover:bg-gray-700 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
