import { useMemo } from 'react'
import {
  ResponsiveContainer, ComposedChart, Area, Scatter, XAxis, YAxis,
  CartesianGrid, Tooltip
} from 'recharts'
import type { SessionDetail, SessionEvent, SessionTimelineEntry } from '../../types/api'

interface OverviewTabProps {
  session: SessionDetail
  timeline: SessionTimelineEntry[]
  events: SessionEvent[]
}

const NOTABLE_TYPES = new Set([
  'MobKill', 'AbilityDamage', 'CriticalHit', 'SpellDamage',
  'ItemDrop', 'ItemLost', 'GilGain', 'GilLoss', 'Healing',
  'ExpGain', 'LimitGain', 'CapacityGain', 'TreasureHunter',
])

const EVENT_COLORS: Record<string, string> = {
  MobKill: 'text-red-400',
  AbilityDamage: 'text-orange-400',
  CriticalHit: 'text-yellow-400',
  SpellDamage: 'text-purple-400',
  ItemDrop: 'text-emerald-400',
  ItemLost: 'text-amber-500',
  GilGain: 'text-yellow-300',
  GilLoss: 'text-red-300',
  Healing: 'text-green-400',
  ExpGain: 'text-blue-300',
  LimitGain: 'text-blue-300',
  CapacityGain: 'text-blue-300',
  TreasureHunter: 'text-amber-400',
}

function formatTime(timestamp: string, sessionStart: string): string {
  const ms = new Date(timestamp).getTime() - new Date(sessionStart).getTime()
  const totalSec = Math.floor(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function formatEventLine(e: SessionEvent): string {
  switch (e.eventType) {
    case 'MobKill': return `Defeated ${e.target}`
    case 'AbilityDamage': return `${e.ability} → ${e.value.toLocaleString()} on ${e.target}`
    case 'CriticalHit': return `Critical hit → ${e.value.toLocaleString()} on ${e.target}`
    case 'SpellDamage': return `${e.ability} → ${e.value.toLocaleString()} on ${e.target}`
    case 'ItemDrop': return `Obtained ${e.target}${e.value > 1 ? ` x${e.value}` : ''}`
    case 'ItemLost': return `Lost ${e.target} (inventory full)`
    case 'GilGain': return `+${e.value.toLocaleString()} gil`
    case 'GilLoss': return `-${e.value.toLocaleString()} gil`
    case 'Healing': return `${e.ability || 'Heal'} → ${e.value.toLocaleString()} HP on ${e.target}`
    case 'LimitGain': return `+${e.value.toLocaleString()} limit points`
    case 'ExpGain': return `+${e.value.toLocaleString()} experience`
    case 'CapacityGain': return `+${e.value.toLocaleString()} capacity points`
    case 'TreasureHunter': return `TH${e.value} on ${e.target}`
    default: return `${e.eventType}: ${e.value}`
  }
}

export default function OverviewTab({ session, timeline, events }: OverviewTabProps) {
  const chartData = useMemo(() => {
    return timeline.map((t) => {
      const minuteOffset = Math.round(
        (new Date(t.timestamp).getTime() - new Date(session.startedAt).getTime()) / 60000
      )
      return {
        minute: minuteOffset,
        damage: t.damage,
        healing: t.healing,
        kills: t.kills,
      }
    })
  }, [timeline, session.startedAt])

  const wsMarkers = useMemo(() => {
    return events
      .filter((e) => e.eventType === 'AbilityDamage')
      .map((e) => {
        const minute = Math.round(
          (new Date(e.timestamp).getTime() - new Date(session.startedAt).getTime()) / 60000
        )
        return { minute, damage: e.value, ability: e.ability }
      })
  }, [events, session.startedAt])

  const notableEvents = useMemo(() => {
    return events.filter((e) => NOTABLE_TYPES.has(e.eventType))
  }, [events])

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
        <h3 className="text-sm font-medium text-gray-400 uppercase mb-4">Session Timeline</h3>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis
              dataKey="minute"
              tick={{ fill: '#6b7280', fontSize: 11 }}
              tickFormatter={(v) => `${v}m`}
            />
            <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} />
            <Tooltip
              contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: 8 }}
              labelFormatter={(v) => `${v} min`}
              formatter={(value, name) => [Number(value ?? 0).toLocaleString(), String(name)]}
            />
            <Area
              type="monotone"
              dataKey="damage"
              stroke="#3b82f6"
              fill="#3b82f6"
              fillOpacity={0.15}
              name="Damage"
            />
            <Area
              type="monotone"
              dataKey="healing"
              stroke="#22c55e"
              fill="#22c55e"
              fillOpacity={0.1}
              name="Healing"
            />
            <Scatter
              data={wsMarkers}
              dataKey="damage"
              fill="#f59e0b"
              name="Weapon Skills"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
        <h3 className="text-sm font-medium text-gray-400 uppercase mb-4">
          Session Highlights ({notableEvents.length})
        </h3>
        <div className="max-h-96 overflow-y-auto space-y-1">
          {notableEvents.map((e) => (
            <div key={e.id} className="flex items-baseline gap-3 text-sm py-1 border-b border-gray-800/50">
              <span className="text-gray-600 text-xs font-mono w-12 shrink-0">
                {formatTime(e.timestamp, session.startedAt)}
              </span>
              <span className={`${EVENT_COLORS[e.eventType] || 'text-gray-400'}`}>
                {formatEventLine(e)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
