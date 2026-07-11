import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api, getCharacterLeaderboard, getLinkshellLeaderboard } from '../api/client'
import { useAuth } from '../context/AuthContext'
import type {
  GameServer,
  CharacterLeaderboardEntry,
  LinkshellLeaderboardEntry,
  LeaderboardPage,
} from '../types/api'
import LoadingSpinner from '../components/LoadingSpinner'
import Tabs from '../components/Tabs'
import { ChevronUp, ChevronDown, HelpCircle } from 'lucide-react'
import { timeAgo } from '../lib/leaderboards'

type TabValue = 'characters' | 'linkshells'
type LsSort = 'total' | 'average' | 'members'

const PAGE_SIZE = 50

const TABS: { value: TabValue; label: string }[] = [
  { value: 'characters', label: 'Characters' },
  { value: 'linkshells', label: 'Linkshells' },
]

const thClass =
  'px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider select-none'
const thSortClass =
  'px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-300 transition-colors select-none'

function SortIcon({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  if (!active) return null
  return dir === 'asc'
    ? <ChevronUp className="inline h-3 w-3 ml-1" />
    : <ChevronDown className="inline h-3 w-3 ml-1" />
}

function Pagination({
  page,
  total,
  pageSize,
  onPage,
}: {
  page: number
  total: number
  pageSize: number
  onPage: (p: number) => void
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  if (totalPages <= 1) return null
  return (
    <div className="flex items-center justify-between mt-4 text-sm text-gray-400">
      <span>
        {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
      </span>
      <div className="flex gap-2">
        <button
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          className="px-3 py-1 rounded border border-gray-700 bg-gray-800 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Prev
        </button>
        <button
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
          className="px-3 py-1 rounded border border-gray-700 bg-gray-800 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Next
        </button>
      </div>
    </div>
  )
}

export default function LeaderboardsPage() {
  const { user } = useAuth()
  const [tab, setTab] = useState<TabValue>('characters')
  const [servers, setServers] = useState<GameServer[]>([])
  const [selectedServer, setSelectedServer] = useState<string>('')

  // Characters tab state
  const [charPage, setCharPage] = useState(1)
  const [charData, setCharData] = useState<LeaderboardPage<CharacterLeaderboardEntry> | null>(null)
  const [charLoading, setCharLoading] = useState(false)
  const [charError, setCharError] = useState<string | null>(null)

  // Linkshells tab state
  const [lsSort, setLsSort] = useState<LsSort>('total')
  const [lsPage, setLsPage] = useState(1)
  const [lsData, setLsData] = useState<LeaderboardPage<LinkshellLeaderboardEntry> | null>(null)
  const [lsLoading, setLsLoading] = useState(false)
  const [lsError, setLsError] = useState<string | null>(null)

  // Load server list once
  useEffect(() => {
    api<GameServer[]>('/api/servers').then(setServers).catch(() => {})
  }, [])

  // Set default server once servers + auth are ready
  useEffect(() => {
    if (servers.length === 0) return
    if (selectedServer) return
    const defaultServer = user?.defaultServer || servers[0]?.name || ''
    setSelectedServer(defaultServer)
  }, [servers, user])

  // Fetch character leaderboard
  useEffect(() => {
    if (!selectedServer) return
    setCharLoading(true)
    setCharError(null)
    const server = selectedServer === 'All Servers' ? undefined : selectedServer
    getCharacterLeaderboard(server, charPage, PAGE_SIZE)
      .then(setCharData)
      .catch(() => setCharError('Failed to load character leaderboard.'))
      .finally(() => setCharLoading(false))
  }, [selectedServer, charPage])

  // Fetch linkshell leaderboard
  useEffect(() => {
    if (!selectedServer) return
    setLsLoading(true)
    setLsError(null)
    const server = selectedServer === 'All Servers' ? undefined : selectedServer
    getLinkshellLeaderboard(server, lsSort, lsPage, PAGE_SIZE)
      .then(setLsData)
      .catch(() => setLsError('Failed to load linkshell leaderboard.'))
      .finally(() => setLsLoading(false))
  }, [selectedServer, lsSort, lsPage])

  // Reset page when server or sort changes
  const handleServerChange = (val: string) => {
    setSelectedServer(val)
    setCharPage(1)
    setLsPage(1)
  }

  const handleLsSort = (col: LsSort) => {
    setLsSort(col)
    setLsPage(1)
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold">Leaderboards</h1>
        <Link
          to="/leaderboards/rubric"
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-blue-400 transition-colors"
        >
          <HelpCircle className="h-4 w-4 shrink-0" />
          How scoring works
        </Link>
      </div>

      <div className="mb-5">
        <select
          value={selectedServer}
          onChange={e => handleServerChange(e.target.value)}
          className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 focus:border-blue-500 focus:outline-none"
        >
          <option value="All Servers">All Servers</option>
          {servers.map(s => (
            <option key={s.name} value={s.name}>{s.name}</option>
          ))}
        </select>
      </div>

      <Tabs items={TABS} value={tab} onChange={setTab} />

      {tab === 'characters' && (
        <div>
          {charLoading ? (
            <LoadingSpinner />
          ) : charError ? (
            <div className="text-center py-16">
              <p className="text-red-400">{charError}</p>
            </div>
          ) : !charData || charData.items.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-gray-400">No ranked characters yet.</p>
              <p className="text-sm text-gray-500 mt-2">
                Characters appear here once achievement scores have been computed.
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto rounded-lg border border-gray-800">
                <table className="w-full text-sm">
                  <thead className="bg-gray-900">
                    <tr>
                      <th className={thClass}>#</th>
                      <th className={thClass}>Name</th>
                      <th className={thClass}>Server</th>
                      <th className={thClass}>Score</th>
                      <th className={thClass}>Linkshell</th>
                      <th className={thClass}>Last Synced</th>
                    </tr>
                  </thead>
                  <tbody>
                    {charData.items.map(entry => (
                      <tr
                        key={entry.characterId}
                        className="border-t border-gray-800 hover:bg-gray-800/50 transition-colors"
                      >
                        <td className="px-3 py-2 text-gray-500 tabular-nums w-12">{entry.rank}</td>
                        <td className="px-3 py-2 font-medium text-gray-100">
                          <Link
                            to={`/${encodeURIComponent(entry.server)}/${encodeURIComponent(entry.name)}`}
                            className="hover:text-blue-400 transition-colors"
                          >
                            {entry.name}
                          </Link>
                        </td>
                        <td className="px-3 py-2 text-gray-400">{entry.server}</td>
                        <td className="px-3 py-2 text-gray-100 tabular-nums font-medium">{entry.totalScore.toLocaleString()}</td>
                        <td className="px-3 py-2 text-gray-400">{entry.linkshell ?? '—'}</td>
                        <td className="px-3 py-2 text-gray-400">{timeAgo(entry.lastSyncAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination
                page={charPage}
                total={charData.total}
                pageSize={PAGE_SIZE}
                onPage={setCharPage}
              />
            </>
          )}
        </div>
      )}

      {tab === 'linkshells' && (
        <div>
          {lsLoading ? (
            <LoadingSpinner />
          ) : lsError ? (
            <div className="text-center py-16">
              <p className="text-red-400">{lsError}</p>
            </div>
          ) : !lsData || lsData.items.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-gray-400">No ranked linkshells yet.</p>
              <p className="text-sm text-gray-500 mt-2">
                Linkshells appear here once member achievement scores have been computed.
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto rounded-lg border border-gray-800">
                <table className="w-full text-sm">
                  <thead className="bg-gray-900">
                    <tr>
                      <th className={thClass}>#</th>
                      <th className={thClass}>Linkshell</th>
                      <th className={thClass}>Server</th>
                      <th
                        className={thSortClass}
                        onClick={() => handleLsSort('total')}
                      >
                        Total
                        <SortIcon active={lsSort === 'total'} dir="desc" />
                      </th>
                      <th
                        className={thSortClass}
                        onClick={() => handleLsSort('average')}
                      >
                        Avg
                        <SortIcon active={lsSort === 'average'} dir="desc" />
                      </th>
                      <th
                        className={thSortClass}
                        onClick={() => handleLsSort('members')}
                      >
                        Members
                        <SortIcon active={lsSort === 'members'} dir="desc" />
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {lsData.items.map(entry => (
                      <tr
                        key={entry.linkshellId}
                        className="border-t border-gray-800 hover:bg-gray-800/50 transition-colors"
                      >
                        <td className="px-3 py-2 text-gray-500 tabular-nums w-12">{entry.rank}</td>
                        <td className="px-3 py-2 font-medium text-gray-100">
                          <Link
                            to={`/${encodeURIComponent(entry.server)}/linkshell/${encodeURIComponent(entry.name)}`}
                            className="hover:text-blue-400 transition-colors"
                          >
                            {entry.name}
                          </Link>
                        </td>
                        <td className="px-3 py-2 text-gray-400">{entry.server}</td>
                        <td className="px-3 py-2 text-gray-100 tabular-nums font-medium">{entry.totalScore.toLocaleString()}</td>
                        <td className="px-3 py-2 text-gray-400 tabular-nums">{entry.averageScore.toLocaleString()}</td>
                        <td className="px-3 py-2 text-gray-400 tabular-nums">{entry.rankedMemberCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination
                page={lsPage}
                total={lsData.total}
                pageSize={PAGE_SIZE}
                onPage={setLsPage}
              />
            </>
          )}
        </div>
      )}
    </div>
  )
}
