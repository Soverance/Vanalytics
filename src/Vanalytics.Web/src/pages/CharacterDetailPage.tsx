import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api } from '../api/client'
import type { CharacterDetail, GearEntry, GameItemSummary } from '../types/api'
import JobsGrid from '../components/JobsGrid'
import CraftingTable from '../components/CraftingTable'
import ModelViewer from '../components/character/ModelViewer'
import { useSlotDatPaths, toRaceId } from '../lib/model-mappings'
import EquipmentGrid from '../components/character/EquipmentGrid'
import EquipmentSwapModal from '../components/character/EquipmentSwapModal'
import FullscreenViewer from '../components/character/FullscreenViewer'

export default function CharacterDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [character, setCharacter] = useState<CharacterDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [swapSlot, setSwapSlot] = useState<string | null>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const [localGear, setLocalGear] = useState<GearEntry[]>([])

  useEffect(() => {
    api<CharacterDetail>(`/api/characters/${id}`)
      .then(setCharacter)
      .catch(() => setCharacter(null))
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    if (character?.gear) setLocalGear(character.gear)
  }, [character?.gear])

  const raceId = toRaceId(character?.race, character?.gender)
  const { slotDatPaths } = useSlotDatPaths(localGear, raceId)

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
  const jobLine = activeJob
    ? `${activeJob.job}${activeJob.level}${character.subJob ? '/' + character.subJob + (character.subJobLevel ?? '') : ''}`
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
          {jobLine && <span className="text-gray-200 font-medium">{jobLine}</span>}
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
        </div>
      </div>

      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">Jobs</h2>
        <JobsGrid jobs={character.jobs} />
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">Equipment</h2>
        <div className="flex gap-4 mt-4">
          <ModelViewer
            race={character.race}
            gender={character.gender}
            gear={localGear}
            slotDatPaths={slotDatPaths}
            onRequestFullscreen={() => setFullscreen(true)}
          />
          <div className="w-[400px] flex-shrink-0">
            <EquipmentGrid
              gear={localGear}
              onSlotClick={(slot) => setSwapSlot(slot)}
            />
          </div>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">Crafting</h2>
        <CraftingTable skills={character.craftingSkills} />
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
            const slotMap: Record<string, number> = { Head: 2, Body: 3, Hands: 4, Legs: 5, Feet: 6, Main: 7, Sub: 8, Range: 9 }
            return { slotId: slotMap[slotName] ?? 0, datPath }
          }).filter(s => s.slotId > 0)}
          onExit={() => setFullscreen(false)}
        />
      )}
    </div>
  )
}
