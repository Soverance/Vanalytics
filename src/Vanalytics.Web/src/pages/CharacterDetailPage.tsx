import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api } from '../api/client'
import type { CharacterDetail } from '../types/api'
import JobsGrid from '../components/JobsGrid'
import GearTable from '../components/GearTable'
import CraftingTable from '../components/CraftingTable'

export default function CharacterDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [character, setCharacter] = useState<CharacterDetail | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api<CharacterDetail>(`/api/characters/${id}`)
      .then(setCharacter)
      .catch(() => setCharacter(null))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return <p className="text-gray-400">Loading...</p>
  if (!character) return <p className="text-red-400">Character not found.</p>

  return (
    <div>
      <Link to="/characters" className="text-sm text-blue-400 hover:underline mb-4 inline-block">
        &larr; Back to Characters
      </Link>

      <div className="flex items-baseline gap-3 mb-6">
        <h1 className="text-2xl font-bold">{character.name}</h1>
        <span className="text-gray-400">{character.server}</span>
        <span
          className={`rounded px-2 py-0.5 text-xs font-medium ${
            character.licenseStatus === 'Active'
              ? 'bg-green-900/50 text-green-400'
              : 'bg-gray-800 text-gray-500'
          }`}
        >
          {character.licenseStatus}
        </span>
      </div>

      {character.lastSyncAt && (
        <p className="text-sm text-gray-500 mb-6">
          Last synced: {new Date(character.lastSyncAt).toLocaleString()}
        </p>
      )}

      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">Jobs</h2>
        <JobsGrid jobs={character.jobs} />
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">Equipment</h2>
        <GearTable gear={character.gear} />
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">Crafting</h2>
        <CraftingTable skills={character.craftingSkills} />
      </section>
    </div>
  )
}
