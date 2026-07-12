import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import {
  getAnalyticsSummary, getServerComparison, getJobPopularity, getUltimateWeaponRarity,
} from '../../api/client'
import type {
  AnalyticsSummary, ServerComparisonEntry, JobPopularityEntry, UltimateWeaponRarityEntry,
  ServerMetric, JobMode,
} from '../../types/api'
import LoadingSpinner from '../LoadingSpinner'

const AXIS = { tick: { fill: '#6b7280', fontSize: 11 }, tickLine: false, axisLine: { stroke: '#374151' } }
const TOOLTIP = {
  contentStyle: { backgroundColor: '#111827', border: '1px solid #374151', borderRadius: 8 },
  labelStyle: { color: '#9ca3af' },
}

const METRICS: { value: ServerMetric; label: string }[] = [
  { value: 'avgScore', label: 'Avg score' },
  { value: 'population', label: 'Population' },
  { value: 'pctWithUltimate', label: '% with an ultimate' },
  { value: 'avgJobsAt99', label: 'Jobs @99 / char' },
]

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
      <h3 className="text-sm font-medium text-gray-400">{title}</h3>
      {subtitle && <p className="mb-3 mt-0.5 text-xs text-gray-500">{subtitle}</p>}
      <div className={subtitle ? '' : 'mt-4'}>{children}</div>
    </div>
  )
}
function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
      <p className="text-2xl font-bold text-gray-100 tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-gray-500">{label}</p>
    </div>
  )
}

export default function AnalyticsTab({ server }: { server: string | undefined }) {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null)
  const [metric, setMetric] = useState<ServerMetric>('avgScore')
  const [servers, setServers] = useState<ServerComparisonEntry[]>([])
  const [jobMode, setJobMode] = useState<JobMode>('maxed')
  const [jobs, setJobs] = useState<JobPopularityEntry[]>([])
  const [weapons, setWeapons] = useState<UltimateWeaponRarityEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      getAnalyticsSummary(server).then(setSummary).catch(() => setSummary(null)),
      getJobPopularity(server, jobMode).then(setJobs).catch(() => setJobs([])),
      getUltimateWeaponRarity(server).then(setWeapons).catch(() => setWeapons([])),
    ]).finally(() => setLoading(false))
  }, [server, jobMode])

  // Server comparison is cross-world; refetch only when metric changes.
  useEffect(() => {
    getServerComparison(metric).then(setServers).catch(() => setServers([]))
  }, [metric])

  if (loading && !summary) return <LoadingSpinner />

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Characters analyzed" value={(summary?.characters ?? 0).toLocaleString()} />
        <Stat label="Worlds tracked" value={summary?.worlds ?? 0} />
        <Stat label="Jobs mastered" value={(summary?.jobsMastered ?? 0).toLocaleString()} />
        <Stat label="Ultimate weapons forged" value={(summary?.ultimateWeapons ?? 0).toLocaleString()} />
      </div>

      <Card title="Server comparison" subtitle="Compares all worlds — ignores the server filter above.">
        <div className="mb-3 flex flex-wrap justify-end gap-1">
          {METRICS.map(m => (
            <button key={m.value} type="button" onClick={() => setMetric(m.value)}
              className={`rounded px-2 py-1 text-xs font-medium ${metric === m.value ? 'bg-blue-500/20 text-blue-300' : 'text-gray-500 hover:text-gray-300'}`}>
              {m.label}
            </button>
          ))}
        </div>
        {servers.length === 0 ? <Empty /> : (
          <ResponsiveContainer width="100%" height={Math.max(200, servers.length * 28)}>
            <BarChart data={servers} layout="vertical" margin={{ left: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" horizontal={false} />
              <XAxis type="number" {...AXIS} />
              <YAxis type="category" dataKey="server" {...AXIS} width={70} />
              <Tooltip {...TOOLTIP} />
              <Bar dataKey="value" name={metric} fill="#3b82f6" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>

      <Card title="Job popularity" subtitle={jobMode === 'maxed' ? 'Characters with each job at level 99.' : 'Characters whose highest-level job this is.'}>
        <div className="mb-3 flex justify-end gap-1">
          {(['maxed', 'mained'] as JobMode[]).map(m => (
            <button key={m} type="button" onClick={() => setJobMode(m)}
              className={`rounded px-2 py-1 text-xs font-medium ${jobMode === m ? 'bg-blue-500/20 text-blue-300' : 'text-gray-500 hover:text-gray-300'}`}>
              {m === 'maxed' ? 'At 99' : 'Mained'}
            </button>
          ))}
        </div>
        {jobs.length === 0 ? <Empty /> : (
          <ResponsiveContainer width="100%" height={Math.max(240, jobs.length * 22)}>
            <BarChart data={jobs} layout="vertical" margin={{ left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" horizontal={false} />
              <XAxis type="number" {...AXIS} allowDecimals={false} />
              <YAxis type="category" dataKey="job" {...AXIS} width={48} />
              <Tooltip {...TOOLTIP} />
              <Bar dataKey="count" name="Characters" fill="#10b981" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>

      <Card title="Ultimate weapon rarity" subtitle="Characters who own each ultimate weapon (rank ≥ 75).">
        {weapons.length === 0 ? <Empty /> : (
          <ResponsiveContainer width="100%" height={Math.max(240, weapons.length * 22)}>
            <BarChart data={weapons} layout="vertical" margin={{ left: 24 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" horizontal={false} />
              <XAxis type="number" {...AXIS} allowDecimals={false} />
              <YAxis type="category" dataKey="weapon" {...AXIS} width={110} />
              <Tooltip {...TOOLTIP} formatter={(v, n) => [n === 'owners' ? `${v} owners` : v, '']} />
              <Bar dataKey="owners" name="owners" fill="#a855f7" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>
    </div>
  )
}

function Empty() {
  return <p className="py-8 text-center text-sm text-gray-600">No data yet for this selection.</p>
}
