import { useMemo } from 'react'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from 'recharts'
import type { SessionDetail, SessionEvent } from '../../types/api'

interface CombatTabProps {
  session: SessionDetail
  events: SessionEvent[]
}

const DAMAGE_TYPES = ['MeleeDamage', 'CriticalHit', 'AbilityDamage', 'SpellDamage', 'RangedDamage', 'MagicBurst', 'Skillchain']
const DAMAGE_COLORS: Record<string, string> = {
  MeleeDamage: '#6b7280',
  CriticalHit: '#eab308',
  AbilityDamage: '#f97316',
  SpellDamage: '#a855f7',
  RangedDamage: '#06b6d4',
  MagicBurst: '#ec4899',
  Skillchain: '#14b8a6',
}

interface AbilityRow {
  ability: string
  count: number
  totalDamage: number
  avgDamage: number
  pctOfTotal: number
}

interface MobRow {
  mob: string
  kills: number
  accuracy: number
  critRate: number
  parryRate: number
  damageDealt: number
  damageTaken: number
}

export default function CombatTab({ session, events }: CombatTabProps) {
  const wsDamage = useMemo(() =>
    events.filter(e => e.eventType === 'AbilityDamage').reduce((sum, e) => sum + e.value, 0),
    [events]
  )

  const summaryCards = [
    { label: 'Accuracy', value: `${(session.accuracy * 100).toFixed(1)}%` },
    { label: 'Crit Rate', value: `${(session.critRate * 100).toFixed(1)}%` },
    { label: 'Parry Rate', value: `${(session.parryRate * 100).toFixed(1)}%` },
    { label: 'Avg TTK', value: session.mobsKilled > 0
        ? `${Math.round((session.endedAt
            ? (new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime()) / 1000
            : 0) / session.mobsKilled)}s`
        : 'N/A'
    },
    { label: 'WS Damage', value: wsDamage.toLocaleString() },
    { label: 'WS % of Total', value: session.totalDamage > 0
        ? `${((wsDamage / session.totalDamage) * 100).toFixed(1)}%`
        : '0%'
    },
  ]

  const damageByType = useMemo(() => {
    const totals: Record<string, number> = {}
    for (const e of events) {
      if (DAMAGE_TYPES.includes(e.eventType)) {
        totals[e.eventType] = (totals[e.eventType] || 0) + e.value
      }
    }
    return DAMAGE_TYPES
      .filter(t => totals[t] > 0)
      .map(t => ({ type: t, damage: totals[t] }))
      .sort((a, b) => b.damage - a.damage)
  }, [events])

  const topAbilities = useMemo((): AbilityRow[] => {
    const byAbility: Record<string, { count: number; total: number }> = {}
    const totalDmg = events
      .filter(e => DAMAGE_TYPES.includes(e.eventType))
      .reduce((s, e) => s + e.value, 0)

    for (const e of events) {
      if (e.eventType === 'AbilityDamage' && e.ability) {
        const entry = byAbility[e.ability] || { count: 0, total: 0 }
        entry.count++
        entry.total += e.value
        byAbility[e.ability] = entry
      }
    }

    return Object.entries(byAbility)
      .map(([ability, { count, total }]) => ({
        ability,
        count,
        totalDamage: total,
        avgDamage: Math.round(total / count),
        pctOfTotal: totalDmg > 0 ? (total / totalDmg) * 100 : 0,
      }))
      .sort((a, b) => b.totalDamage - a.totalDamage)
  }, [events])

  const mobBreakdown = useMemo((): MobRow[] => {
    const mobs: Record<string, {
      kills: number; hits: number; crits: number; misses: number;
      parries: number; incomingHits: number; dmgDealt: number; dmgTaken: number
    }> = {}

    const playerName = session.characterName

    for (const e of events) {
      if (e.source === playerName && e.target) {
        const mob = e.target
        if (!mobs[mob]) mobs[mob] = { kills: 0, hits: 0, crits: 0, misses: 0, parries: 0, incomingHits: 0, dmgDealt: 0, dmgTaken: 0 }
        if (e.eventType === 'MeleeDamage') { mobs[mob].hits++; mobs[mob].dmgDealt += e.value }
        if (e.eventType === 'CriticalHit') { mobs[mob].crits++; mobs[mob].dmgDealt += e.value }
        if (e.eventType === 'AbilityDamage' || e.eventType === 'SpellDamage' || e.eventType === 'RangedDamage') { mobs[mob].dmgDealt += e.value }
        if (e.eventType === 'Miss') mobs[mob].misses++
        if (e.eventType === 'MobKill') mobs[mob].kills++
      }

      if (e.target === playerName && e.source) {
        const mob = e.source
        if (!mobs[mob]) mobs[mob] = { kills: 0, hits: 0, crits: 0, misses: 0, parries: 0, incomingHits: 0, dmgDealt: 0, dmgTaken: 0 }
        if (e.eventType === 'MeleeDamage' || e.eventType === 'CriticalHit') { mobs[mob].incomingHits++; mobs[mob].dmgTaken += e.value }
        if (e.eventType === 'Parry') mobs[mob].parries++
      }
    }

    return Object.entries(mobs)
      .filter(([_, m]) => m.kills > 0 || m.dmgDealt > 0)
      .map(([mob, m]) => {
        const totalSwings = m.hits + m.crits + m.misses
        return {
          mob,
          kills: m.kills,
          accuracy: totalSwings > 0 ? (m.hits + m.crits) / totalSwings : 0,
          critRate: (m.hits + m.crits) > 0 ? m.crits / (m.hits + m.crits) : 0,
          parryRate: (m.parries + m.incomingHits) > 0 ? m.parries / (m.parries + m.incomingHits) : 0,
          damageDealt: m.dmgDealt,
          damageTaken: m.dmgTaken,
        }
      })
      .sort((a, b) => b.damageDealt - a.damageDealt)
  }, [events, session.characterName])

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        {summaryCards.map((c) => (
          <div key={c.label} className="rounded-lg border border-gray-800 bg-gray-900 px-3 py-2">
            <div className="text-xs text-gray-500 uppercase">{c.label}</div>
            <div className="text-lg text-gray-100 font-semibold">{c.value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <h3 className="text-sm font-medium text-gray-400 uppercase mb-4">Damage by Type</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={damageByType} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis type="number" tick={{ fill: '#6b7280', fontSize: 11 }}
                tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} />
              <YAxis type="category" dataKey="type" tick={{ fill: '#6b7280', fontSize: 11 }} width={100} />
              <Tooltip
                contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: 8 }}
                formatter={(value) => [Number(value ?? 0).toLocaleString(), 'Damage']}
              />
              <Bar dataKey="damage">
                {damageByType.map((entry) => (
                  <Cell key={entry.type} fill={DAMAGE_COLORS[entry.type] || '#3b82f6'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <h3 className="text-sm font-medium text-gray-400 uppercase mb-4">Top Abilities</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-gray-500 uppercase text-xs">
                <tr>
                  <th className="py-2">Ability</th>
                  <th className="py-2 text-right">Uses</th>
                  <th className="py-2 text-right">Total</th>
                  <th className="py-2 text-right">Avg</th>
                  <th className="py-2 text-right">%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {topAbilities.map((a) => (
                  <tr key={a.ability}>
                    <td className="py-2 text-gray-200">{a.ability}</td>
                    <td className="py-2 text-right text-gray-400">{a.count}</td>
                    <td className="py-2 text-right text-gray-200">{a.totalDamage.toLocaleString()}</td>
                    <td className="py-2 text-right text-gray-400">{a.avgDamage.toLocaleString()}</td>
                    <td className="py-2 text-right text-gray-400">{a.pctOfTotal.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
        <h3 className="text-sm font-medium text-gray-400 uppercase mb-4">Per-Mob Breakdown</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-gray-500 uppercase text-xs">
              <tr>
                <th className="py-2">Mob</th>
                <th className="py-2 text-right">Kills</th>
                <th className="py-2 text-right">Accuracy</th>
                <th className="py-2 text-right">Crit Rate</th>
                <th className="py-2 text-right">Parry Rate</th>
                <th className="py-2 text-right">Dmg Dealt</th>
                <th className="py-2 text-right">Dmg Taken</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {mobBreakdown.map((m) => (
                <tr key={m.mob}>
                  <td className="py-2 text-gray-200">{m.mob}</td>
                  <td className="py-2 text-right text-gray-400">{m.kills}</td>
                  <td className="py-2 text-right text-gray-400">{(m.accuracy * 100).toFixed(1)}%</td>
                  <td className="py-2 text-right text-yellow-400">{(m.critRate * 100).toFixed(1)}%</td>
                  <td className="py-2 text-right text-green-400">{(m.parryRate * 100).toFixed(1)}%</td>
                  <td className="py-2 text-right text-gray-200">{m.damageDealt.toLocaleString()}</td>
                  <td className="py-2 text-right text-red-400">{m.damageTaken.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
