import { useMemo, useState } from 'react'
import {
  BarChart, Bar, PieChart, Pie, Cell, ComposedChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import type { AdminUser } from '../../types/api'
import {
  signupSeries, activityBreakdown, authBreakdown, roleBreakdown,
  characterHistogram, topServers, userSummary, type Bucket,
} from '../../lib/adminUserAnalytics'

interface UsersAnalyticsProps {
  users: AdminUser[]
}

const AXIS = { tick: { fill: '#6b7280', fontSize: 11 }, tickLine: false, axisLine: { stroke: '#374151' } }
const TOOLTIP = {
  contentStyle: { backgroundColor: '#111827', border: '1px solid #374151', borderRadius: 8 },
  labelStyle: { color: '#9ca3af' },
}
const PIE_COLORS = ['#3b82f6', '#f59e0b', '#10b981', '#a855f7', '#6b7280']

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
      <h3 className="mb-4 text-sm font-medium text-gray-400">{title}</h3>
      {children}
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

export default function UsersAnalytics({ users }: UsersAnalyticsProps) {
  const [bucket, setBucket] = useState<Bucket>('month')
  const now = useMemo(() => new Date(), [users])

  const summary = useMemo(() => userSummary(users, now), [users, now])
  const signups = useMemo(() => signupSeries(users, bucket), [users, bucket])
  const activity = useMemo(() => activityBreakdown(users, now), [users, now])
  const auth = useMemo(() => authBreakdown(users), [users])
  const roles = useMemo(() => roleBreakdown(users), [users])
  const histogram = useMemo(() => characterHistogram(users), [users])
  const servers = useMemo(() => topServers(users), [users])

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Total users" value={summary.total} />
        <Stat label="Active last 30d" value={summary.active30} />
        <Stat label="New this month" value={summary.newThisMonth} />
        <Stat label="Avg characters / user" value={summary.avgCharacters.toFixed(1)} />
      </div>

      <Card title="Signups over time">
        <div className="mb-3 flex justify-end gap-1">
          {(['week', 'month'] as Bucket[]).map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => setBucket(b)}
              className={`rounded px-2 py-1 text-xs font-medium ${
                bucket === b ? 'bg-blue-500/20 text-blue-300' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {b === 'week' ? 'Weekly' : 'Monthly'}
            </button>
          ))}
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={signups}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis dataKey="period" {...AXIS} interval="preserveStartEnd" />
            <YAxis {...AXIS} allowDecimals={false} />
            <Tooltip {...TOOLTIP} />
            <Bar dataKey="created" name="New" fill="#3b82f6" fillOpacity={0.5} />
            <Line type="monotone" dataKey="cumulative" name="Total" stroke="#f59e0b" strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Activity (by last character sync)">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={activity}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="label" {...AXIS} />
              <YAxis {...AXIS} allowDecimals={false} />
              <Tooltip {...TOOLTIP} />
              <Bar dataKey="count" name="Users" fill="#10b981" />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Characters per user">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={histogram}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="label" {...AXIS} />
              <YAxis {...AXIS} allowDecimals={false} />
              <Tooltip {...TOOLTIP} />
              <Bar dataKey="count" name="Users" fill="#3b82f6" />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Auth provider">
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={auth} dataKey="count" nameKey="label" cx="50%" cy="50%" outerRadius={80} label>
                {auth.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip {...TOOLTIP} />
            </PieChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Role distribution">
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={roles} dataKey="count" nameKey="label" cx="50%" cy="50%" outerRadius={80} label>
                {roles.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip {...TOOLTIP} />
            </PieChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <Card title="Top servers">
        {servers.length === 0 ? (
          <p className="text-sm text-gray-600">No server data yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(160, servers.length * 32)}>
            <BarChart data={servers} layout="vertical" margin={{ left: 24 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" horizontal={false} />
              <XAxis type="number" {...AXIS} allowDecimals={false} />
              <YAxis type="category" dataKey="label" {...AXIS} width={80} />
              <Tooltip {...TOOLTIP} />
              <Bar dataKey="count" name="Users" fill="#a855f7" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>
    </div>
  )
}
