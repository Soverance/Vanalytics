# Server Detail Slide-over Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace direct page navigation from the dashboard to per-server detail with a slide-over summary panel, while keeping the dedicated detail page for shareable URLs.

**Architecture:** Extract the status timeline bar into a shared component. Replace `useNavigate`/`navigate()` in three child components with an `onServerClick` callback prop. Create a slide-over panel component that fetches and displays a server summary. Wire it into the dashboard via `selectedServer` state.

**Tech Stack:** React 19, TypeScript, Tailwind CSS 4.2, Recharts 3.8

**Spec:** `docs/superpowers/specs/2026-03-23-server-detail-slideover-design.md`

---

## File Structure

| Action | Path | Responsibility |
|--------|------|---------------|
| Create | `src/Vanalytics.Web/src/components/server/StatusTimeline.tsx` | Shared timeline bar component |
| Create | `src/Vanalytics.Web/src/components/server/ServerDetailPanel.tsx` | Slide-over panel with server summary |
| Modify | `src/Vanalytics.Web/src/pages/ServerDetailPage.tsx` | Replace inline timeline with `StatusTimeline` |
| Modify | `src/Vanalytics.Web/src/components/server/ServerHeatmap.tsx` | Replace `navigate()` with `onServerClick` prop |
| Modify | `src/Vanalytics.Web/src/components/server/ServerRankings.tsx` | Replace `navigate()` with `onServerClick` prop |
| Modify | `src/Vanalytics.Web/src/components/server/CurrentStatusGrid.tsx` | Replace `navigate()` with `onServerClick` prop |
| Modify | `src/Vanalytics.Web/src/pages/ServerStatusDashboard.tsx` | Add `selectedServer` state, pass callbacks, render panel |

---

## Task 1: Extract StatusTimeline component

**Files:**
- Create: `src/Vanalytics.Web/src/components/server/StatusTimeline.tsx`
- Modify: `src/Vanalytics.Web/src/pages/ServerDetailPage.tsx`

- [ ] **Step 1: Create StatusTimeline component**

Extract the timeline bar from `ServerDetailPage.tsx` (lines 142-171) into a reusable component:

```tsx
import type { ServerStatusEntry } from '../../types/api'

interface Props {
  history: ServerStatusEntry[]
  days: number
}

const statusColors: Record<string, string> = {
  Online: 'bg-green-500',
  Offline: 'bg-red-500',
  Maintenance: 'bg-amber-500',
  Unknown: 'bg-gray-500',
}

export default function StatusTimeline({ history, days }: Props) {
  const now = Date.now()
  const rangeStart = days === 0
    ? Math.min(...history.map(h => new Date(h.startedAt).getTime()), now)
    : now - days * 86400000
  const totalMs = now - rangeStart

  return (
    <div>
      <div className="relative h-8 rounded overflow-hidden bg-gray-800">
        {history.map((entry, i) => {
          const start = Math.max(new Date(entry.startedAt).getTime(), rangeStart)
          const end = entry.endedAt ? new Date(entry.endedAt).getTime() : now
          const left = ((start - rangeStart) / totalMs) * 100
          const width = ((end - start) / totalMs) * 100
          if (width < 0.05) return null
          return (
            <div
              key={i}
              className={`absolute top-0 h-full ${statusColors[entry.status] ?? 'bg-gray-500'}`}
              style={{ left: `${left}%`, width: `${width}%` }}
              title={`${entry.status}: ${new Date(entry.startedAt).toLocaleString()} — ${entry.endedAt ? new Date(entry.endedAt).toLocaleString() : 'Current'}`}
            />
          )
        })}
      </div>
      <div className="flex justify-between text-[10px] text-gray-600 mt-1">
        <span>{new Date(rangeStart).toLocaleDateString()}</span>
        <span>Now</span>
      </div>
      <div className="flex items-center gap-3 mt-2 text-[10px] text-gray-500">
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-green-500" /> Online</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-red-500" /> Offline</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-amber-500" /> Maintenance</span>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Update ServerDetailPage to use StatusTimeline**

In `ServerDetailPage.tsx`:

1. Add import: `import StatusTimeline from '../components/server/StatusTimeline'`
2. Remove the `statusColors` constant (lines 20-25) — it's now in StatusTimeline. Keep `statusTextColors` (used by event log).
3. Remove the timeline bar computation block (lines 96-101: `const now = ...`, `const rangeStart = ...`, `const totalMs = ...`).
4. Replace the status timeline section (lines 142-171) with:

```tsx
      {/* Status timeline bar */}
      <section className="rounded-lg border border-gray-800 bg-gray-900 p-4">
        <h2 className="text-xs uppercase text-gray-500 mb-3">Status Timeline</h2>
        <StatusTimeline history={history.history} days={days} />
      </section>
