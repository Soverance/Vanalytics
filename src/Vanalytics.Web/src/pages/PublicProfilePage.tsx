import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../api/client'
import type { CharacterDetail, GameItemDetail } from '../types/api'
import JobsGrid from '../components/JobsGrid'
import CraftingTable from '../components/CraftingTable'
import StatusPanel from '../components/character/StatusPanel'
import EquipmentGrid from '../components/character/EquipmentGrid'
import CharacterProfileHeader from '../components/character/CharacterProfileHeader'

const STAT_TABS = ['Jobs', 'Crafting'] as const
type StatTab = typeof STAT_TABS[number]

export default function PublicProfilePage() {
  const { server, name } = useParams<{ server: string; name: string }>()
  const [character, setCharacter] = useState<CharacterDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [activeTab, setActiveTab] = useState<StatTab>('Jobs')
  const [itemCache, setItemCache] = useState<Map<number, GameItemDetail>>(new Map())
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setLoading(true)
    setNotFound(false)
    setLoadError(false)
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

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <main className="mx-auto max-w-5xl px-4 py-8">
        <CharacterProfileHeader character={character} />

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
