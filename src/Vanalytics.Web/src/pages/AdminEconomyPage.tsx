import { useState, useEffect, useCallback, useRef } from 'react'
import { api, getStoredTokens } from '../api/client'
import { deriveScraperHealth, type ScraperStatus, type ScraperTone } from '../lib/scraperStatus'

// ─── Types ────────────────────────────────────────────────────────────────────

interface World {
  id: number
  name: string
  status: string
  searchHost: string | null
  searchPort: number | null
  scrapeEnabled: boolean
  mappingSource: number  // 0=Unmapped, 1=Auto, 2=Manual
  mappingConfidence: number | null
  endpointHealthy: boolean | null
  lastProbedAt: string | null
  lastScrapedAt: string | null
  lastScrapeError: string | null
  lastScrapeErrorAt: string | null
  saleCount: number
}

interface DiscoveryProgress {
  type: string  // Started|Progress|Completed|Cancelled|Failed
  message?: string
  scanned: number
  total: number
  found: number
}

interface DiscoverySampleSale {
  price: number
  soldAt: string
  sellerName: string
  buyerName: string
}
interface DiscoveryProbeItem {
  itemId: number
  itemName: string
  sales: DiscoverySampleSale[]
}
interface DiscoveredEndpointReport {
  id: number
  ip: string
  port: number
  scannedAt: string
  mappedServerId: number | null
  mappedServerName: string | null
  sampleSales: DiscoveryProbeItem[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  const now = Date.now()
  const diff = now - d.getTime()
  const mins = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days = Math.floor(diff / 86_400_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`
  return d.toLocaleDateString()
}

function mappingLabel(source: number): string {
  if (source === 1) return 'Auto'
  if (source === 2) return 'Manual'
  return 'Unmapped'
}

function mappingBadgeClass(source: number): string {
  if (source === 1) return 'bg-blue-950/60 text-blue-300 border-blue-900/60'
  if (source === 2) return 'bg-violet-950/60 text-violet-300 border-violet-900/60'
  return 'bg-gray-800/60 text-gray-500 border-gray-700/60'
}

function healthBadge(healthy: boolean | null): { label: string; cls: string } {
  if (healthy === true) return { label: 'Healthy', cls: 'text-emerald-400' }
  if (healthy === false) return { label: 'Unhealthy', cls: 'text-red-400' }
  return { label: 'Unknown', cls: 'text-gray-500' }
}

// ─── WorldRow ─────────────────────────────────────────────────────────────────

function WorldRow({ world, onRefresh }: { world: World; onRefresh: () => void }) {
  const [editHost, setEditHost] = useState(world.searchHost ?? '')
  const [editPort, setEditPort] = useState(String(world.searchPort ?? ''))
  const [editing, setEditing] = useState(false)
  const [savingEndpoint, setSavingEndpoint] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ healthy: boolean } | null>(null)
  const [togglingEnabled, setTogglingEnabled] = useState(false)
  const [endpointError, setEndpointError] = useState('')

  const handleSaveEndpoint = async () => {
    const port = parseInt(editPort, 10)
    if (!editHost.trim() || isNaN(port) || port < 1 || port > 65535) {
      setEndpointError('Enter a valid host and port (1–65535).')
      return
    }
    setSavingEndpoint(true)
    setEndpointError('')
    try {
      await api(`/api/admin/economy/${world.id}/endpoint`, {
        method: 'PUT',
        body: JSON.stringify({ host: editHost.trim(), port }),
      })
      setEditing(false)
      onRefresh()
    } catch (err: unknown) {
      setEndpointError(err instanceof Error ? err.message : 'Save failed.')
    } finally {
      setSavingEndpoint(false)
    }
  }

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const result = await api<{ healthy: boolean }>(`/api/admin/economy/${world.id}/test`, { method: 'POST' })
      setTestResult(result)
      onRefresh()
    } catch {
      setTestResult({ healthy: false })
    } finally {
      setTesting(false)
    }
  }

  const handleToggleScrape = async () => {
    setTogglingEnabled(true)
    try {
      await api(`/api/admin/economy/${world.id}/scrape-enabled`, {
        method: 'PUT',
        body: JSON.stringify({ enabled: !world.scrapeEnabled }),
      })
      onRefresh()
    } catch {
      // swallow; world list will refresh or not
    } finally {
      setTogglingEnabled(false)
    }
  }

  const health = testResult ? { label: testResult.healthy ? 'Healthy' : 'Unhealthy', cls: testResult.healthy ? 'text-emerald-400' : 'text-red-400' } : healthBadge(world.endpointHealthy)

  return (
    <tr className="border-t border-gray-800 align-top">
      {/* Name + status */}
      <td className="px-4 py-3">
        <p className="text-sm font-medium text-gray-200">{world.name}</p>
        <p className="text-xs text-gray-500">{world.status}</p>
      </td>

      {/* Endpoint (inline-editable) */}
      <td className="px-4 py-3">
        {editing ? (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <input
                value={editHost}
                onChange={e => setEditHost(e.target.value)}
                placeholder="search.host"
                className="flex-1 min-w-0 rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
              />
              <input
                value={editPort}
                onChange={e => setEditPort(e.target.value)}
                placeholder="port"
                className="w-16 rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
              />
            </div>
            {endpointError && <p className="text-[10px] text-red-400">{endpointError}</p>}
            <div className="flex gap-1.5">
              <button
                onClick={handleSaveEndpoint}
                disabled={savingEndpoint}
                className="px-2 py-0.5 text-xs rounded bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 transition-colors"
              >
                {savingEndpoint ? 'Saving…' : 'Save'}
              </button>
              <button
                onClick={() => { setEditing(false); setEditHost(world.searchHost ?? ''); setEditPort(String(world.searchPort ?? '')) }}
                className="px-2 py-0.5 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-200 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="group text-left"
          >
            {world.searchHost ? (
              <span className="text-xs text-gray-300 group-hover:text-blue-300 transition-colors">
                {world.searchHost}:{world.searchPort}
              </span>
            ) : (
              <span className="text-xs text-gray-600 group-hover:text-blue-400 transition-colors">Set endpoint…</span>
            )}
          </button>
        )}
      </td>

      {/* Mapping badge */}
      <td className="px-4 py-3">
        <span className={`inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded border ${mappingBadgeClass(world.mappingSource)}`}>
          {mappingLabel(world.mappingSource)}
          {world.mappingConfidence != null && world.mappingSource !== 0 && (
            <span className="opacity-60">{world.mappingConfidence} matches</span>
          )}
        </span>
      </td>

      {/* Health + Test button */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className={`text-xs ${health.cls}`}>{health.label}</span>
          {world.lastProbedAt && (
            <span className="text-[10px] text-gray-600">{formatDate(world.lastProbedAt)}</span>
          )}
        </div>
        <button
          onClick={handleTest}
          disabled={testing || !world.searchHost}
          className="mt-1 px-2 py-0.5 text-[11px] rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-gray-200 transition-colors"
        >
          {testing ? 'Testing…' : 'Test'}
        </button>
      </td>

      {/* Scrape toggle */}
      <td className="px-4 py-3">
        <button
          onClick={handleToggleScrape}
          disabled={togglingEnabled}
          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors ${
            world.scrapeEnabled ? 'bg-blue-600' : 'bg-gray-700'
          } ${togglingEnabled ? 'opacity-50' : ''}`}
          role="switch"
          aria-checked={world.scrapeEnabled}
        >
          <span
            className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
              world.scrapeEnabled ? 'translate-x-4' : 'translate-x-0.5'
            }`}
          />
        </button>
      </td>

      {/* Last scraped + sale count */}
      <td className="px-4 py-3">
        <p className="text-xs text-gray-400">{formatDate(world.lastScrapedAt)}</p>
        <p className="text-[11px] text-gray-600">{world.saleCount.toLocaleString()} sales</p>
        {world.lastScrapeError && (
          <p className="mt-1 text-[11px] text-red-400 max-w-[16rem] break-words" title={world.lastScrapeError}>
            ⚠ {world.lastScrapeError}
            <span className="text-red-500/60"> · {formatDate(world.lastScrapeErrorAt)}</span>
          </p>
        )}
      </td>
    </tr>
  )
}

// ─── DiscoveryPanel ───────────────────────────────────────────────────────────

function DiscoveryPanel({ onWorldsRefresh, worlds }: { onWorldsRefresh: () => void; worlds: World[] }) {
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<DiscoveryProgress | null>(null)
  const [error, setError] = useState('')
  const [report, setReport] = useState<DiscoveredEndpointReport[]>([])
  const abortRef = useRef<AbortController | null>(null)

  const fetchReport = useCallback(() => {
    api<DiscoveredEndpointReport[]>('/api/admin/economy/discovery/report')
      .then(setReport)
      .catch(() => { /* leave last-known report */ })
  }, [])

  useEffect(() => { fetchReport() }, [fetchReport])

  const [cidrs, setCidrs] = useState('')
  const [cidrsSaving, setCidrsSaving] = useState(false)
  const [cidrsStatus, setCidrsStatus] = useState('')

  const fetchCidrs = useCallback(() => {
    api<{ cidrs: string }>('/api/admin/economy/discovery/cidrs')
      .then(r => setCidrs(r.cidrs))
      .catch(() => { /* leave empty */ })
  }, [])

  useEffect(() => { fetchCidrs() }, [fetchCidrs])

  const handleSaveCidrs = async () => {
    setCidrsSaving(true)
    setCidrsStatus('')
    try {
      await api('/api/admin/economy/discovery/cidrs', {
        method: 'PUT',
        body: JSON.stringify({ cidrs }),
      })
      setCidrsStatus('Saved.')
    } catch (err: unknown) {
      setCidrsStatus(err instanceof Error ? err.message : 'Save failed.')
    } finally {
      setCidrsSaving(false)
    }
  }

  const openStream = useCallback((abort: AbortController) => {
    const run = async () => {
      const { accessToken } = getStoredTokens()
      try {
        const response = await fetch('/api/admin/economy/discovery/progress', {
          headers: { Authorization: `Bearer ${accessToken ?? ''}` },
          signal: abort.signal,
        })

        if (!response.ok || !response.body) return

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const blocks = buffer.split('\n\n')
          buffer = blocks.pop()!
          for (const block of blocks) {
            const dataMatch = block.match(/^data: (.+)$/m)
            if (dataMatch) {
              const evt: DiscoveryProgress = JSON.parse(dataMatch[1])
              setProgress(evt)
              if (evt.type === 'Completed' || evt.type === 'Cancelled' || evt.type === 'Failed') {
                setRunning(false)
                onWorldsRefresh()
                fetchReport()
              }
            }
          }
        }
      } catch {
        // Aborted or network error — silent
      } finally {
        abortRef.current = null
        setRunning(false)
      }
    }
    run()
  }, [onWorldsRefresh, fetchReport])

  const handleMap = async (endpointId: number, serverId: number | null) => {
    try {
      await api(`/api/admin/economy/discovery/${endpointId}/map`, {
        method: 'POST',
        body: JSON.stringify({ serverId }),
      })
      fetchReport()
      onWorldsRefresh()
    } catch {
      // swallow; report refresh will reflect reality
    }
  }

  const handleStart = async () => {
    setError('')
    setProgress(null)
    try {
      await api('/api/admin/economy/discovery/start', { method: 'POST' })
      setRunning(true)
      const abort = new AbortController()
      abortRef.current = abort
      openStream(abort)
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 409) {
        setError('Discovery is already running.')
        setRunning(true)
        const abort = new AbortController()
        abortRef.current = abort
        openStream(abort)
      } else {
        setError(err instanceof Error ? err.message : 'Failed to start discovery.')
      }
    }
  }

  const handleCancel = async () => {
    try {
      await api('/api/admin/economy/discovery/cancel', { method: 'POST' })
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  const pct = progress && progress.total > 0
    ? Math.min(100, Math.round((progress.scanned / progress.total) * 100))
    : 0

  const isDone = progress && (progress.type === 'Completed' || progress.type === 'Cancelled' || progress.type === 'Failed')

  return (
    <div className={`rounded-lg border bg-gray-900 p-5 transition-colors ${running ? 'border-blue-600' : 'border-gray-800'}`}>
      <div className="mb-4">
        <label className="block text-xs font-semibold text-gray-400 mb-1">
          Scan ranges — one CIDR per line
        </label>
        <textarea
          value={cidrs}
          onChange={e => setCidrs(e.target.value)}
          rows={3}
          spellCheck={false}
          placeholder="e.g. 10.0.0.0/24"
          className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs font-mono text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
        />
        <div className="mt-1 flex items-center gap-2">
          <button
            onClick={handleSaveCidrs}
            disabled={cidrsSaving}
            className="px-2.5 py-1 text-xs rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-gray-200 transition-colors"
          >
            {cidrsSaving ? 'Saving…' : 'Save ranges'}
          </button>
          {cidrsStatus && <span className="text-[11px] text-gray-500">{cidrsStatus}</span>}
        </div>
      </div>

      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-base font-semibold text-gray-200">Endpoint Discovery</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Probes known search-server ports across all worlds to auto-detect endpoints.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {running && (
            <button
              onClick={handleCancel}
              className="px-3 py-1.5 text-sm rounded bg-red-600 hover:bg-red-700 text-white transition-colors"
            >
              Cancel
            </button>
          )}
          {!running && (
            <button
              onClick={handleStart}
              className="px-3 py-1.5 text-sm rounded bg-blue-600 hover:bg-blue-700 text-white transition-colors"
            >
              Discover Endpoints
            </button>
          )}
        </div>
      </div>

      {running && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-blue-400 text-sm animate-pulse">● Scanning…</span>
            {progress && progress.total > 0 && (
              <span className="text-xs text-gray-500">
                {progress.scanned.toLocaleString()} / {progress.total.toLocaleString()} ({pct}%)
              </span>
            )}
            {progress && progress.found > 0 && (
              <span className="text-xs text-emerald-400 ml-auto">{progress.found} found</span>
            )}
          </div>
          <div className="h-2 rounded-full bg-gray-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-blue-600 transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
          {progress?.message && (
            <p className="text-xs text-gray-400">{progress.message}</p>
          )}
        </div>
      )}

      {isDone && progress && (
        <div className="mt-2 flex gap-4 text-xs flex-wrap">
          <span className={progress.type === 'Completed' ? 'text-emerald-400' : 'text-yellow-400'}>
            {progress.type}
          </span>
          <span className="text-gray-400">{progress.found} endpoints found</span>
          {progress.message && <span className="text-gray-500">{progress.message}</span>}
        </div>
      )}

      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

      {report.length > 0 && (
        <div className="mt-4 space-y-3">
          <h4 className="text-xs font-semibold text-gray-400">Discovered endpoints ({report.length})</h4>
          {report.map(ep => (
            <div key={ep.id} className="rounded border border-gray-800 bg-gray-950/40 p-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="text-sm text-gray-200 font-mono">{ep.ip}:{ep.port}</div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-600">{formatDate(ep.scannedAt)}</span>
                  <select
                    value={ep.mappedServerId ?? ''}
                    onChange={e => handleMap(ep.id, e.target.value === '' ? null : Number(e.target.value))}
                    className="rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-600"
                  >
                    <option value="">Map to world…</option>
                    {worlds.map(w => (
                      <option key={w.id} value={w.id}>
                        {w.name}{w.searchHost ? ` (${w.searchHost})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {ep.mappedServerName && (
                <p className="mt-1 text-[11px] text-emerald-400">Mapped → {ep.mappedServerName}</p>
              )}
              <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {ep.sampleSales.map(item => (
                  <div key={item.itemId} className="text-[11px]">
                    <p className="text-gray-400 mb-0.5">{item.itemName}</p>
                    {item.sales.length === 0 ? (
                      <p className="text-gray-600">no recent sales</p>
                    ) : (
                      <ul className="space-y-0.5">
                        {item.sales.map((s, i) => (
                          <li key={i} className="text-gray-500">
                            {s.price.toLocaleString()}g · {new Date(s.soldAt).toLocaleDateString()} · {s.buyerName}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── StatusCard ───────────────────────────────────────────────────────────────

const toneClasses: Record<ScraperTone, { border: string; text: string; dot: string }> = {
  green: { border: 'border-emerald-800/60', text: 'text-emerald-400', dot: 'bg-emerald-400' },
  amber: { border: 'border-amber-800/60', text: 'text-amber-400', dot: 'bg-amber-400' },
  red: { border: 'border-red-800/60', text: 'text-red-400', dot: 'bg-red-400' },
  gray: { border: 'border-gray-800', text: 'text-gray-500', dot: 'bg-gray-600' },
}

function StatusCard({ status, masterEnabled }: { status: ScraperStatus | null; masterEnabled: boolean }) {
  const health = deriveScraperHealth(status, masterEnabled, Date.now())
  const t = toneClasses[health.tone]

  return (
    <div className={`rounded-lg border bg-gray-900 p-5 transition-colors ${t.border}`}>
      <div className="flex items-center gap-2">
        <span className={`inline-block h-2.5 w-2.5 rounded-full ${t.dot} ${health.key === 'running' ? 'animate-pulse' : ''}`} />
        <span className={`text-sm font-medium ${t.text}`}>{health.label}</span>
        {status?.lastCycleFinishedAt && (
          <span className="text-xs text-gray-500">· last cycle {formatDate(status.lastCycleFinishedAt)}</span>
        )}
      </div>

      {masterEnabled && status && (health.key === 'active' || health.key === 'running' || health.key === 'stalled') && (
        <p className="mt-1.5 text-xs text-gray-500">
          {status.salesIngestedLastCycle.toLocaleString()} sales ingested across{' '}
          {status.worldsProcessedLastCycle.toLocaleString()} world{status.worldsProcessedLastCycle === 1 ? '' : 's'} last cycle
        </p>
      )}

      {!masterEnabled && (
        <p className="mt-1.5 text-xs text-gray-600">Master switch is off — the scraper is not running.</p>
      )}

      {status?.lastError && (
        <p className="mt-2 text-xs text-red-400 break-words">
          ⚠ {status.lastError}
          {status.lastErrorAt && <span className="text-red-500/60"> · {formatDate(status.lastErrorAt)}</span>}
        </p>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminEconomyPage() {
  const [masterEnabled, setMasterEnabled] = useState(false)
  const [masterLoading, setMasterLoading] = useState(true)
  const [masterToggling, setMasterToggling] = useState(false)
  const [masterError, setMasterError] = useState('')

  const [worlds, setWorlds] = useState<World[]>([])
  const [worldsLoading, setWorldsLoading] = useState(true)
  const [worldsError, setWorldsError] = useState('')

  const [status, setStatus] = useState<ScraperStatus | null>(null)

  const fetchWorlds = useCallback(() => {
    setWorldsLoading(true)
    api<World[]>('/api/admin/economy/worlds')
      .then(setWorlds)
      .catch(() => setWorldsError('Failed to load worlds.'))
      .finally(() => setWorldsLoading(false))
  }, [])

  const fetchStatus = useCallback(() => {
    api<ScraperStatus>('/api/admin/economy/status')
      .then(setStatus)
      .catch(() => { /* transient; keep last-known status */ })
  }, [])

  useEffect(() => {
    api<{ masterEnabled: boolean }>('/api/admin/economy/master')
      .then(r => setMasterEnabled(r.masterEnabled))
      .catch(() => setMasterError('Failed to load master setting.'))
      .finally(() => setMasterLoading(false))

    fetchWorlds()
  }, [fetchWorlds])

  // Poll scraper status while the page is open so the heartbeat stays fresh.
  useEffect(() => {
    fetchStatus()
    const id = setInterval(fetchStatus, 15_000)
    return () => clearInterval(id)
  }, [fetchStatus])

  const handleToggleMaster = async () => {
    setMasterError('')
    setMasterToggling(true)
    try {
      const result = await api<{ masterEnabled: boolean }>('/api/admin/economy/master', {
        method: 'PUT',
        body: JSON.stringify({ enabled: !masterEnabled }),
      })
      setMasterEnabled(result.masterEnabled)
      fetchStatus()
    } catch (err: unknown) {
      setMasterError(err instanceof Error ? err.message : 'Failed to update master switch.')
    } finally {
      setMasterToggling(false)
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Economy Admin</h1>
      <p className="text-sm text-gray-500 mb-6">
        Manage AH scraper endpoints, per-world scraping, and endpoint discovery.
      </p>

      {/* ── Master toggle ── */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">Master Scraper Switch</h2>
        <div className={`rounded-lg border p-5 bg-gray-900 transition-colors ${masterEnabled ? 'border-amber-700/60' : 'border-gray-800'}`}>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-200 mb-1">
                AH Scraper{' '}
                <span className={masterEnabled ? 'text-amber-400' : 'text-gray-500'}>
                  {masterEnabled ? 'Enabled' : 'Disabled'}
                </span>
              </p>
              <p className="text-xs text-amber-600/80 leading-relaxed max-w-xl">
                Warning: enabling this connects to live retail search servers. Ensure all endpoint
                addresses are correct and permission to probe them has been granted before enabling.
              </p>
              {masterError && <p className="mt-1 text-xs text-red-400">{masterError}</p>}
            </div>
            <div className="shrink-0 flex items-center gap-3">
              {masterLoading ? (
                <span className="text-xs text-gray-500">Loading…</span>
              ) : (
                <button
                  onClick={handleToggleMaster}
                  disabled={masterToggling}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors ${
                    masterEnabled ? 'bg-amber-600' : 'bg-gray-700'
                  } ${masterToggling ? 'opacity-50' : ''}`}
                  role="switch"
                  aria-checked={masterEnabled}
                  aria-label="Master scraper toggle"
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      masterEnabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── Scraper status ── */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">Scraper Status</h2>
        <StatusCard status={status} masterEnabled={masterEnabled} />
      </section>

      {/* ── Discovery ── */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">Endpoint Discovery</h2>
        <DiscoveryPanel onWorldsRefresh={fetchWorlds} worlds={worlds} />
      </section>

      {/* ── World table ── */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Worlds</h2>

        {worldsLoading && <p className="text-sm text-gray-400">Loading worlds…</p>}
        {worldsError && <p className="text-sm text-red-400">{worldsError}</p>}

        {!worldsLoading && !worldsError && worlds.length === 0 && (
          <p className="text-sm text-gray-500">No worlds found.</p>
        )}

        {worlds.length > 0 && (
          <div className="rounded-lg border border-gray-800 bg-gray-900 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-800/50 text-left text-xs text-gray-500">
                  <th className="px-4 py-2.5 font-medium">World</th>
                  <th className="px-4 py-2.5 font-medium">Endpoint</th>
                  <th className="px-4 py-2.5 font-medium">Mapping</th>
                  <th className="px-4 py-2.5 font-medium">Health</th>
                  <th className="px-4 py-2.5 font-medium">Scrape</th>
                  <th className="px-4 py-2.5 font-medium">Last Scraped</th>
                </tr>
              </thead>
              <tbody>
                {worlds.map(world => (
                  <WorldRow key={world.id} world={world} onRefresh={fetchWorlds} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
