// src/Vanalytics.Web/src/pages/BazaarActivityPage.tsx
import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import type { GameServer, BazaarZoneGroup as BazaarZoneGroupType } from '../types/api'
import BazaarZoneGroup from '../components/economy/BazaarZoneGroup'

export default function BazaarActivityPage() {
  const { user } = useAuth()
  const [servers, setServers] = useState<GameServer[]>([])
  const [selectedServer, setSelectedServer] = useState('')
  const [groups, setGroups] = useState<BazaarZoneGroupType[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/servers')
      .then((r) => r.ok ? r.json() : [])
      .then((s: GameServer[]) => {
        setServers(s)
        const defaultName = user?.defaultServer
        const match = defaultName ? s.find(sv => sv.name === defaultName) : null
        if (match) setSelectedServer(match.name)
        else if (s.length > 0) setSelectedServer(s[0].name)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!selectedServer) return
    setLoading(true)
    fetch(`/api/economy/bazaar/active?server=${selectedServer}`)
      .then((r) => r.ok ? r.json() : [])
      .then(setGroups)
      .catch(() => setGroups([]))
      .finally(() => setLoading(false))
  }, [selectedServer])

  const totalPlayers = groups.reduce((sum, g) => sum + g.playerCount, 0)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Bazaar Activity</h1>
          <p className="text-sm text-gray-500">
            {totalPlayers} player{totalPlayers !== 1 ? 's' : ''} with active bazaars
          </p>
        </div>
        <select
          value={selectedServer}
          onChange={(e) => setSelectedServer(e.target.value)}
          className="rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100"
        >
          {servers.map((s) => (
            <option key={s.id} value={s.name}>{s.name}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="text-gray-400">Loading bazaar activity...</p>
      ) : groups.length === 0 ? (
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-8 text-center">
          <p className="text-gray-400 mb-2">No active bazaars detected on {selectedServer}.</p>
          <p className="text-sm text-gray-500 mb-4">
            Bazaar presence is detected by players running the Vanalytics Windower addon.
          </p>
          <Link to="/items" className="text-sm text-blue-400 hover:underline">
            Browse the Item Database
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((g) => (
            <BazaarZoneGroup key={g.zone} group={g} />
          ))}
        </div>
      )}
    </div>
  )
}
