import { Link } from 'react-router-dom'
import type { CharacterDetail, CharacterOwner, CharacterAchievementResponse } from '../../types/api'
import MessageButton from '../messages/MessageButton'
import { ownerDisplayLabel, shouldShowMessageButton } from './ownerActions'
import LinkshellPearl from './LinkshellPearl'
import { roleLabel } from '../../lib/characterRoles'
import AchievementRankBadge from './AchievementRankBadge'

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
  owner?: CharacterOwner | null
  showPublicButton?: boolean
  onTogglePublic?: () => void
  onShareClick?: () => void
  onRoleClick?: () => void
  achievement?: CharacterAchievementResponse | null
}

export default function CharacterProfileHeader({
  character,
  owner,
  showPublicButton,
  onTogglePublic,
  onShareClick,
  onRoleClick,
  achievement,
}: CharacterProfileHeaderProps) {
  const activeJob = character.jobs.find(j => j.isActive)
  const jobSubLine = activeJob
    ? `${activeJob.job}/${character.subJob ?? '???'} ${activeJob.level}`
    : null

  // Row 1: Combat
  const combatParts = [
    jobSubLine,
    // Su is always shown (incl. Su 0), matching the in-game status panel.
    character.superiorLevel != null ? `Su ${character.superiorLevel}` : null,
    // ML only when the active job is actually a master (> 0).
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
      <div className="flex flex-wrap items-start gap-5">
        {/* Left column: identity + stats stacked under the name */}
        <div className="flex-1 min-w-0">
          {/* Name row: name + server badge (+ read-only role badge on public) */}
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold">{character.name}</h1>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-800 bg-indigo-900/40 px-2.5 py-0.5 text-xs font-semibold text-indigo-300">
              <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 shadow-[0_0_6px_#818cf8]" />
              {character.server}
            </span>
            {/* Non-owner read-only role badge — does not render on public profiles
                (role is "None" there by the owner-only design), kept for parity. */}
            {!showPublicButton && character.role && character.role !== 'None' && (
              <span className="rounded border border-gray-700 bg-gray-800 px-2 py-0.5 text-xs text-gray-300">
                {roleLabel(character.role)}
              </span>
            )}
          </div>

          {/* Title — its own line under the name, above the combat line */}
          {character.title && (
            <p className="text-sm text-gray-400 italic mt-1">{character.title}</p>
          )}

          {/* Combat */}
          {combatParts.length > 0 && (
            <div className="text-sm text-gray-200 font-medium mt-2">
              {combatParts.join(' · ')}
            </div>
          )}

          {/* Identity */}
          {(identityParts.length > 0 || character.linkshell) && (
            <div className="text-sm text-gray-400 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 mt-0.5">
              {identityParts.length > 0 && <span>{identityParts.join(' · ')}</span>}
              {character.linkshell && (
                <span className="flex items-center gap-1">
                  {identityParts.length > 0 && <span className="text-gray-600">·</span>}
                  {character.linkshellLogoUrl ? (
                    <img src={character.linkshellLogoUrl} alt="" title={character.linkshell} className="h-4 w-4 shrink-0 object-contain" />
                  ) : (
                    <LinkshellPearl colorRgb={character.linkshellColorRgb} size={12} title={character.linkshell} />
                  )}
                  <span>{character.linkshell}</span>
                </span>
              )}
            </div>
          )}

          {/* Meta */}
          {metaParts.length > 0 && (
            <div className="text-xs text-gray-500 mt-1">
              {metaParts.join(' · ')}
            </div>
          )}

          {/* Owner — only on public profiles, where owner info is provided */}
          {owner && (
            <div className="mt-2 flex items-center gap-2 text-sm">
              <span className="text-gray-500">Owned by</span>
              <Link
                to={`/users/${owner.ownerUsername}`}
                className="text-blue-400 hover:text-blue-300 transition-colors"
              >
                {ownerDisplayLabel(owner)}
              </Link>
              {shouldShowMessageButton(owner) && (
                <MessageButton toUserId={owner.ownerUserId} toName={ownerDisplayLabel(owner)} />
              )}
            </div>
          )}
        </div>

        {/* Right rail: achievement score + owner controls. Only when it has content. */}
        {(achievement || showPublicButton) && (
          <div className="border-l border-gray-800 pl-4 flex-shrink-0 text-right">
            {achievement && (
              <AchievementRankBadge
                achievement={achievement}
                server={character.server}
                characterId={character.id}
              />
            )}
            {showPublicButton && (
              <div className={`flex justify-end gap-2 ${achievement ? 'mt-3' : ''}`}>
                <button
                  onClick={onRoleClick}
                  aria-label="Set character type"
                  className={
                    character.role && character.role !== 'None'
                      ? 'rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-300 hover:bg-gray-700 transition-colors'
                      : 'rounded border border-dashed border-gray-600 bg-transparent px-2 py-1 text-xs text-gray-500 hover:text-gray-300 hover:border-gray-500 transition-colors'
                  }
                >
                  {character.role && character.role !== 'None' ? roleLabel(character.role) : '+ Set type'}
                </button>
                <button
                  onClick={character.isPublic ? onShareClick : onTogglePublic}
                  className={`flex items-center gap-1.5 rounded px-3 py-1 text-xs font-medium transition-colors ${
                    character.isPublic
                      ? 'bg-green-900/40 text-green-400 border border-green-700 hover:bg-green-900/60'
                      : 'bg-gray-800 text-gray-400 border border-gray-700 hover:bg-gray-700 hover:text-gray-200'
                  }`}
                >
                  {character.isPublic ? 'Public Profile' : 'Make Public'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