```

5. The `statusColors` map is still needed for the header status dot (line 112). Add a local inline for just that one use:

```tsx
<span className={`inline-block h-2 w-2 rounded-full mr-1 ${
  { Online: 'bg-green-500', Offline: 'bg-red-500', Maintenance: 'bg-amber-500', Unknown: 'bg-gray-500' }[history.status] ?? 'bg-gray-500'
}`} />
```

- [ ] **Step 3: Verify it compiles**

Run: `cd C:/Git/soverance/Vanalytics/src/Vanalytics.Web && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/Vanalytics.Web/src/components/server/StatusTimeline.tsx src/Vanalytics.Web/src/pages/ServerDetailPage.tsx
git commit -m "refactor(server): extract StatusTimeline into shared component"
```

---

## Task 2: Add onServerClick callback to child components

**Files:**
- Modify: `src/Vanalytics.Web/src/components/server/ServerHeatmap.tsx`
- Modify: `src/Vanalytics.Web/src/components/server/ServerRankings.tsx`
- Modify: `src/Vanalytics.Web/src/components/server/CurrentStatusGrid.tsx`

- [ ] **Step 1: Update ServerHeatmap**

Replace the full file content with:

```tsx
import type { ServerHeatmapData } from '../../types/api'

interface Props {
  data: ServerHeatmapData[]
  days: number
  onServerClick: (serverName: string) => void
}

function cellColor(uptimePercent: number): string {
  if (uptimePercent < 0) return 'bg-gray-800'
  if (uptimePercent > 99) return 'bg-green-500'
  if (uptimePercent > 95) return 'bg-amber-500'
  return 'bg-red-500'
}

export default function ServerHeatmap({ data, days, onServerClick }: Props) {
  if (data.length === 0) return <p className="text-gray-500 text-sm">No data</p>

  const maxCols = days <= 7 ? data[0]?.days.length : days <= 30 ? 30 : days <= 90 ? 90 : 52

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[400px]">
        {data.map(server => (
          <div key={server.name} className="flex items-center gap-2 mb-1">
            <button
              onClick={() => onServerClick(server.name)}
              className="w-20 text-xs text-gray-400 text-right truncate hover:text-blue-400 hover:underline shrink-0"
              title={server.name}
            >
              {server.name}
            </button>
            <div className="flex gap-px flex-1">
              {server.days.slice(-maxCols).map((cell, i) => (
                <div
                  key={i}
                  className={`h-3 flex-1 rounded-sm ${cellColor(cell.uptimePercent)}`}
                  title={`${cell.date}: ${cell.uptimePercent}% (${cell.dominantStatus})`}
                />
              ))}
            </div>
          </div>
        ))}
        <div className="flex items-center gap-2 mt-1">
          <div className="w-20 shrink-0" />
          <div className="flex justify-between flex-1 text-[10px] text-gray-600">
            <span>{data[0]?.days[Math.max(0, data[0].days.length - maxCols)]?.date ?? ''}</span>
            <span>{data[0]?.days[data[0].days.length - 1]?.date ?? ''}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-2">
          <div className="w-20 shrink-0" />
          <div className="flex items-center gap-3 text-[10px] text-gray-500">
            <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-green-500" /> &gt;99%</span>
            <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-amber-500" /> &gt;95%</span>
            <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-red-500" /> &le;95%</span>
            <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-gray-800" /> No data</span>
          </div>
        </div>
      </div>
    </div>
  )
}
```

Key changes: removed `useNavigate` import, added `onServerClick` to Props, replaced `navigate()` with `onServerClick()`, added `hover:underline` to server name button.

- [ ] **Step 2: Update ServerRankings**

Replace the full file content with:

```tsx
import type { ServerRanking } from '../../types/api'

