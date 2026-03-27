import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import type { SessionDetail, SessionEvent, SessionTimelineEntry, SessionEventsResponse } from '../types/api'
import OverviewTab from '../components/session/OverviewTab'
import CombatTab from '../components/session/CombatTab'
import FarmingTab from '../components/session/FarmingTab'

const TABS = ['Overview', 'Combat', 'Farming'] as const
type Tab = typeof TABS[number]

function formatDuration(startedAt: string, endedAt: string | null): string {
  if (!endedAt) return 'Active'
  const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime()
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`
  return `${minutes}m ${seconds}s`
}

function statusBadge(status: string) {
  const colors: Record<string, string> = {
    Completed: 'bg-green-900 text-green-300',
    Active: 'bg-blue-900 text-blue-300',
    Abandoned: 'bg-amber-900 text-amber-300',
  }
  return (
    <span className={`text-xs px-2 py-0.5 rounded ${colors[status] || 'bg-gray-800 text-gray-400'}`}>
      {status}
    </span>
  )
}

export default function SessionReportPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('Overview')
  const [session, setSession] = useState<SessionDetail | null>(null)
  const [timeline, setTimeline] = useState<SessionTimelineEntry[]>([])
  const [events, setEvents] = useState<SessionEvent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    setLoading(true)

    Promise.all([
      api<SessionDetail>(`/api/sessions/${id}`),
      api<SessionTimelineEntry[]>(`/api/sessions/${id}/timeline`),
      fetchAllEvents(id),
    ])
      .then(([detail, tl, evts]) => {
        setSession(detail)
        setTimeline(tl)
        setEvents(evts)
      })
      .catch(() => navigate('/characters'))
      .finally(() => setLoading(false))
  }, [id])

  if (loading || !session) {
    return <p className="text-gray-400 p-8">Loading session report...</p>
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="text-sm text-gray-400 flex items-center gap-1">
        <button
          onClick={() => navigate(`/characters/${session.characterId}?tab=Sessions`)}
          className="text-blue-400 hover:underline"
        >
          {session.characterName}
        </button>
        <span>/</span>
        <span className="text-gray-500">Sessions</span>
        <span>/</span>
        <span className="text-gray-300">{session.zone} — {new Date(session.startedAt).toLocaleDateString()}</span>
      </nav>

      {/* Header strip */}
      <div className="flex flex-wrap items-center gap-4 text-sm text-gray-400">
        <span>{new Date(session.startedAt).toLocaleString()} – {session.endedAt ? new Date(session.endedAt).toLocaleString() : 'ongoing'}</span>
        <span>{formatDuration(session.startedAt, session.endedAt)}</span>
        {statusBadge(session.status)}
      </div>

      {/* Compact stat row */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        {[
          { label: 'Total Damage', value: session.totalDamage.toLocaleString() },
          { label: 'DPS Avg', value: Math.round(session.dpsAverage).toLocaleString() },
          { label: 'Mobs Killed', value: session.mobsKilled.toLocaleString() },
          { label: 'Gil Earned', value: session.gilEarned.toLocaleString() },
          { label: 'Items Dropped', value: session.itemsDropped.toLocaleString() },
          { label: 'Healing Done', value: session.healingDone.toLocaleString() },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border border-gray-800 bg-gray-900 px-3 py-2">
            <div className="text-xs text-gray-500 uppercase">{s.label}</div>
            <div className="text-lg text-gray-100 font-semibold">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-800">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'Overview' && (
        <OverviewTab session={session} timeline={timeline} events={events} />
      )}
      {tab === 'Combat' && (
        <CombatTab session={session} events={events} />
      )}
      {tab === 'Farming' && (
        <FarmingTab session={session} events={events} />
      )}
    </div>
  )
}

async function fetchAllEvents(sessionId: string): Promise<SessionEvent[]> {
  const all: SessionEvent[] = []
  let page = 1
  const pageSize = 500
  while (true) {
    const resp = await api<SessionEventsResponse>(
      `/api/sessions/${sessionId}/events?page=${page}&pageSize=${pageSize}`
    )
    all.push(...resp.events)
    if (all.length >= resp.totalCount) break
    page++
  }
  return all
}
