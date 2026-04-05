import { useState, useEffect } from 'react'
import { api, ApiError } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { useLoginModal } from '../context/LoginModalContext'
import type { CharacterSummary } from '../types/api'
import LoadingSpinner from '../components/LoadingSpinner'
import CharacterCard from '../components/CharacterCard'
import ConfirmModal from '../components/ConfirmModal'
import { Link } from 'react-router-dom'
import { Package, Map, Bug } from 'lucide-react'

export default function CharactersPage() {
  const { user, loading: authLoading } = useAuth()
  const { open: openLogin } = useLoginModal()
  const [characters, setCharacters] = useState<CharacterSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)

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
    if (user) fetchCharacters()
  }, [user])

  const handleDelete = async (id: string) => {
    try {
      await api(`/api/characters/${id}`, { method: 'DELETE' })
      fetchCharacters()
    } catch (err) {
      if (err instanceof ApiError) setError(err.message)
    }
  }

  if (authLoading) return <LoadingSpinner />

  if (!user) {
    return (
      <div className="space-y-8">
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <h1 className="text-2xl font-bold mb-3">Sign in to view your characters</h1>
          <p className="text-gray-400 max-w-md mb-6">
            Track your FFXI characters with real-time gear updates, inventory sync, and session analytics.
          </p>
          <button
            onClick={openLogin}
            className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-blue-500 transition-colors"
          >
            Sign In
          </button>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-4">
          <div className="h-px flex-1 bg-gray-800" />
          <span className="text-sm text-gray-500">or explore without an account</span>
          <div className="h-px flex-1 bg-gray-800" />
        </div>

        {/* Explore cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Link
            to="/items"
            className="rounded-lg border border-gray-800 border-l-2 border-l-blue-500 bg-gray-900 p-5 hover:bg-gray-800/50 transition-colors"
          >
            <Package className="h-6 w-6 text-blue-400 mb-3" />
            <h3 className="text-base font-semibold">Items</h3>
            <p className="text-sm text-gray-400 mt-1">
              Browse every weapon, armor piece, and item in Vana'diel.
            </p>
          </Link>
          <Link
            to="/zones"
            className="rounded-lg border border-gray-800 border-l-2 border-l-green-500 bg-gray-900 p-5 hover:bg-gray-800/50 transition-colors"
          >
            <Map className="h-6 w-6 text-green-400 mb-3" />
            <h3 className="text-base font-semibold">Zones</h3>
            <p className="text-sm text-gray-400 mt-1">
              Fly through 3D zone environments from the game.
            </p>
          </Link>
          <Link
            to="/npcs"
            className="rounded-lg border border-gray-800 border-l-2 border-l-purple-500 bg-gray-900 p-5 hover:bg-gray-800/50 transition-colors"
          >
            <Bug className="h-6 w-6 text-purple-400 mb-3" />
            <h3 className="text-base font-semibold">NPCs</h3>
            <p className="text-sm text-gray-400 mt-1">
              View 3D models of every NPC and monster.
            </p>
          </Link>
        </div>
      </div>
    )
  }

  if (loading) return <LoadingSpinner />

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Characters</h1>

      {error && (
        <div className="mb-4 rounded bg-red-900/50 border border-red-700 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {characters.length === 0 ? (
        <div className="space-y-8">
          {/* Setup card */}
          <div className="rounded-lg border border-gray-800 bg-gray-900 p-6">
            <h2 className="text-lg font-semibold mb-2">Get started with character sync</h2>
            <p className="text-sm text-gray-400 mb-4">
              Sync your character from FFXI using a lightweight Windower addon. See your gear in 3D,
              browse your inventory, edit macros, and track session performance.
            </p>
            <Link
              to="/setup"
              className="inline-block rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-blue-500 transition-colors"
            >
              View Setup Guide
            </Link>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-4">
            <div className="h-px flex-1 bg-gray-800" />
            <span className="text-sm text-gray-500">or explore without syncing</span>
            <div className="h-px flex-1 bg-gray-800" />
          </div>

          {/* Explore cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Link
              to="/items"
              className="rounded-lg border border-gray-800 border-l-2 border-l-blue-500 bg-gray-900 p-5 hover:bg-gray-800/50 transition-colors"
            >
              <Package className="h-6 w-6 text-blue-400 mb-3" />
              <h3 className="text-base font-semibold">Items</h3>
              <p className="text-sm text-gray-400 mt-1">
                Browse every weapon, armor piece, and item in Vana'diel.
              </p>
            </Link>
            <Link
              to="/zones"
              className="rounded-lg border border-gray-800 border-l-2 border-l-green-500 bg-gray-900 p-5 hover:bg-gray-800/50 transition-colors"
            >
              <Map className="h-6 w-6 text-green-400 mb-3" />
              <h3 className="text-base font-semibold">Zones</h3>
              <p className="text-sm text-gray-400 mt-1">
                Fly through 3D zone environments from the game.
              </p>
            </Link>
            <Link
              to="/npcs"
              className="rounded-lg border border-gray-800 border-l-2 border-l-purple-500 bg-gray-900 p-5 hover:bg-gray-800/50 transition-colors"
            >
              <Bug className="h-6 w-6 text-purple-400 mb-3" />
              <h3 className="text-base font-semibold">NPCs</h3>
              <p className="text-sm text-gray-400 mt-1">
                View 3D models of every NPC and monster.
              </p>
            </Link>
          </div>
        </div>
      ) : (
        <>
          <p className="text-sm text-gray-500 mb-6">
            Characters are automatically added when your Windower addon syncs.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {characters.map((c) => (
              <CharacterCard
                key={c.id}
                character={c}
                onDelete={(id) => setPendingDelete(id)}
              />
            ))}
          </div>
        </>
      )}
      {pendingDelete && (
        <ConfirmModal
          message="Delete this character?"
          confirmLabel="Delete"
          onConfirm={() => { handleDelete(pendingDelete); setPendingDelete(null) }}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  )
}
