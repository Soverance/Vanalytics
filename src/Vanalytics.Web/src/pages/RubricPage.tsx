import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { getRubric } from '../api/client'
import type { RubricResponse } from '../types/api'
import LoadingSpinner from '../components/LoadingSpinner'

export default function RubricPage() {
  const [data, setData] = useState<RubricResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    getRubric()
      .then(setData)
      .catch(() => setError('Failed to load rubric.'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="max-w-3xl">
      <Link
        to="/leaderboards"
        className="text-sm text-blue-400 hover:underline mb-4 inline-block"
      >
        &larr; Back to Leaderboards
      </Link>

      <h1 className="text-2xl font-bold mb-6">
        Achievement Scoring{data ? ` — Rubric v${data.version}` : ''}
      </h1>

      {loading ? (
        <LoadingSpinner />
      ) : error ? (
        <p className="text-red-400 text-sm">{error}</p>
      ) : !data || data.categories.length === 0 ? (
        <p className="text-gray-400 text-sm">No rubric data available.</p>
      ) : (
        <>
          <p className="text-sm text-gray-400 mb-6">
            Achievement scores are computed automatically each time your character syncs.
            Each category below contributes points based on in-game progress captured by the
            Vanalytics addon.
          </p>

          <div className="overflow-x-auto rounded-lg border border-gray-800">
            <table className="w-full text-sm">
              <thead className="bg-gray-900">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-1/4">
                    Category
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-2/5">
                    Description
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Scoring
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.categories.map((cat, i) => (
                  <tr
                    key={cat.key}
                    className={`border-t border-gray-800 ${i % 2 === 0 ? '' : 'bg-gray-900/30'}`}
                  >
                    <td className="px-4 py-3 font-medium text-gray-100 align-top">
                      {cat.name}
                    </td>
                    <td className="px-4 py-3 text-gray-400 align-top">
                      {cat.description}
                    </td>
                    <td className="px-4 py-3 text-gray-300 align-top tabular-nums">
                      {cat.scoring}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-4 text-xs text-gray-600">
            Scores are recomputed on every sync. The rubric may be updated between versions;
            existing scores are backfilled when the rubric changes.
          </p>
        </>
      )}
    </div>
  )
}
