// src/Vanalytics.Web/src/components/session/SessionsTab.tsx
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import type { SessionSummary, SessionListResponse } from '../../types/api'
import { api } from '../../api/client'

interface SessionsTabProps {
  characterId: string
}

function formatDuration(startedAt: string, endedAt: string | null): string {
  if (!endedAt) return 'Active'

  const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime()
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m ${seconds}s`
}

export default function SessionsTab({ characterId }: SessionsTabProps) {
  const navigate = useNavigate()
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)

  const pageSize = 20
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))

  useEffect(() => {
    setLoading(true)
    api<SessionListResponse>(`/api/sessions?page=${page}&pageSize=${pageSize}&characterId=${characterId}`)
      .then((data) => {
        setSessions(data.sessions)
        setTotalCount(data.totalCount)
      })
      .catch(() => {
        setSessions([])
        setTotalCount(0)
      })
      .finally(() => setLoading(false))
  }, [page, characterId])

  if (loading) return <p className="text-gray-400">Loading...</p>

  if (sessions.length === 0) {
    return (
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-8 text-center">
        <p className="text-gray-400 mb-2">No sessions yet.</p>
        <p className="text-sm text-gray-500">
          Start tracking with <code className="bg-gray-800 px-1 rounded text-gray-300">//va session start</code> in-game.
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="overflow-x-auto rounded-lg border border-gray-800">
        <table className="w-full text-sm text-left">
          <thead className="bg-gray-800 text-gray-400 uppercase text-xs">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Zone</th>
              <th className="px-4 py-3">Duration</th>
              <th className="px-4 py-3 text-right">Total Damage</th>
              <th className="px-4 py-3 text-right">Gil Earned</th>
              <th className="px-4 py-3 text-right">Drops</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {sessions.map((s) => (
              <tr
                key={s.id}
                onClick={() => navigate(`/sessions/${s.id}`)}
                className="bg-gray-900 hover:bg-gray-800 cursor-pointer transition-colors"
              >
                <td className="px-4 py-3 whitespace-nowrap">
                  {new Date(s.startedAt).toLocaleString()}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">{s.zone}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {s.endedAt === null ? (
                    <span className="text-green-400">Active</span>
                  ) : (
                    formatDuration(s.startedAt, s.endedAt)
                  )}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  {s.totalDamage.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  {s.gilEarned.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  {s.itemsDropped}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between mt-4">
        <button
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page <= 1}
          className="rounded border border-gray-700 bg-gray-800 px-4 py-2 text-sm text-gray-100 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-700 transition-colors"
        >
          Previous
        </button>
        <span className="text-sm text-gray-400">
          Page {page} of {totalPages}
        </span>
        <button
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={page >= totalPages}
          className="rounded border border-gray-700 bg-gray-800 px-4 py-2 text-sm text-gray-100 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-700 transition-colors"
        >
          Next
        </button>
      </div>
    </>
  )
}
