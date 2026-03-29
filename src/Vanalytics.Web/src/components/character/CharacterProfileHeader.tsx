import type { CharacterDetail } from '../../types/api'

const NATION_NAMES: Record<number, string> = { 0: "San d'Oria", 1: 'Bastok', 2: 'Windurst' }

function formatPlaytime(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `${days}d ${hours}h ${minutes}m`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

interface CharacterProfileHeaderProps {
  character: CharacterDetail
  showPublicButton?: boolean
  onTogglePublic?: () => void
  onShareClick?: () => void
}

export default function CharacterProfileHeader({
  character,
  showPublicButton,
  onTogglePublic,
  onShareClick,
}: CharacterProfileHeaderProps) {
  const activeJob = character.jobs.find(j => j.isActive)
  const jobSubLine = activeJob
    ? `${activeJob.job}/${character.subJob ?? '???'} ${activeJob.level}`
    : null

  // Row 1: Combat
  const combatParts = [
    jobSubLine,
    character.masterLevel != null && character.masterLevel > 0 ? `ML ${character.masterLevel}` : null,
    character.itemLevel != null && character.itemLevel > 0 ? `iLvl ${character.itemLevel}` : null,
  ].filter(Boolean)

  // Row 2: Identity
  const identityParts = [
    character.race,
    character.gender,
    character.nation != null
      ? NATION_NAMES[character.nation] + (character.nationRank ? ` Rank ${character.nationRank}` : '')
      : null,
    character.linkshell ? `LS: ${character.linkshell}` : null,
  ].filter(Boolean)

  // Row 3: Meta
  const metaParts = [
    character.lastSyncAt ? `Last sync: ${new Date(character.lastSyncAt).toLocaleString()}` : null,
    character.playtimeSeconds != null && character.playtimeSeconds > 0
      ? `Playtime: ${formatPlaytime(character.playtimeSeconds)}`
      : null,
  ].filter(Boolean)

  return (
    <div className="mb-6">
      {/* Name row */}
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold">{character.name}</h1>
        <span className="text-gray-400 text-sm self-baseline">{character.server}</span>
        {showPublicButton && (
          <button
            onClick={character.isPublic ? onShareClick : onTogglePublic}
            className={`ml-auto flex items-center gap-1.5 rounded px-3 py-1 text-xs font-medium transition-colors ${
              character.isPublic
                ? 'bg-green-900/40 text-green-400 border border-green-700 hover:bg-green-900/60'
                : 'bg-gray-800 text-gray-400 border border-gray-700 hover:bg-gray-700 hover:text-gray-200'
            }`}
          >
            {character.isPublic ? 'Public Profile' : 'Make Public'}
          </button>
        )}
      </div>

      {/* Title */}
      {character.title && (
        <p className="text-sm text-gray-400 italic">{character.title}</p>
      )}

      {/* Row 1: Combat */}
      {combatParts.length > 0 && (
        <div className="text-sm text-gray-200 font-medium mt-1">
          {combatParts.join(' · ')}
        </div>
      )}

      {/* Row 2: Identity */}
      {identityParts.length > 0 && (
        <div className="text-sm text-gray-400">
          {identityParts.join(' · ')}
        </div>
      )}

      {/* Row 3: Meta */}
      {metaParts.length > 0 && (
        <div className="text-xs text-gray-500">
          {metaParts.join(' · ')}
        </div>
      )}
    </div>
  )
}
