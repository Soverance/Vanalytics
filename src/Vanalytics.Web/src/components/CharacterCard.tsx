import { Link } from 'react-router-dom'
import type { CharacterSummary } from '../types/api'

interface Props {
  character: CharacterSummary
  onTogglePublic: (id: string, isPublic: boolean) => void
  onDelete: (id: string) => void
}

export default function CharacterCard({ character, onTogglePublic, onDelete }: Props) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
      <div className="flex items-start justify-between">
        <div>
          <Link
            to={`/characters/${character.id}`}
            className="text-lg font-semibold text-blue-400 hover:underline"
          >
            {character.name}
          </Link>
          <p className="text-sm text-gray-400">{character.server}</p>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-4 text-sm">
        <label className="flex items-center gap-2 text-gray-400">
          <input
            type="checkbox"
            checked={character.isPublic}
            onChange={() => onTogglePublic(character.id, !character.isPublic)}
            className="rounded border-gray-600"
          />
          Public profile
        </label>

        {character.lastSyncAt && (
          <span className="text-gray-500">
            Synced {new Date(character.lastSyncAt).toLocaleDateString()}
          </span>
        )}
      </div>

      <div className="mt-3 flex gap-2">
        {character.isPublic && (
          <Link
            to={`/${character.server}/${character.name}`}
            className="text-xs text-blue-400 hover:underline"
          >
            View public profile
          </Link>
        )}
        <button
          onClick={() => onDelete(character.id)}
          className="ml-auto text-xs text-red-400 hover:text-red-300"
        >
          Delete
        </button>
      </div>
    </div>
  )
}