interface Props {
  rankings: ServerRanking[]
  days: number
  onServerClick: (serverName: string) => void
}

function uptimeColor(pct: number): string {
  if (pct > 99) return 'text-green-400'
  if (pct > 95) return 'text-amber-400'
  return 'text-red-400'
}

export default function ServerRankings({ rankings, days, onServerClick }: Props) {
  return (
    <div className="space-y-0">
      {rankings.map((server, i) => (
        <button
          key={server.name}
          onClick={() => onServerClick(server.name)}
          className="flex w-full items-center justify-between px-2 py-1.5 text-sm hover:bg-gray-800/50 rounded transition-colors"
        >
          <span className="text-gray-300 hover:text-blue-400 hover:underline">{i + 1}. {server.name}</span>
          <span className={uptimeColor(server.uptimePercent)}>{server.uptimePercent}%</span>
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Update CurrentStatusGrid**

Replace the full file content with:

```tsx
interface Props {
  servers: { name: string; status: string }[]
  onServerClick: (serverName: string) => void
}

const dotColor: Record<string, string> = {
  Online: 'bg-green-400',
  Offline: 'bg-red-400',
  Maintenance: 'bg-amber-400',
  Unknown: 'bg-gray-400',
}

export default function CurrentStatusGrid({ servers, onServerClick }: Props) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
      {servers.map(s => (
        <button
          key={s.name}
          onClick={() => onServerClick(s.name)}
          className="flex items-center gap-2 rounded border border-gray-800 bg-gray-900/50 px-3 py-2 text-xs hover:bg-gray-800/50 transition-colors"
        >
          <span className={`h-2 w-2 rounded-full ${dotColor[s.status] ?? 'bg-gray-400'}`} />
          <span className="text-gray-300 truncate hover:text-blue-400 hover:underline">{s.name}</span>
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Verify it compiles**

Run: `cd C:/Git/soverance/Vanalytics/src/Vanalytics.Web && npx tsc --noEmit`
Expected: Errors — `ServerStatusDashboard.tsx` doesn't pass the new `onServerClick` prop yet. That's expected; we'll fix it in Task 4.

- [ ] **Step 5: Commit**

```bash
git add src/Vanalytics.Web/src/components/server/ServerHeatmap.tsx src/Vanalytics.Web/src/components/server/ServerRankings.tsx src/Vanalytics.Web/src/components/server/CurrentStatusGrid.tsx
git commit -m "refactor(server): replace navigate() with onServerClick callback in child components"
```

---

## Task 3: Create ServerDetailPanel slide-over component

**Files:**
- Create: `src/Vanalytics.Web/src/components/server/ServerDetailPanel.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { useState, useEffect, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { X, ExternalLink } from 'lucide-react'
import { api, ApiError } from '../../api/client'
import type { ServerHistory } from '../../types/api'
import UptimeTrendChart from './UptimeTrendChart'
import StatusTimeline from './StatusTimeline'

const TIME_RANGES = [
  { label: '24h', days: 1 },
  { label: '48h', days: 2 },
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
  { label: '365d', days: 365 },
  { label: 'All', days: 0 },
]

const statusColors: Record<string, string> = {
  Online: 'bg-green-500',
  Offline: 'bg-red-500',
  Maintenance: 'bg-amber-500',
  Unknown: 'bg-gray-500',
}

const statusTextColors: Record<string, string> = {
  Online: 'bg-green-900/50 text-green-400',
  Offline: 'bg-red-900/50 text-red-400',
  Maintenance: 'bg-amber-900/50 text-amber-400',
  Unknown: 'bg-gray-900/50 text-gray-400',
}

function formatDuration(start: string, end: string | null): string {
  const ms = (end ? new Date(end).getTime() : Date.now()) - new Date(start).getTime()
  const totalMinutes = Math.floor(ms / 60000)
  const d = Math.floor(totalMinutes / 1440)
  const h = Math.floor((totalMinutes % 1440) / 60)
  const m = totalMinutes % 60
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

interface Props {
  serverName: string
  initialDays: number
  onClose: () => void
}

export default function ServerDetailPanel({ serverName, initialDays, onClose }: Props) {
  const [days, setDays] = useState(initialDays)
  const [history, setHistory] = useState<ServerHistory | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const panelRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  // Fetch data
  useEffect(() => {
    setLoading(true)
    setError('')
    api<ServerHistory>(`/api/servers/${encodeURIComponent(serverName)}/history?days=${days}`)
      .then(setHistory)
      .catch(err => {
        if (err instanceof ApiError) setError(err.status === 404 ? 'Server not found' : `Error (${err.status})`)
        else setError('Failed to load server history')
      })
      .finally(() => setLoading(false))
  }, [serverName, days])

  // Focus trap and escape handler
  useEffect(() => {
    closeButtonRef.current?.focus()

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      // Focus trap
      if (e.key === 'Tab' && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
        if (focusable.length === 0) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    // Lock body scroll
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = ''
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  const recentEvents = history?.history.slice(0, 5) ?? []

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-40 bg-black/60 transition-opacity duration-300"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`${serverName} server details`}
        className="fixed inset-y-0 right-0 z-50 w-full sm:w-[50vw] sm:min-w-[400px] bg-gray-950 border-l border-gray-800 shadow-2xl transform transition-transform duration-300 ease-out overflow-y-auto"
      >
        <div className="p-6 space-y-5">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-100">{serverName}</h2>
              {history && (
                <p className="text-sm text-gray-500 mt-0.5">
                  <span className={`inline-block h-2 w-2 rounded-full mr-1 ${statusColors[history.status] ?? 'bg-gray-500'}`} />
                  {history.status} — {history.uptimePercent}% uptime
                </p>
              )}
            </div>
            <button
              ref={closeButtonRef}
              onClick={onClose}
              className="text-gray-400 hover:text-gray-200 p-1 rounded hover:bg-gray-800 transition-colors"
              aria-label="Close panel"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Time range selector */}
          <div className="flex gap-1 rounded-lg bg-gray-900 p-1 border border-gray-800">
            {TIME_RANGES.map(r => (
              <button
                key={r.days}
                onClick={() => setDays(r.days)}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  days === r.days ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>

          {/* Loading state */}
          {loading && !history && (
            <div className="flex items-center justify-center py-16">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            </div>
          )}

          {/* Error state */}
          {error && !history && (
            <p className="text-center text-red-400 py-10 text-sm">{error}</p>
          )}

          {/* Content */}
          {history && (
            <>
              {/* Uptime trend chart */}
              <div>
                <h3 className="text-xs uppercase text-gray-500 mb-2">Uptime Trend</h3>
                {history.uptimeTrend && history.uptimeTrend.length > 0
                  ? <UptimeTrendChart data={history.uptimeTrend} height={200} />
                  : <p className="text-gray-500 text-sm py-6 text-center">No trend data available</p>
                }
              </div>

              {/* Status timeline */}
              <div>
                <h3 className="text-xs uppercase text-gray-500 mb-2">Status Timeline</h3>
                <StatusTimeline history={history.history} days={days} />
              </div>

              {/* Recent events */}
              {recentEvents.length > 0 && (
                <div>
                  <h3 className="text-xs uppercase text-gray-500 mb-2">Recent Events</h3>
                  <div className="space-y-0">
                    {recentEvents.map((entry, i) => (
                      <div key={i} className="flex items-center gap-3 py-1.5 text-sm border-b border-gray-800/50 last:border-0">
                        <span className={`rounded px-2 py-0.5 text-xs ${statusTextColors[entry.status] ?? 'bg-gray-900/50 text-gray-400'}`}>
                          {entry.status}
                        </span>
                        <span className="text-gray-400 text-xs">{new Date(entry.startedAt).toLocaleString()}</span>
                        <span className="text-gray-600 text-xs">{formatDuration(entry.startedAt, entry.endedAt)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* View full history link */}
              <Link
                to={`/server/status/${encodeURIComponent(serverName)}?days=${days}`}
                className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 hover:underline transition-colors pt-2"
              >
                View full history <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </>
          )}
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd C:/Git/soverance/Vanalytics/src/Vanalytics.Web && npx tsc --noEmit`
Expected: Errors from dashboard (missing `onServerClick` props) — that's expected, fixed in Task 4.

- [ ] **Step 3: Commit**

```bash
git add src/Vanalytics.Web/src/components/server/ServerDetailPanel.tsx
git commit -m "feat(server): add ServerDetailPanel slide-over component"
```

---

## Task 4: Wire everything into the dashboard

**Files:**
- Modify: `src/Vanalytics.Web/src/pages/ServerStatusDashboard.tsx`

- [ ] **Step 1: Update the dashboard**

Replace the full file content of `ServerStatusDashboard.tsx` with:

```tsx
import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, ApiError } from '../api/client'
import type { ServerAnalytics } from '../types/api'
import ServiceHealthCards from '../components/server/ServiceHealthCards'
import UptimeTrendChart from '../components/server/UptimeTrendChart'
import ServerHeatmap from '../components/server/ServerHeatmap'
import ServerRankings from '../components/server/ServerRankings'
import CurrentStatusGrid from '../components/server/CurrentStatusGrid'
import RecentIncidents from '../components/server/RecentIncidents'
import ServerDetailPanel from '../components/server/ServerDetailPanel'

const TIME_RANGES = [
  { label: '24h', days: 1 },
  { label: '48h', days: 2 },
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
  { label: '365d', days: 365 },
  { label: 'All', days: 0 },
]

export default function ServerStatusDashboard() {
  const [searchParams, setSearchParams] = useSearchParams()
  const daysParam = searchParams.get('days')
  const [days, setDays] = useState(daysParam ? Number(daysParam) : 30)
  const [data, setData] = useState<ServerAnalytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedServer, setSelectedServer] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError('')
    api<ServerAnalytics>(`/api/servers/analytics?days=${days}`)
      .then(setData)
      .catch(err => {
        if (err instanceof ApiError) setError(`Failed to load analytics (${err.status})`)
        else setError('Failed to load analytics')
      })
      .finally(() => setLoading(false))
  }, [days])

  const changeDays = (d: number) => {
    setDays(d)
    setSearchParams({ days: String(d) })
  }

  const handleServerClick = useCallback((serverName: string) => {
    setSelectedServer(serverName)
  }, [])

  const handlePanelClose = useCallback(() => {
    setSelectedServer(null)
  }, [])

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    )
  }

  if (error && !data) {
    return <p className="text-center text-red-400 py-20">{error}</p>
  }

  if (!data) return null

  const lastChecked = data.serviceHealth.lastCheckedAt ? new Date(data.serviceHealth.lastCheckedAt) : null
  const isStale = lastChecked ? (Date.now() - lastChecked.getTime()) > 10 * 60 * 1000 : false
  const currentServers = data.serverRankings.map(r => ({ name: r.name, status: r.status }))

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Server Status</h1>
          <p className="text-sm text-gray-500">FFXI service health and uptime analytics</p>
        </div>
        <div className="flex gap-1 rounded-lg bg-gray-900 p-1 border border-gray-800">
          {TIME_RANGES.map(r => (
            <button
              key={r.days}
              onClick={() => changeDays(r.days)}
              className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                days === r.days
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {isStale && (
        <div className="rounded-lg border border-amber-900/50 bg-amber-900/20 px-4 py-2 text-sm text-amber-400">
          Status data may be outdated — last check was {Math.round((Date.now() - lastChecked!.getTime()) / 60000)} minutes ago.
        </div>
      )}

      <ServiceHealthCards health={data.serviceHealth} rankings={data.serverRankings} />

      <section className="rounded-lg border border-gray-800 bg-gray-900 p-4">
        <h2 className="text-xs uppercase text-gray-500 mb-3">Service Uptime Trend</h2>
        {data.uptimeTrend.length > 0
          ? <UptimeTrendChart data={data.uptimeTrend} />
          : <p className="text-gray-500 text-sm py-10 text-center">Collecting server data — check back soon.</p>
        }
      </section>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <section className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <h2 className="text-xs uppercase text-gray-500 mb-3">Server Heatmap</h2>
          <ServerHeatmap data={data.heatmap} days={days} onServerClick={handleServerClick} />
        </section>
        <section className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <h2 className="text-xs uppercase text-gray-500 mb-3">Server Rankings</h2>
          <ServerRankings rankings={data.serverRankings} days={days} onServerClick={handleServerClick} />
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <h2 className="text-xs uppercase text-gray-500 mb-3">Current Status</h2>
          <CurrentStatusGrid servers={currentServers} onServerClick={handleServerClick} />
        </section>
        <section className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <h2 className="text-xs uppercase text-gray-500 mb-3">Recent Incidents</h2>
          <RecentIncidents incidents={data.recentIncidents} />
        </section>
      </div>

      {/* Slide-over panel */}
      {selectedServer && (
        <ServerDetailPanel
          serverName={selectedServer}
          initialDays={days}
          onClose={handlePanelClose}
        />
      )}
    </div>
  )
}
```

Key changes from original:
- Added `selectedServer` state and `handleServerClick`/`handlePanelClose` callbacks
- Added `ServerDetailPanel` import and conditional render
- Passed `onServerClick={handleServerClick}` to `ServerHeatmap`, `ServerRankings`, `CurrentStatusGrid`
- Added `useCallback` to import

- [ ] **Step 2: Verify everything compiles**

Run: `cd C:/Git/soverance/Vanalytics/src/Vanalytics.Web && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/Vanalytics.Web/src/pages/ServerStatusDashboard.tsx
git commit -m "feat(server): wire slide-over panel into dashboard with onServerClick callbacks"
```

---

## Task 5: Verification

**Files:** None (verification only)

- [ ] **Step 1: Verify frontend compiles clean**

Run: `cd C:/Git/soverance/Vanalytics/src/Vanalytics.Web && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 2: Verify backend still builds**

Run: `cd C:/Git/soverance/Vanalytics/src/Vanalytics.Api && dotnet build --no-restore`
Expected: Build succeeded

- [ ] **Step 3: Manual testing checklist**

Run the app and verify:
- Clicking any server name in the heatmap opens the slide-over
- Clicking any server name in rankings opens the slide-over
- Clicking any server name in current status grid opens the slide-over
- Panel shows server name, status, uptime % in header
- Time range selector works within the panel
- Uptime trend chart renders at ~200px height
- Status timeline bar renders correctly
- Up to 5 recent events shown
- "View full history →" link navigates to `/server/status/:name`
- Clicking overlay closes the panel
- Pressing Escape closes the panel
- Clicking X button closes the panel
- Body scroll is locked while panel is open
- Server names show hover underline + blue color
- Direct URL `/server/status/Asura` still works (detail page)
