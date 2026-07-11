import { Link } from 'react-router-dom'
import type { CharacterAchievementResponse, AchievementCategoryScore } from '../../types/api'

interface Props {
  data: CharacterAchievementResponse
  server: string
}

function CategoryRow({ cat }: { cat: AchievementCategoryScore }) {
  const hasBar = cat.current != null && cat.total != null && cat.total > 0
  const pct = hasBar ? Math.min(100, (cat.current! / cat.total!) * 100) : 0
  const complete = hasBar && cat.current! >= cat.total!

  return (
    <div className="py-2 border-t border-gray-800 first:border-t-0">
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <span className="text-sm text-gray-200 font-medium">{cat.name}</span>
        <span className="text-sm tabular-nums text-gray-100 font-semibold flex-shrink-0">
          {cat.points.toLocaleString()} pts
        </span>
      </div>

      {hasBar ? (
        <>
          {/* Thin progress bar — same pattern as StageProgressBar in RelicCurrencyProgress */}
          <div className="h-1.5 rounded-full bg-gray-700 overflow-hidden mb-1">
            <div
              className={`h-full rounded-full transition-all ${complete ? 'bg-emerald-500' : 'bg-blue-500'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-500">
            <span>{cat.detail || ' '}</span>
            <span className="tabular-nums">
              {cat.current!.toLocaleString()} / {cat.total!.toLocaleString()}
            </span>
          </div>
        </>
      ) : (
        cat.detail ? (
          <p className="text-xs text-gray-500">{cat.detail}</p>
        ) : null
      )}
    </div>
  )
}

export default function AchievementBreakdown({ data, server }: Props) {
  const bothRanksNull = data.globalRank == null && data.serverRank == null

  return (
    <div className="space-y-4">
      {/* Headline score */}
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <div className="text-xs uppercase text-gray-500 tracking-wide mb-0.5">Achievement Score</div>
          <div className="text-4xl font-bold text-gray-100 tabular-nums">
            {data.totalScore.toLocaleString()}
          </div>
          <div className="text-xs text-gray-600 mt-0.5">
            Rubric v{data.rubricVersion} &middot; computed{' '}
            {new Date(data.computedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
          </div>
        </div>

        {/* Rank badges */}
        <div className="flex flex-wrap gap-2 pb-1">
          {bothRanksNull ? (
            <p className="text-xs text-gray-500 italic max-w-xs">
              Private &mdash; make this character public to appear on leaderboards.{' '}
            </p>
          ) : (
            <>
              {data.globalRank != null && (
                <span className="inline-flex items-center gap-1 rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-300">
                  <span className="text-gray-500">#</span>
                  <span className="tabular-nums font-semibold text-gray-100">{data.globalRank.toLocaleString()}</span>
                  <span className="text-gray-500">global</span>
                </span>
              )}
              {data.serverRank != null && (
                <span className="inline-flex items-center gap-1 rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-300">
                  <span className="text-gray-500">#</span>
                  <span className="tabular-nums font-semibold text-gray-100">{data.serverRank.toLocaleString()}</span>
                  <span className="text-gray-500">on {server}</span>
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {/* Category breakdown */}
      {data.breakdown.length > 0 && (
        <div className="rounded-lg border border-gray-800 bg-gray-900/50 px-4 py-2">
          {data.breakdown.map(cat => (
            <CategoryRow key={cat.key} cat={cat} />
          ))}
        </div>
      )}

      <p className="text-xs text-gray-600">
        <Link to="/leaderboards/rubric" className="hover:text-blue-400 transition-colors">
          How is this score calculated?
        </Link>
      </p>
    </div>
  )
}
