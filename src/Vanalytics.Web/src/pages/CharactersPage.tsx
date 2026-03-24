import { useState, useEffect } from 'react'
import { api, ApiError } from '../api/client'
import type { CharacterSummary } from '../types/api'
import CharacterCard from '../components/CharacterCard'

export default function CharactersPage() {
  const [characters, setCharacters] = useState<CharacterSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchCharacters = async () => {
    try {
      const data = await api<CharacterSummary[]>('/api/characters')
      setCharacters(data)
    } catch {
      setError('Failed to load characters')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCharacters()
  }, [])

  const handleTogglePublic = async (id: string, isPublic: boolean) => {
    try {
      await api(`/api/characters/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ isPublic }),
      })
      fetchCharacters()
    } catch (err) {
      if (err instanceof ApiError) setError(err.message)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this character?')) return
    try {
      await api(`/api/characters/${id}`, { method: 'DELETE' })
      fetchCharacters()
    } catch (err) {
      if (err instanceof ApiError) setError(err.message)
    }
  }

  if (loading) return <p className="text-gray-400">Loading characters...</p>

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Characters</h1>

      {error && (
        <div className="mb-4 rounded bg-red-900/50 border border-red-700 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <p className="text-sm text-gray-500 mb-6">
        Characters are automatically added when your Windower addon syncs.
      </p>

      {characters.length === 0 ? (
        <p className="text-gray-500">No characters registered yet.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {characters.map((c) => (
            <CharacterCard
              key={c.id}
              character={c}
              onTogglePublic={handleTogglePublic}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  )
}
