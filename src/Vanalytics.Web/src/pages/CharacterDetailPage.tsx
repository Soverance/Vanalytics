import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api } from '../api/client'
import type { CharacterDetail, GearEntry, GameItemSummary, GameItemDetail } from '../types/api'
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

const STAT_TABS = ['Jobs', 'Crafting', 'Relics'] as const
type StatTab = typeof STAT_TABS[number]

export default function CharacterDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [character, setCharacter] = useState<CharacterDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [swapSlot, setSwapSlot] = useState<string | null>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const [localGear, setLocalGear] = useState<GearEntry[]>([])
  const [activeTab, setActiveTab] = useState<StatTab>('Jobs')
  const [itemCache, setItemCache] = useState<Map<number, GameItemDetail>>(new Map())

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

  const handleSwapSelect = (item: GameItemSummary) => {
    if (!swapSlot) return
    setLocalGear(prev => prev.map(g =>
      g.slot === swapSlot
        ? { ...g, itemId: item.itemId, itemName: item.name }
        : g
    ))
    setSwapSlot(null)
  }

  if (loading) return <p className="text-gray-400">Loading...</p>
  if (!character) return <p className="text-red-400">Character not found.</p>

  const nationNames: Record<number, string> = { 0: "San d'Oria", 1: 'Bastok', 2: 'Windurst' }

  const activeJob = character.jobs.find(j => j.isActive)
  const jobSubLine = activeJob
    ? `${activeJob.job}/${character.subJob ?? '???'}`
    : null

  const infoParts = [
    character.race,
    character.gender,
    character.nation != null ? nationNames[character.nation] : null,
    character.linkshell ? `LS: ${character.linkshell}` : null,
  ].filter(Boolean)

  return (
    <div>
      <Link to="/characters" className="text-sm text-blue-400 hover:underline mb-4 inline-block">
        &larr; Back to Characters
      </Link>

      <div className="mb-6">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-bold">{character.name}</h1>
          <span className="text-gray-400 text-sm">{character.server}</span>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-400 mt-1">
          {jobSubLine && <span className="text-gray-200 font-medium">{jobSubLine}</span>}
          {character.masterLevel != null && character.masterLevel > 0 && (
            <span>ML{character.masterLevel}</span>
          )}
          {character.itemLevel != null && character.itemLevel > 0 && (
            <span>iLvl {character.itemLevel}</span>
          )}
          {infoParts.length > 0 && <span>{infoParts.join(' · ')}</span>}
          {character.lastSyncAt && (
            <span>Last sync: {new Date(character.lastSyncAt).toLocaleString()}</span>
          )}
          <Link to={`/characters/${id}/macros`} className="text-blue-400 hover:underline text-sm">
            Macro Editor
          </Link>
        </div>
      </div>

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

      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">Equipment</h2>
        <div className="flex gap-4 mt-4">
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
      </section>

      <section className="mb-8">
        <InventoryTab characterId={character.id} />
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
    </div>
  )
}
