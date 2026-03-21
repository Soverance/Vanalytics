import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import type { CharacterDetail } from '../types/api'
import JobsGrid from '../components/JobsGrid'
import GearTable from '../components/GearTable'
import CraftingTable from '../components/CraftingTable'

export default function PublicProfilePage() {
  const { server, name } = useParams<{ server: string; name: string }>()
  const [character, setCharacter] = useState<CharacterDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

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

  if (loading) return <p className="text-gray-400">Loading profile...</p>

  if (notFound) {
    return (
      <div className="text-center py-16">
        <h2 className="text-xl font-bold text-gray-400">Character Not Found</h2>
        <p className="text-gray-500 mt-2">
          {name} on {server} doesn't have a public profile.
        </p>
      </div>
    )
  }

  if (!character) return null

  const activeJob = character.jobs.find((j) => j.isActive)

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold">{character.name}</h1>
        <p className="text-gray-400">{character.server}</p>
        {activeJob && (
          <p className="mt-2 text-lg text-blue-400">
            {activeJob.job} Lv.{activeJob.level}
          </p>
        )}
      </div>

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

      {character.lastSyncAt && (
        <p className="text-xs text-gray-600">
          Last updated: {new Date(character.lastSyncAt).toLocaleString()}
        </p>
      )}
    </div>
  )
}
