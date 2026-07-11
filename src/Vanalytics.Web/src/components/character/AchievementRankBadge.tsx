import { Link } from 'react-router-dom'
import type { CharacterAchievementResponse } from '../../types/api'
import { isPrivateRanking } from '../achievements/achievementUtils'

interface Props {
  achievement: CharacterAchievementResponse
  server: string
  characterId: string
}

export default function AchievementRankBadge({ achievement, server, characterId }: Props) {
  const { globalRank, serverRank, totalScore } = achievement
  const isPrivate = isPrivateRanking(globalRank, serverRank)

  if (isPrivate) {
    return (
      <div className="text-right flex-shrink-0">
        <div className="text-xs text-gray-500 italic">Unranked · private</div>
        <div className="text-sm tabular-nums text-gray-400 mt-0.5">
          {totalScore.toLocaleString()}
        </div>
      </div>
    )
  }

  const globalLink = globalRank != null
    ? `/leaderboards?board=characters&focusRank=${globalRank}&focusId=${encodeURIComponent(characterId)}`
    : null

  const serverLink = serverRank != null
    ? `/leaderboards?board=characters&server=${encodeURIComponent(server)}&focusRank=${serverRank}&focusId=${encodeURIComponent(characterId)}`
    : null

  // Build the rank display: "1359 (36)" or just one if the other is null
  const rankDisplay = (
    <span className="text-2xl font-bold tabular-nums leading-none">
      {globalLink ? (
        <Link to={globalLink} className="text-blue-400 hover:text-blue-300 transition-colors">
          {globalRank!.toLocaleString()}
        </Link>
      ) : (
        <span className="text-gray-300">{globalRank?.toLocaleString() ?? '—'}</span>
      )}
      {serverLink && (
        <>
          {' '}
          <span className="text-gray-500 text-xl">(</span>
          <Link to={serverLink} className="text-blue-400 hover:text-blue-300 transition-colors text-xl">
            {serverRank!.toLocaleString()}
          </Link>
          <span className="text-gray-500 text-xl">)</span>
        </>
      )}
    </span>
  )

  return (
    <div className="text-right flex-shrink-0">
      {rankDisplay}
      <div className="text-xs text-gray-500 mt-0.5">
        {globalRank != null && serverRank != null
          ? 'Overall (Server)'
          : globalRank != null
            ? 'Overall'
            : 'Server'}
      </div>
      <div className="text-sm tabular-nums text-gray-400 mt-0.5">
        {totalScore.toLocaleString()}
      </div>
    </div>
  )
}
