import { useState, useEffect, useCallback } from 'react'
import { api, ApiError } from '../api/client'

interface ReportReporter {
  id: string
  username: string | null
  displayName: string | null
}

interface ReportedMessage {
  id: number | null
  senderId: string | null
  body: string | null
}

interface Report {
  id: number
  reporter: ReportReporter
  conversationId: number
  reportedMessage: ReportedMessage | null
  note: string | null
  status: 'Open' | 'Reviewed'
  createdAt: string
}

interface ReportsResponse {
  items: Report[]
}

const statusBadgeStyles: Record<Report['status'], string> = {
  Open: 'bg-amber-900/50 text-amber-400',
  Reviewed: 'bg-gray-800 text-gray-500',
}

export default function AdminReportsPage() {
  const [reports, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [includeReviewed, setIncludeReviewed] = useState(false)
  const [reviewingIds, setReviewingIds] = useState<Set<number>>(new Set())

  const fetchReports = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await api<ReportsResponse>(
        `/api/admin/reports?includeReviewed=${includeReviewed}`
      )
      setReports(data.items)
    } catch (err) {
      if (err instanceof ApiError) setError(err.message)
      else setError('Failed to load reports')
    } finally {
      setLoading(false)
    }
  }, [includeReviewed])

  useEffect(() => {
    fetchReports()
  }, [fetchReports])

  const handleMarkReviewed = async (id: number) => {
    setReviewingIds((prev) => new Set(prev).add(id))
    try {
      await api(`/api/admin/reports/${id}/reviewed`, { method: 'POST' })
      setReports((prev) =>
        includeReviewed
          ? prev.map((r) => (r.id === id ? { ...r, status: 'Reviewed' as const } : r))
          : prev.filter((r) => r.id !== id)
      )
    } catch (err) {
      if (err instanceof ApiError) setError(err.message)
      else setError('Failed to mark report as reviewed')
    } finally {
      setReviewingIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }

  const reporterLabel = (r: ReportReporter) =>
    r.displayName ?? r.username ?? r.id

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Reports</h1>
        <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={includeReviewed}
            onChange={(e) => setIncludeReviewed(e.target.checked)}
            className="rounded border-gray-600 bg-gray-800 accent-blue-500"
          />
          Include reviewed
        </label>
      </div>

      {error && (
        <div className="mb-4 rounded bg-red-900/50 border border-red-700 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-gray-400">Loading reports...</p>
      ) : reports.length === 0 ? (
        <div className="rounded-lg border border-gray-800 bg-gray-900 px-6 py-10 text-center text-gray-500">
          No reports.
        </div>
      ) : (
        <div className="rounded-lg border border-gray-800 bg-gray-900 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-left text-gray-500">
                <th className="px-4 py-3 font-medium">Reporter</th>
                <th className="px-4 py-3 font-medium hidden sm:table-cell">Date</th>
                <th className="px-4 py-3 font-medium hidden md:table-cell">Conv&nbsp;ID</th>
                <th className="px-4 py-3 font-medium">Message / Note</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => {
                const msgBody = r.reportedMessage?.body ?? null
                const preview = msgBody ?? r.note ?? '—'
                const isReviewing = reviewingIds.has(r.id)

                return (
                  <tr key={r.id} className="border-b border-gray-800 last:border-0">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-200 truncate max-w-[12rem]">
                        {reporterLabel(r.reporter)}
                      </p>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell text-gray-500 whitespace-nowrap">
                      {new Date(r.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-gray-400">
                      {r.conversationId}
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      <p className="text-gray-300 line-clamp-2 break-words">{preview}</p>
                      {msgBody && r.note && (
                        <p className="mt-1 text-xs text-gray-500 line-clamp-1">
                          Note: {r.note}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className={`rounded px-2 py-1 text-xs font-medium ${statusBadgeStyles[r.status]}`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {r.status === 'Open' && (
                        <button
                          onClick={() => handleMarkReviewed(r.id)}
                          disabled={isReviewing}
                          className="text-xs text-blue-400 hover:text-blue-300 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isReviewing ? 'Saving...' : 'Mark reviewed'}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-4 text-xs text-gray-600">
        {reports.length} report{reports.length !== 1 ? 's' : ''}
        {!includeReviewed ? ' (open only)' : ''}
      </p>
    </div>
  )
}
