import { useState, useEffect } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { api, getCharacterAchievement } from '../api/client'
import type { CharacterDetail, GameItemDetail, CharacterOwner, CharacterAchievementResponse } from '../types/api'
import JobsGrid from '../components/JobsGrid'
import CraftingTable from '../components/CraftingTable'
import StatusPanel from '../components/character/StatusPanel'
import ModelViewer from '../components/character/ModelViewer'
import { useSlotDatPaths, toRaceId } from '../lib/model-mappings'
import EquipmentGrid from '../components/character/EquipmentGrid'
import CharacterProfileHeader from '../components/character/CharacterProfileHeader'
import Tabs from '../components/Tabs'
import ProgressionTab from '../components/character/ProgressionTab'
import MissionsTab from '../components/character/MissionsTab'
import TitlesTab from '../components/character/TitlesTab'
import KeyItemsTab from '../components/character/KeyItemsTab'
import SpellsTab from '../components/character/SpellsTab'
import RelicsTab from '../components/character/RelicsTab'
import GearSetsTab from '../components/character/GearSetsTab'
// Explicit .tsx extension: on case-insensitive filesystems (Windows dev/mounts)
// an extensionless 'AppearanceSelector' would resolve to appearanceSelector.ts
// (tsc tries .ts before .tsx), importing the logic module instead of the component.
import AppearanceSelector from '../components/character/AppearanceSelector.tsx'
import type { AppearanceState } from '../components/character/appearanceSelector'

const STAT_TABS = ['Jobs', 'Crafting', 'Progression', 'Missions', 'Titles', 'Key Items'] as const
type StatTab = typeof STAT_TABS[number]

const GEAR_TABS = ['Equipment', 'Ultimate Weapons', 'Spells', 'Gear Sets'] as const
type GearTab = typeof GEAR_TABS[number]

