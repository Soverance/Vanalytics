import { useState, useEffect, useCallback } from 'react'
import { getAchievementAdminStatus, rescoreAchievements } from '../api/client'
import type { AchievementAdminStatus } from '../types/api'

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  const mins = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days = Math.floor(diff / 86_400_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`
  return d.toLocaleDateString()
}

export default function AdminAchievementsPage() {
  const [status, setStatus] = useState<AchievementAdminStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rescoring, setRescoring] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  const fetchStatus = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setStatus(await getAchievementAdminStatus())
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load scoring status.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  const handleRescore = async () => {
    setRescoring(true)
    setError(null)
    setResult(null)
    try {
      const { recomputed } = await rescoreAchievements()
      setResult(`Rescored ${recomputed.toLocaleString()} characters.`)
      await fetchStatus()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Rescore failed.')
    } finally {
      setRescoring(false)
    }
  }

  const needsBackfill = status != null && status.needsRescore > 0

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Achievements Admin</h1>
      <p className="text-sm text-gray-500 mb-6">
        Recompute character &amp; linkshell achievement scores. Run a full rescore after a
        rubric-version bump or to backfill scores for newly synced data.
      </p>

      {/* ── Scoring status ── */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">Scoring Status</h2>
        <div className={`rounded-lg border p-5 bg-gray-900 transition-colors ${needsBackfill ? 'border-amber-700/60' : 'border-gray-800'}`}>
          {loading ? (
            <p className="text-sm text-gray-500">Loading…</p>
          ) : error && !status ? (
            <p className="text-sm text-red-400">{error}</p>
          ) : status ? (
            <div className="space-y-2">
              <p className="text-sm text-gray-200">
                <span className="font-semibold text-gray-100">
                  {status.scoredAtCurrentVersion.toLocaleString()} of {status.totalCharacters.toLocaleString()}
                </span>{' '}
                characters scored at rubric{' '}
                <span className="font-mono text-gray-300">v{status.currentRubricVersion}</span>
              </p>
              {needsBackfill ? (
                <p className="text-xs text-amber-400">
                  ⚠ {status.needsRescore.toLocaleString()} character{status.needsRescore === 1 ? '' : 's'} unscored or on an
                  older rubric — a rescore is recommended.
                </p>
              ) : (
                <p className="text-xs text-emerald-400">✓ All characters are up to date.</p>
              )}
              <p className="text-[11px] text-gray-600">
                Last computed {formatDate(status.lastComputedAt)} · oldest {formatDate(status.oldestComputedAt)}
              </p>
            </div>
          ) : null}
        </div>
      </section>

      {/* ── Rescore ── */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Rescore</h2>
        <div className="rounded-lg border border-gray-800 p-5 bg-gray-900">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-200 mb-1">Rescore all characters</p>
              <p className="text-xs text-gray-500 leading-relaxed max-w-xl">
                Recomputes every character's score and re-aggregates every linkshell. Runs
                synchronously — expect a few seconds per hundred characters.
              </p>
              {result && <p className="mt-2 text-xs text-emerald-400">{result}</p>}
              {error && status && <p className="mt-2 text-xs text-red-400">{error}</p>}
            </div>
            <div className="shrink-0">
              <button
                onClick={handleRescore}
                disabled={rescoring}
                className="px-3 py-1.5 text-sm rounded bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 transition-colors"
              >
                {rescoring ? 'Rescoring…' : 'Rescore all characters'}
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
