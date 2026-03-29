import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../api/client'
import type { CharacterDetail, GameItemDetail } from '../types/api'
import JobsGrid from '../components/JobsGrid'
import CraftingTable from '../components/CraftingTable'
import StatusPanel from '../components/character/StatusPanel'
import EquipmentGrid from '../components/character/EquipmentGrid'

const STAT_TABS = ['Jobs', 'Crafting'] as const
type StatTab = typeof STAT_TABS[number]

export default function PublicProfilePage() {
  const { server, name } = useParams<{ server: string; name: string }>()
  const [character, setCharacter] = useState<CharacterDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [activeTab, setActiveTab] = useState<StatTab>('Jobs')
  const [itemCache, setItemCache] = useState<Map<number, GameItemDetail>>(new Map())

  useEffect(() => {
    fetch(`/api/profiles/${server}/${name}`)
      .then(async (res) => {
        if (!res.ok) {
          setNotFound(true)
          return
        }
        setCharacter(await res.json())
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false))
  }, [server, name])

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
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <main className="mx-auto max-w-5xl px-4 py-8">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-baseline gap-3">
            <h1 className="text-2xl font-bold">{character.name}</h1>
            <span className="text-gray-400 text-sm">{character.server}</span>
          </div>
          {character.title && (
            <p className="text-sm text-gray-400 italic">{character.title}</p>
          )}
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
          </div>
        </div>

        {/* Stats section: Jobs / Crafting tabs + Status panel */}
        <section className="mb-8">
          <div className="flex gap-8">
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

        {/* Equipment section */}
        <section className="mb-8">
          <div className="flex gap-1 border-b border-gray-700 mb-4">
            <span className="px-4 py-2 text-sm font-medium text-blue-400 border-b-2 border-blue-400 -mb-px">
              Equipment
            </span>
          </div>
          <div className="max-w-[400px]">
            <EquipmentGrid
              gear={character.gear}
              onSlotClick={() => {}}
              itemCache={itemCache}
            />
          </div>
        </section>
      </main>
    </div>
  )
}