export default function PublicProfilePage() {
  const { server, name } = useParams<{ server: string; name: string }>()
  const [searchParams] = useSearchParams()
  const gearsetParam = searchParams.get('gearset')
  const initialSetId = gearsetParam && /^\d+$/.test(gearsetParam) ? Number(gearsetParam) : undefined
  const [character, setCharacter] = useState<CharacterDetail | null>(null)
  const [owner, setOwner] = useState<CharacterOwner | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [activeTab, setActiveTab] = useState<StatTab>('Jobs')
  const [gearTab, setGearTab] = useState<GearTab>('Equipment')
  const [itemCache, setItemCache] = useState<Map<number, GameItemDetail>>(new Map())
  const [copied, setCopied] = useState(false)
  const [achievement, setAchievement] = useState<CharacterAchievementResponse | null>(null)
  const [appearance, setAppearance] = useState<AppearanceState | null>(null)

  useEffect(() => {
    setLoading(true)
    setNotFound(false)
    setLoadError(false)
    setAchievement(null)
    setAppearance(null) // don't leak a memorial's appearance override onto the next profile
    fetch(`/api/profiles/${server}/${name}`)
      .then(async (res) => {
        // 404 = genuinely not public / no such character.
        // Anything else (500, etc.) is a load failure, not a missing
        // profile — don't mislabel it as "no public profile".
        if (res.status === 404) {
          setNotFound(true)
          return
        }
        if (!res.ok) {
          setLoadError(true)
          return
        }
        setCharacter(await res.json())
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false))
  }, [server, name])

  useEffect(() => {
    setOwner(null)
    api<CharacterOwner>(`/api/profiles/${server}/${name}/owner`)
      .then(setOwner)
      .catch(() => setOwner(null))
  }, [server, name])

  // Fetch achievement score after character loads — shown in header rank badge
  useEffect(() => {
    if (!character || character.isMemorial) return
    getCharacterAchievement(character.id)
      .then(setAchievement)
      .catch(() => setAchievement(null))
  }, [character?.id])

  // Deep-link: a ?gearset=<id> means the visitor wants a specific set — jump to that tab.
  useEffect(() => {
    if (initialSetId != null) setGearTab('Gear Sets')
  }, [initialSetId])

  // Memorial pages let visitors preview face/gender variants; appearance
  // overrides are local view state only (null = the character's own values).
  const effectiveGender = appearance?.gender ?? character?.gender
  const effectiveFaceModelId = appearance?.faceModelId ?? character?.faceModelId
  const raceId = toRaceId(character?.race, effectiveGender)
  const { slotDatPaths } = useSlotDatPaths(character?.gear ?? [], raceId, effectiveFaceModelId)

  // Pre-fetch item details for equipped items
  useEffect(() => {
    if (!character) return
    const ids = character.gear.filter(g => g.itemId > 0).map(g => g.itemId)
    const uncached = ids.filter(id => !itemCache.has(id))
    if (uncached.length === 0) return
    uncached.forEach(id => {
      api<GameItemDetail>(`/api/items/${id}`)
        .then(item => {
          setItemCache(prev => new Map(prev).set(id, item))
        })
        .catch(() => {})
    })
  }, [character?.gear])

  if (loading) return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <main className="mx-auto max-w-5xl px-4 py-8">
        <p className="text-gray-400">Loading profile...</p>
      </main>
    </div>
  )

  if (loadError) {
    return (
      <div className="min-h-screen bg-gray-950 text-gray-100">
        <main className="mx-auto max-w-5xl px-4 py-8">
          <div className="text-center py-16">
            <h2 className="text-xl font-bold text-gray-400">Couldn't load profile</h2>
            <p className="text-gray-500 mt-2">
              Something went wrong loading {name} on {server}. Please try again.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 text-sm text-blue-400 hover:text-blue-300 transition-colors"
            >
              Retry
            </button>
          </div>
        </main>
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-gray-950 text-gray-100">
        <main className="mx-auto max-w-5xl px-4 py-8">
          <div className="text-center py-16">
            <h2 className="text-xl font-bold text-gray-400">Character Not Found</h2>
            <p className="text-gray-500 mt-2">
              {name} on {server} doesn't have a public profile.
            </p>
          </div>
        </main>
      </div>
    )
  }

  if (!character) return null

  const fetchBase = `/api/profiles/${server}/${name}`

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <main className="mx-auto max-w-5xl px-4 py-8">
        <CharacterProfileHeader character={character} owner={owner} achievement={achievement} />

        {/* Share link */}
        <div className="mb-6 -mt-4">
          <button
            onClick={() => {
              navigator.clipboard.writeText(window.location.href)
              setCopied(true)
              setTimeout(() => setCopied(false), 2000)
            }}
            className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
          >
            {copied ? '✓ Link copied!' : 'Copy profile link'}
          </button>
        </div>

        {/* Stats section: Jobs / Crafting / Progression / Missions / Titles / Key Items + Status panel */}
        <section className="mb-8">
          <div className="flex gap-8">
            <div className="flex-1 min-w-0">
              <Tabs items={STAT_TABS} value={activeTab} onChange={setActiveTab} />
              <div className="h-[400px] overflow-y-auto styled-scrollbar">
                {activeTab === 'Jobs' && <JobsGrid jobs={character.jobs} />}
                {activeTab === 'Crafting' && <CraftingTable skills={character.craftingSkills} />}
                {activeTab === 'Progression' && <ProgressionTab characterId={character.id} fetchBase={fetchBase} />}
                {activeTab === 'Missions' && <MissionsTab characterId={character.id} fetchBase={fetchBase} />}
                {activeTab === 'Titles' && <TitlesTab characterId={character.id} fetchBase={fetchBase} />}
                {activeTab === 'Key Items' && <KeyItemsTab characterId={character.id} fetchBase={fetchBase} />}
              </div>
            </div>

            <div className="w-72 flex-shrink-0">
              <StatusPanel
                character={character}
                gear={character.gear}
                itemCache={itemCache}
              />
            </div>
          </div>
        </section>

        {/* Equipment / Ultimate Weapons / Spells / Gear Sets tabbed panel */}
        <section className="mb-8">
          <Tabs items={GEAR_TABS} value={gearTab} onChange={setGearTab} />

          {/* Equipment tab: hidden instead of unmounted to preserve layout */}
          <div className={gearTab === 'Equipment' ? '' : 'hidden'}>
            <div className="flex gap-4">
              <div className="flex-1 min-w-0">
                <ModelViewer
                  key={character.id}
                  race={character.race}
                  gender={effectiveGender}
                  gear={character.gear}
                  slotDatPaths={slotDatPaths}
                  favoriteAnimation={character.favoriteAnimation}
                />
                {character.isMemorial && character.race && character.gender && (
                  <AppearanceSelector
                    race={character.race}
                    value={{
                      gender: effectiveGender ?? character.gender,
                      faceModelId: effectiveFaceModelId ?? 0,
                    }}
                    defaultValue={{ gender: character.gender, faceModelId: character.faceModelId ?? 0 }}
                    onChange={next => {
                      const def = { gender: character.gender!, faceModelId: character.faceModelId ?? 0 }
                      setAppearance(next.gender === def.gender && next.faceModelId === def.faceModelId ? null : next)
                    }}
                  />
                )}
              </div>
              <div className="w-[400px] flex-shrink-0">
                <EquipmentGrid
                  gear={character.gear}
                  onSlotClick={() => {}}
                  itemCache={itemCache}
                  readOnly
                />
              </div>
            </div>
          </div>

          {gearTab === 'Ultimate Weapons' && (
            <RelicsTab characterId={character.id} fetchBase={fetchBase} readOnly />
          )}

          {gearTab === 'Spells' && (
            <SpellsTab characterId={character.id} fetchBase={fetchBase} />
          )}

          {gearTab === 'Gear Sets' && (
            <GearSetsTab
              character={character}
              gear={character.gear}
              itemCache={itemCache}
              onSaveFavorite={() => {}}
              fetchBase={fetchBase}
              readOnly
              initialSetId={initialSetId}
            />
          )}
        </section>
      </main>
    </div>
  )
}
