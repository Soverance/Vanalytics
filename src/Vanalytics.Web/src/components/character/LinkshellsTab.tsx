import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api/client'
import type { LinkshellsResponse } from '../../types/api'
import LoadingSpinner from '../LoadingSpinner'
import LinkshellPearl from './LinkshellPearl'

interface Props {
  characterId: string
  server: string
  fetchBase?: string
}

const RANK_STYLE: Record<string, string> = {
  Leader: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
  Sackholder: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
  Member: 'bg-gray-700/40 text-gray-400 border-gray-600/50',
}

export default function LinkshellsTab({ characterId, server, fetchBase }: Props) {
  const base = fetchBase ?? `/api/characters/${characterId}`
  const [data, setData] = useState<LinkshellsResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api<LinkshellsResponse>(`${base}/linkshells`)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [base])

  if (loading) return <LoadingSpinner />

  const linkshells = data?.linkshells ?? []
  if (linkshells.length === 0) {
    return (
      <p className="text-gray-400 text-sm">
        No linkshells captured yet. Run a sync while a linkshell is equipped — Vanalytics
        reads your equipped linkshell pearls directly from Windower on each sync.
      </p>
    )
  }

  return (
    <div className="rounded border border-gray-700/60 bg-gray-900/30 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-800">
            <th className="px-3 py-2 font-medium">Linkshell</th>
            <th className="px-3 py-2 font-medium">Role</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Last seen</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800/60">
          {linkshells.map((ls, i) => (
            <tr key={`${ls.name}-${i}`} className="hover:bg-gray-800/30">
              <td className="px-3 py-2">
                <Link
                  to={`/${encodeURIComponent(server)}/linkshell/${encodeURIComponent(ls.name)}`}
                  className="flex items-center gap-2 text-gray-200 hover:text-blue-300"
                >
                  {ls.logoUrl ? (
                    <img src={ls.logoUrl} alt="" title={ls.name} className="h-4 w-4 shrink-0 object-contain" />
                  ) : (
                    <LinkshellPearl colorRgb={ls.colorRgb} size={14} title={ls.name} />
                  )}
                  <span className="truncate">{ls.name}</span>
                </Link>
              </td>
              <td className="px-3 py-2">
                <span
                  className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-medium ${
                    RANK_STYLE[ls.rank] ?? RANK_STYLE.Member
                  }`}
                >
                  {ls.rank}
                </span>
              </td>
              <td className="px-3 py-2">
                {ls.isCurrent ? (
                  <span className="text-emerald-400 text-xs">Current</span>
                ) : (
                  <span className="text-gray-500 text-xs">Former</span>
                )}
              </td>
              <td className="px-3 py-2 text-gray-500 text-xs">
                {new Date(ls.lastSeenAt).toLocaleDateString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
