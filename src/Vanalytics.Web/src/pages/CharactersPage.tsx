import { useState, useEffect } from 'react'
import { api, ApiError } from '../api/client'
import type { CharacterSummary, CreateCharacterRequest, GameServer } from '../types/api'
import CharacterCard from '../components/CharacterCard'

export default function CharactersPage() {
  const [characters, setCharacters] = useState<CharacterSummary[]>([])
  const [servers, setServers] = useState<GameServer[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [server, setServer] = useState('')
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
    // Load server list for dropdown
    fetch('/api/servers')
      .then(res => res.ok ? res.json() : [])
      .then(setServers)
      .catch(() => {})
  }, [])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    try {
      await api<CharacterSummary>('/api/characters', {
        method: 'POST',
        body: JSON.stringify({ name, server } as CreateCharacterRequest),
      })
      setName('')
      setServer('')
      fetchCharacters()
    } catch (err) {
      if (err instanceof ApiError) setError(err.message)
    }
  }

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
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>

      {error && (
        <div className="mb-4 rounded bg-red-900/50 border border-red-700 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <form onSubmit={handleCreate} className="mb-8 flex gap-3">
        <input
          type="text"
          placeholder="Character name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="rounded border border-gray-700 bg-gray-800 px-3 py-2 text-gray-100 focus:border-blue-500 focus:outline-none"
        />
        {servers.length > 0 ? (
          <select
            value={server}
            onChange={(e) => setServer(e.target.value)}
            required
            className="rounded border border-gray-700 bg-gray-800 px-3 py-2 text-gray-100 focus:border-blue-500 focus:outline-none"
          >
            <option value="">Select server</option>
            {servers.map((s) => (
              <option key={s.id} value={s.name}>{s.name}</option>
            ))}
          </select>
        ) : (
          <input
            type="text"
            placeholder="Server"
            value={server}
            onChange={(e) => setServer(e.target.value)}
            required
            className="rounded border border-gray-700 bg-gray-800 px-3 py-2 text-gray-100 focus:border-blue-500 focus:outline-none"
          />
        )}
        <button
          type="submit"
          className="rounded bg-blue-600 px-4 py-2 font-medium hover:bg-blue-500"
        >
          Add Character
        </button>
      </form>

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
