import { useState, useEffect, useMemo } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import type { SessionDetail, SessionEvent, SessionEventsResponse, SessionTimelineEntry } from '../types/api'

const TABS = ['Timeline', 'Combat', 'Loot', 'Raw Events'] as const
type Tab = typeof TABS[number]

const EVENT_TYPES = [
  'MeleeDamage', 'RangedDamage', 'MagicDamage', 'AbilityDamage',
  'WeaponSkillDamage', 'Healing', 'ItemDrop', 'GilGain', 'GilLoss',
  'MobKill', 'ExpGain', 'Unknown',
] as const

function fmt(n: number): string {
  return n.toLocaleString()
}

function fmt1(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

function formatDuration(startedAt: string, endedAt: string | null): string {
  const start = new Date(startedAt).getTime()
  const end = endedAt ? new Date(endedAt).getTime() : Date.now()
  const totalSec = Math.floor((end - start) / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  return `${h}h ${m}m ${s}s`
}

function relativeTime(sessionStart: string, timestamp: string): string {
  const diff = Math.floor((new Date(timestamp).getTime() - new Date(sessionStart).getTime()) / 1000)
  const m = Math.floor(diff / 60)
  const s = diff % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function SessionDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [session, setSession] = useState<SessionDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>('Timeline')

  // Timeline data
  const [timeline, setTimeline] = useState<SessionTimelineEntry[]>([])
  const [timelineLoading, setTimelineLoading] = useState(false)

  // All events (for Combat + Loot tabs)
  const [allEvents, setAllEvents] = useState<SessionEvent[]>([])
  const [allEventsLoading, setAllEventsLoading] = useState(false)

  // Raw Events tab (paginated)
  const [rawEvents, setRawEvents] = useState<SessionEvent[]>([])
  const [rawTotal, setRawTotal] = useState(0)
  const [rawPage, setRawPage] = useState(1)
  const [rawLoading, setRawLoading] = useState(false)
  const [rawTypeFilters, setRawTypeFilters] = useState<Set<string>>(new Set(EVENT_TYPES))

  // Fetch session detail
  useEffect(() => {
    api<SessionDetail>(`/api/sessions/${id}`)
      .then(setSession)
      .catch(() => setSession(null))
      .finally(() => setLoading(false))
  }, [id])

  // Fetch timeline
  useEffect(() => {
    setTimelineLoading(true)
    api<SessionTimelineEntry[]>(`/api/sessions/${id}/timeline`)
      .then(setTimeline)
      .catch(() => setTimeline([]))
      .finally(() => setTimelineLoading(false))
  }, [id])

  // Fetch all events (for Combat + Loot)
  useEffect(() => {
    setAllEventsLoading(true)
    api<SessionEventsResponse>(`/api/sessions/${id}/events?page=1&pageSize=10000`)
      .then(r => setAllEvents(r.events))
      .catch(() => setAllEvents([]))
      .finally(() => setAllEventsLoading(false))
  }, [id])

  // Fetch raw events (paginated, with type filter)
  useEffect(() => {
    setRawLoading(true)
    const typeParam = rawTypeFilters.size < EVENT_TYPES.length && rawTypeFilters.size > 0
      ? `&eventType=${Array.from(rawTypeFilters).join(',')}`
      : ''
    api<SessionEventsResponse>(`/api/sessions/${id}/events?page=${rawPage}&pageSize=100${typeParam}`)
      .then(r => { setRawEvents(r.events); setRawTotal(r.totalCount) })
      .catch(() => { setRawEvents([]); setRawTotal(0) })
      .finally(() => setRawLoading(false))
  }, [id, rawPage, rawTypeFilters])

  // Combat tab data
  const damageTypes = useMemo(() => new Set(['MeleeDamage', 'RangedDamage', 'MagicDamage', 'AbilityDamage', 'WeaponSkillDamage']), [])

  const combatSummary = useMemo(() => {
    const damageByAbility = new Map<string, { total: number; count: number }>()
    const healingByAbility = new Map<string, { total: number; count: number }>()

    for (const ev of allEvents) {
      if (damageTypes.has(ev.eventType)) {
        const key = ev.ability || ev.eventType
        const entry = damageByAbility.get(key) || { total: 0, count: 0 }
        entry.total += ev.value
        entry.count += 1
        damageByAbility.set(key, entry)
      } else if (ev.eventType === 'Healing') {
        const key = ev.ability || 'Healing'
        const entry = healingByAbility.get(key) || { total: 0, count: 0 }
        entry.total += ev.value
        entry.count += 1
        healingByAbility.set(key, entry)
      }
    }

    const damageRows = Array.from(damageByAbility.entries())
      .map(([ability, d]) => ({ ability, total: d.total, count: d.count, avg: d.total / d.count }))
      .sort((a, b) => b.total - a.total)

    const healingRows = Array.from(healingByAbility.entries())
      .map(([ability, d]) => ({ ability, total: d.total, count: d.count, avg: d.total / d.count }))
      .sort((a, b) => b.total - a.total)

    return { damageRows, healingRows }
  }, [allEvents, damageTypes])

  // Loot tab data
  const lootData = useMemo(() => {
    const items = allEvents.filter(e => e.eventType === 'ItemDrop')
    const gilGains = allEvents.filter(e => e.eventType === 'GilGain')
    const gilLosses = allEvents.filter(e => e.eventType === 'GilLoss')
    const netGil = gilGains.reduce((s, e) => s + e.value, 0) - gilLosses.reduce((s, e) => s + e.value, 0)
    return { items, gilGains, gilLosses, netGil }
  }, [allEvents])

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this session? This cannot be undone.')) return
    try {
      await api(`/api/sessions/${id}`, { method: 'DELETE' })
      navigate('/sessions')
    } catch {
      alert('Failed to delete session.')
    }
  }

  const toggleRawType = (type: string) => {
    setRawTypeFilters(prev => {
      const next = new Set(prev)
      if (next.has(type)) next.delete(type)
      else next.add(type)
      return next
    })
    setRawPage(1)
  }

  if (loading) return <p className="text-gray-400">Loading...</p>
  if (!session) return <p className="text-red-400">Session not found.</p>

  const rawTotalPages = Math.ceil(rawTotal / 100)

  return (
    <div>
      {/* Header */}
      <Link to="/sessions" className="text-sm text-blue-400 hover:underline mb-4 inline-block">
        &larr; Back to Sessions
      </Link>

      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-baseline gap-3">
            <h1 className="text-2xl font-bold">{session.characterName}</h1>
            <span className="text-gray-400 text-sm">{session.server}</span>
            {session.zone && <span className="text-gray-400 text-sm">{session.zone}</span>}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-400 mt-1">
            <span>Start: {new Date(session.startedAt).toLocaleString()}</span>
            <span>End: {session.endedAt ? new Date(session.endedAt).toLocaleString() : 'Active'}</span>
            <span>Duration: {formatDuration(session.startedAt, session.endedAt)}</span>
            <span className={`font-medium ${session.status === 'Active' ? 'text-green-400' : session.status === 'Abandoned' ? 'text-yellow-400' : 'text-gray-300'}`}>
              {session.status}
            </span>
          </div>
        </div>
        <button
          onClick={handleDelete}
          className="px-3 py-1.5 text-sm bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
        >
          Delete
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 mb-8">
        {[
          { label: 'Total Damage', value: fmt(session.totalDamage) },
          { label: 'DPS Average', value: fmt1(session.dpsAverage) },
          { label: 'Gil Earned', value: fmt(session.gilEarned) },
          { label: 'Gil/Hour', value: fmt1(session.gilPerHour) },
          { label: 'Items Dropped', value: fmt(session.itemsDropped) },
          { label: 'Mobs Killed', value: fmt(session.mobsKilled) },
          { label: 'XP Gained', value: fmt(session.expGained) },
          { label: 'Healing Done', value: fmt(session.healingDone) },
        ].map(card => (
          <div key={card.label} className="bg-gray-800 rounded-lg p-4 text-center">
            <div className="text-xs text-gray-400 mb-1">{card.label}</div>
            <div className="text-lg font-semibold text-gray-100">{card.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-700 mb-4">
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab
                ? 'text-blue-400 border-b-2 border-blue-400 -mb-px'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === 'Timeline' && (
          <div>
            {timelineLoading ? (
              <p className="text-gray-400">Loading timeline...</p>
            ) : timeline.length === 0 ? (
              <p className="text-gray-500">No timeline data.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-700 text-gray-400 text-left">
                      <th className="py-2 px-3">Time</th>
                      <th className="py-2 px-3 text-right">Damage</th>
                      <th className="py-2 px-3 text-right">Healing</th>
                      <th className="py-2 px-3 text-right">Gil</th>
                      <th className="py-2 px-3 text-right">Kills</th>
                    </tr>
                  </thead>
                  <tbody>
                    {timeline.map((entry, i) => (
                      <tr key={i} className="border-b border-gray-800 hover:bg-gray-800/50">
                        <td className="py-1.5 px-3 text-gray-300">{relativeTime(session.startedAt, entry.timestamp)}</td>
                        <td className="py-1.5 px-3 text-right text-red-400">{entry.damage > 0 ? fmt(entry.damage) : '-'}</td>
                        <td className="py-1.5 px-3 text-right text-green-400">{entry.healing > 0 ? fmt(entry.healing) : '-'}</td>
                        <td className="py-1.5 px-3 text-right text-yellow-400">{entry.gil !== 0 ? fmt(entry.gil) : '-'}</td>
                        <td className="py-1.5 px-3 text-right text-gray-300">{entry.kills > 0 ? entry.kills : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'Combat' && (
          <div>
            {allEventsLoading ? (
              <p className="text-gray-400">Loading combat data...</p>
            ) : (
              <>
                <h3 className="text-md font-semibold text-gray-200 mb-2">Damage by Ability</h3>
                {combatSummary.damageRows.length === 0 ? (
                  <p className="text-gray-500 mb-6">No damage events recorded.</p>
                ) : (
                  <div className="overflow-x-auto mb-6">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-700 text-gray-400 text-left">
                          <th className="py-2 px-3">Ability</th>
                          <th className="py-2 px-3 text-right">Total Damage</th>
                          <th className="py-2 px-3 text-right">Times Used</th>
                          <th className="py-2 px-3 text-right">Avg Damage</th>
                        </tr>
                      </thead>
                      <tbody>
                        {combatSummary.damageRows.map(row => (
                          <tr key={row.ability} className="border-b border-gray-800 hover:bg-gray-800/50">
                            <td className="py-1.5 px-3 text-gray-200">{row.ability}</td>
                            <td className="py-1.5 px-3 text-right text-red-400">{fmt(row.total)}</td>
                            <td className="py-1.5 px-3 text-right text-gray-300">{fmt(row.count)}</td>
                            <td className="py-1.5 px-3 text-right text-gray-300">{fmt1(row.avg)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <h3 className="text-md font-semibold text-gray-200 mb-2">Healing by Ability</h3>
                {combatSummary.healingRows.length === 0 ? (
                  <p className="text-gray-500">No healing events recorded.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-700 text-gray-400 text-left">
                          <th className="py-2 px-3">Ability</th>
                          <th className="py-2 px-3 text-right">Total Healing</th>
                          <th className="py-2 px-3 text-right">Times Used</th>
                          <th className="py-2 px-3 text-right">Avg Healing</th>
                        </tr>
                      </thead>
                      <tbody>
                        {combatSummary.healingRows.map(row => (
                          <tr key={row.ability} className="border-b border-gray-800 hover:bg-gray-800/50">
                            <td className="py-1.5 px-3 text-gray-200">{row.ability}</td>
                            <td className="py-1.5 px-3 text-right text-green-400">{fmt(row.total)}</td>
                            <td className="py-1.5 px-3 text-right text-gray-300">{fmt(row.count)}</td>
                            <td className="py-1.5 px-3 text-right text-gray-300">{fmt1(row.avg)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {activeTab === 'Loot' && (
          <div>
            {allEventsLoading ? (
              <p className="text-gray-400">Loading loot data...</p>
            ) : (
              <>
                <h3 className="text-md font-semibold text-gray-200 mb-2">Items</h3>
                {lootData.items.length === 0 ? (
                  <p className="text-gray-500 mb-6">No item drops recorded.</p>
                ) : (
                  <div className="overflow-x-auto mb-6">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-700 text-gray-400 text-left">
                          <th className="py-2 px-3">Item</th>
                          <th className="py-2 px-3 text-right">Qty</th>
                          <th className="py-2 px-3">Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lootData.items.map(ev => (
                          <tr key={ev.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                            <td className="py-1.5 px-3 text-gray-200">{ev.target}</td>
                            <td className="py-1.5 px-3 text-right text-gray-300">{ev.value}</td>
                            <td className="py-1.5 px-3 text-gray-400">{relativeTime(session.startedAt, ev.timestamp)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <h3 className="text-md font-semibold text-gray-200 mb-2">Gil</h3>
                {lootData.gilGains.length === 0 && lootData.gilLosses.length === 0 ? (
                  <p className="text-gray-500">No gil transactions recorded.</p>
                ) : (
                  <>
                    <div className="overflow-x-auto mb-3">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-700 text-gray-400 text-left">
                            <th className="py-2 px-3">Type</th>
                            <th className="py-2 px-3 text-right">Amount</th>
                            <th className="py-2 px-3">Time</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...lootData.gilGains.map(e => ({ ...e, _type: 'Gain' as const })),
                            ...lootData.gilLosses.map(e => ({ ...e, _type: 'Loss' as const }))]
                            .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
                            .map(ev => (
                              <tr key={ev.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                                <td className={`py-1.5 px-3 ${ev._type === 'Gain' ? 'text-green-400' : 'text-red-400'}`}>
                                  {ev._type}
                                </td>
                                <td className={`py-1.5 px-3 text-right ${ev._type === 'Gain' ? 'text-green-400' : 'text-red-400'}`}>
                                  {ev._type === 'Loss' ? '-' : ''}{fmt(ev.value)}
                                </td>
                                <td className="py-1.5 px-3 text-gray-400">{relativeTime(session.startedAt, ev.timestamp)}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="text-sm text-gray-300">
                      Net Gil: <span className={lootData.netGil >= 0 ? 'text-green-400' : 'text-red-400'}>{lootData.netGil >= 0 ? '+' : ''}{fmt(lootData.netGil)}</span>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        )}

        {activeTab === 'Raw Events' && (
          <div>
            {/* Type filter */}
            <div className="flex flex-wrap gap-2 mb-4">
              {EVENT_TYPES.map(type => (
                <label key={type} className="flex items-center gap-1 text-xs text-gray-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rawTypeFilters.has(type)}
                    onChange={() => toggleRawType(type)}
                    className="rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
                  />
                  {type}
                </label>
              ))}
            </div>

            {rawLoading ? (
              <p className="text-gray-400">Loading events...</p>
            ) : rawEvents.length === 0 ? (
              <p className="text-gray-500">No events found.</p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-700 text-gray-400 text-left">
                        <th className="py-2 px-3">Time</th>
                        <th className="py-2 px-3">Type</th>
                        <th className="py-2 px-3">Source</th>
                        <th className="py-2 px-3">Target</th>
                        <th className="py-2 px-3 text-right">Value</th>
                        <th className="py-2 px-3">Ability</th>
                        <th className="py-2 px-3">Zone</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rawEvents.map(ev => (
                        <tr key={ev.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                          <td className="py-1.5 px-3 text-gray-400 whitespace-nowrap">{relativeTime(session.startedAt, ev.timestamp)}</td>
                          <td className="py-1.5 px-3 text-gray-300">{ev.eventType}</td>
                          <td className="py-1.5 px-3 text-gray-200">{ev.source}</td>
                          <td className="py-1.5 px-3 text-gray-200">{ev.target}</td>
                          <td className="py-1.5 px-3 text-right text-gray-300">{fmt(ev.value)}</td>
                          <td className="py-1.5 px-3 text-gray-400">{ev.ability ?? '-'}</td>
                          <td className="py-1.5 px-3 text-gray-400">{ev.zone}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                <div className="flex items-center justify-between mt-4 text-sm text-gray-400">
                  <span>{fmt(rawTotal)} total events</span>
                  <div className="flex gap-2">
                    <button
                      disabled={rawPage <= 1}
                      onClick={() => setRawPage(p => p - 1)}
                      className="px-3 py-1 rounded bg-gray-800 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      Prev
                    </button>
                    <span className="px-3 py-1">Page {rawPage} of {rawTotalPages}</span>
                    <button
                      disabled={rawPage >= rawTotalPages}
                      onClick={() => setRawPage(p => p + 1)}
                      className="px-3 py-1 rounded bg-gray-800 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
