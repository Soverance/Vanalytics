import { useState, useEffect, useCallback, useRef } from 'react'
import { getAchievementAdminStatus, startRescore, getRescoreStatus } from '../api/client'
import type { AchievementAdminStatus, AchievementRescoreStatus } from '../types/api'
import { deriveRescoreView } from './adminAchievementsView'

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
  const [rescore, setRescore] = useState<AchievementRescoreStatus | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

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

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  const poll = useCallback(async () => {
    try {
      const s = await getRescoreStatus()
      setRescore(s)
      if (!s.isRunning) {
        stopPolling()
        await fetchStatus()
      }
    } catch {
      /* transient poll error — keep polling */
    }
  }, [fetchStatus, stopPolling])

  const startPolling = useCallback(() => {
    if (pollRef.current) return
    pollRef.current = setInterval(poll, 2000)
  }, [poll])

  useEffect(() => {
    fetchStatus()
    getRescoreStatus()
      .then((s) => {
        setRescore(s)
        if (s.isRunning) startPolling()
      })
      .catch(() => {})
    return () => stopPolling()
  }, [fetchStatus, startPolling, stopPolling])

  const handleRescore = async () => {
    setError(null)
    try {
      await startRescore() // 409 (already running) is handled as "just start polling"
      await poll()
      startPolling()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Rescore failed to start.')
    }
  }

  const view = deriveRescoreView(rescore)
  const running = view.running
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
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-200 mb-1">Rescore all characters</p>
              <p className="text-xs text-gray-500 leading-relaxed max-w-xl">
                Recomputes every character's score and re-aggregates every linkshell. Runs in the
                background — you can leave this page and come back; progress is shown below.
              </p>

              {rescore && view.showProgress && (
                <div className="mt-3 max-w-md">
                  <div className="flex justify-between text-[11px] text-gray-400 mb-1">
                    <span>{running ? 'Rescoring…' : 'Last run complete'}</span>
                    <span>
                      {rescore.processed.toLocaleString()} / {rescore.total.toLocaleString()}
                      {view.failed > 0 ? ` · ${view.failed} failed` : ''}
                    </span>
                  </div>
                  <div className="h-2 rounded bg-gray-800 overflow-hidden">
                    <div
                      className="h-full bg-blue-600 transition-[width] duration-500"
                      style={{ width: `${view.pct}%` }}
                    />
                  </div>
                  {view.stalled && (
                    <p className="mt-1 text-[11px] text-amber-400">
                      ⚠ Previous run appears stalled — you can start a new one.
                    </p>
                  )}
                  {!running && rescore.lastError && (
                    <p className="mt-1 text-[11px] text-red-400">Last error: {rescore.lastError}</p>
                  )}
                </div>
              )}
              {error && status && <p className="mt-2 text-xs text-red-400">{error}</p>}
            </div>
            <div className="shrink-0">
              <button
                onClick={handleRescore}
                disabled={running}
                className="px-3 py-1.5 text-sm rounded bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 transition-colors"
              >
                {running ? 'Rescoring…' : 'Rescore all characters'}
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
