import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../context/AuthContext'
import type { PlayerListItem, GameServer } from '../types/api'
import LoadingSpinner from '../components/LoadingSpinner'
import { ChevronUp, ChevronDown } from 'lucide-react'

type SortKey = keyof PlayerListItem
type SortDir = 'asc' | 'desc'

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return '—'
  const ms = Date.now() - new Date(dateStr).getTime()
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export default function PlayerDirectoryPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [players, setPlayers] = useState<PlayerListItem[]>([])
  const [servers, setServers] = useState<GameServer[]>([])
  const [selectedServer, setSelectedServer] = useState<string>('')
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [loading, setLoading] = useState(true)

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

  // Fetch players when server selection changes
  useEffect(() => {
    if (!selectedServer) return
    setLoading(true)
    const param = selectedServer === 'All Servers' ? '' : `?server=${encodeURIComponent(selectedServer)}`
    api<PlayerListItem[]>(`/api/players${param}`)
      .then(setPlayers)
      .catch(() => setPlayers([]))
      .finally(() => setLoading(false))
  }, [selectedServer])

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir(key === 'totalScore' ? 'desc' : 'asc')
    }
  }

  const filtered = useMemo(() => {
    let list = players
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.server.toLowerCase().includes(q) ||
        (p.job?.toLowerCase().includes(q)) ||
        (p.linkshell?.toLowerCase().includes(q))
      )
    }
    return [...list].sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'asc' ? av - bv : bv - av
      }
      const as = String(av).toLowerCase()
      const bs = String(bv).toLowerCase()
      return sortDir === 'asc' ? as.localeCompare(bs) : bs.localeCompare(as)
    })
  }, [players, search, sortKey, sortDir])

  const SortIndicator = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return null
    return sortDir === 'asc'
      ? <ChevronUp className="inline h-3 w-3 ml-1" />
      : <ChevronDown className="inline h-3 w-3 ml-1" />
  }

  const thClass = 'px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-300 transition-colors select-none'

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Players</h1>

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <select
          value={selectedServer}
          onChange={e => setSelectedServer(e.target.value)}
          className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 focus:border-blue-500 focus:outline-none"
        >
          <option value="All Servers">All Servers</option>
          {servers.map(s => (
            <option key={s.name} value={s.name}>{s.name}</option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Search by name, job, or linkshell..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-[200px] rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
        />
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-400">No public characters found.</p>
          <p className="text-sm text-gray-500 mt-2">
            Characters appear here when their owners mark them as public in their profile settings.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-800">
          <table className="w-full text-sm">
            <thead className="bg-gray-900">
              <tr>
                <th className={thClass} onClick={() => handleSort('name')}>Name<SortIndicator col="name" /></th>
                <th className={thClass} onClick={() => handleSort('server')}>Server<SortIndicator col="server" /></th>
                <th className={thClass} onClick={() => handleSort('job')}>Job<SortIndicator col="job" /></th>
                <th className={thClass} onClick={() => handleSort('level')}>Level<SortIndicator col="level" /></th>
                <th className={thClass} onClick={() => handleSort('race')}>Race<SortIndicator col="race" /></th>
                <th className={thClass} onClick={() => handleSort('linkshell')}>Linkshell<SortIndicator col="linkshell" /></th>
                <th className={thClass} onClick={() => handleSort('totalScore')}>Score<SortIndicator col="totalScore" /></th>
                <th className={thClass} onClick={() => handleSort('lastSyncedAt')}>Last Synced<SortIndicator col="lastSyncedAt" /></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <tr
                  key={`${p.server}-${p.name}`}
                  onClick={() => navigate(`/${p.server}/${p.name}`)}
                  className="border-t border-gray-800 hover:bg-gray-800/50 cursor-pointer transition-colors"
                >
                  <td className="px-3 py-2 font-medium text-gray-100">{p.name}</td>
                  <td className="px-3 py-2 text-gray-400">{p.server}</td>
                  <td className="px-3 py-2 text-gray-400">{p.job ?? '—'}</td>
                  <td className="px-3 py-2 text-gray-400">{p.level ?? '—'}</td>
                  <td className="px-3 py-2 text-gray-400">{p.race ?? '—'}</td>
                  <td className="px-3 py-2 text-gray-400">{p.linkshell ?? '—'}</td>
                  <td className="px-3 py-2 text-gray-400">{p.totalScore > 0 ? p.totalScore.toLocaleString() : '—'}</td>
                  <td className="px-3 py-2 text-gray-400">{timeAgo(p.lastSyncedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
