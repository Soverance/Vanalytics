import { useState, useEffect, useCallback } from 'react'
import { api } from '../api/client'
import { useSyncProgress } from '../context/SyncContext'

// ─── Types ────────────────────────────────────────────────────────────────────

interface GameDataStats {
  items: {
    total: number
    withIcons: number
    withDescriptions: number
    missingIcons: number
    iconCoverage: number
    categories: { category: string; count: number }[]
  }
  modelMappings: {
    total: number
    itemsWithModels: number
    slots: { slotId: number; count: number }[]
  }
  npcPools: {
    total: number
    monsters: number
    humanoids: number
    families: number
  }
  characters: {
    total: number
    withRace: number
  }
  servers: {
    total: number
  }
  economy: {
    totalAhSales: number
    totalBazaarListings: number
    activeBazaarListings: number
    activeBazaarPresences: number
  }
}

interface SyncProviderStatus {
  providerId: string
  displayName: string
  isRunning: boolean
  metadata?: {
    storageType: string
    label: string
  }
  lastSync: {
    startedAt: string
    completedAt: string | null
    status: string
    itemsAdded: number
    itemsUpdated: number
    itemsSkipped: number
    itemsFailed: number
    totalItems: number
    errorMessage: string | null
  } | null
}


// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
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

// ─── StatCard ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-200">{typeof value === 'number' ? value.toLocaleString() : value}</p>
      {sub && <p className="text-xs text-gray-600 mt-1">{sub}</p>}
    </div>
  )
}

// ─── SyncCard ─────────────────────────────────────────────────────────────────

function SyncCard({
  provider,
  onRefresh,
}: {
  provider: SyncProviderStatus
  onRefresh: () => void
}) {
  const { progress: allProgress, isStreaming, startStream } = useSyncProgress()
  const progress = allProgress[provider.providerId] ?? null
  const [running, setRunning] = useState(provider.isRunning)
  const [error, setError] = useState('')

  // Auto-connect to SSE stream if a sync is running (including on re-mount after navigation)
  useEffect(() => {
    if (provider.isRunning) {
      setRunning(true)
      if (!isStreaming(provider.providerId)) {
        startStream(provider.providerId, onRefresh)
      }
    } else if (!isStreaming(provider.providerId)) {
      setRunning(false)
    }
  }, [provider.isRunning, provider.providerId, isStreaming, startStream, onRefresh])

  // Watch for terminal events from the context-managed stream
  useEffect(() => {
    if (progress && (progress.type === 'Completed' || progress.type === 'Cancelled' || progress.type === 'Failed')) {
      setRunning(false)
    }
  }, [progress])

  const handleSyncNow = async () => {
    setError('')
    try {
      await api(`/api/admin/sync/${provider.providerId}/start`, { method: 'POST' })
      setRunning(true)
      startStream(provider.providerId, onRefresh)
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 409) {
        setError('A sync is already running for this provider.')
        setRunning(true)
        startStream(provider.providerId, onRefresh)
      } else {
        setError('Failed to start sync.')
      }
    }
  }

  const handleCancel = async () => {
    try {
      await api(`/api/admin/sync/${provider.providerId}/cancel`, { method: 'POST' })
    } catch {
      setError('Failed to send cancel request.')
    }
  }

  const pct =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.current / progress.total) * 100))
      : 0

  const lastSync = provider.lastSync

  return (
    <div
      className={`rounded-lg border bg-gray-900 p-5 transition-colors ${
        running ? 'border-blue-600' : 'border-gray-800'
      }`}
    >
      {/* Header row */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-base font-semibold text-gray-200">{provider.displayName}</h3>
          {lastSync ? (
            <p className="text-xs text-gray-500 mt-0.5">
              Last sync: {formatDate(lastSync.startedAt)}
              {lastSync.totalItems > 0 && ` · ${lastSync.totalItems.toLocaleString()} items`}
            </p>
          ) : (
            <p className="text-xs text-gray-500 mt-0.5">Never synced</p>
          )}
          {provider.metadata && (
            <p className="text-xs mt-0.5">
              <span className="text-gray-500">Storage: </span>
              <span className={provider.metadata.storageType === 'azure' ? 'text-blue-400' : 'text-amber-400'}>
                {provider.metadata.label}
              </span>
            </p>
          )}
        </div>

        {running ? (
          <button
            onClick={handleCancel}
            className="px-3 py-1.5 text-sm rounded bg-red-600 hover:bg-red-700 text-white transition-colors"
          >
            Cancel
          </button>
        ) : (
          <button
            onClick={handleSyncNow}
            className="px-3 py-1.5 text-sm rounded bg-blue-600 hover:bg-blue-700 text-white transition-colors"
          >
            Sync Now
          </button>
        )}
      </div>

      {/* Running state */}
      {running && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-blue-400 text-sm animate-pulse">● Syncing…</span>
            {progress && progress.total > 0 && (
              <span className="text-xs text-gray-500">
                {progress.current.toLocaleString()} / {progress.total.toLocaleString()} ({pct}%)
              </span>
            )}
          </div>

          {/* Progress bar */}
          <div className="h-2 rounded-full bg-gray-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-blue-600 transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>

          {/* Current item */}
          {progress?.currentItem && (
            <p className="text-xs text-gray-400 truncate">
              Processing: <span className="text-gray-300">{progress.currentItem}</span>
              {progress.currentItemId !== undefined && (
                <span className="text-gray-600"> (#{progress.currentItemId})</span>
              )}
            </p>
          )}

          {progress?.message && !progress.currentItem && (
            <p className="text-xs text-gray-400">{progress.message}</p>
          )}

          {/* Running counters */}
          {progress && (
            <div className="flex gap-4 text-xs">
              <span className="text-green-400">+{progress.added.toLocaleString()} added</span>
              <span className="text-blue-400">{progress.updated.toLocaleString()} updated</span>
              <span className="text-gray-400">{progress.skipped.toLocaleString()} skipped</span>
              {progress.failed > 0 && (
                <span className="text-red-400">{progress.failed.toLocaleString()} failed</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Completed summary (progress present, not running) */}
      {!running && progress && (progress.type === 'Completed' || progress.type === 'Failed') && (
        <div className="mt-2 text-xs flex gap-4">
          <span className="text-green-400">+{progress.added.toLocaleString()} added</span>
          <span className="text-blue-400">{progress.updated.toLocaleString()} updated</span>
          <span className="text-gray-400">{progress.skipped.toLocaleString()} skipped</span>
          {progress.failed > 0 && (
            <span className="text-red-400">{progress.failed.toLocaleString()} failed</span>
          )}
        </div>
      )}

      {/* Last sync summary (no progress yet, idle) */}
      {!running && !progress && lastSync && (
        <div className="mt-1 text-xs flex gap-4">
          <span className="text-green-400">+{lastSync.itemsAdded.toLocaleString()} added</span>
          <span className="text-blue-400">{lastSync.itemsUpdated.toLocaleString()} updated</span>
          <span className="text-gray-400">{lastSync.itemsSkipped.toLocaleString()} skipped</span>
          {lastSync.itemsFailed > 0 && (
            <span className="text-red-400">{lastSync.itemsFailed.toLocaleString()} failed</span>
          )}
          {lastSync.errorMessage && (
            <span className="text-red-400 ml-2 truncate">{lastSync.errorMessage}</span>
          )}
        </div>
      )}

      {error && <p className="mt-2 text-xs text-yellow-400">{error}</p>}
    </div>
  )
}

// ─── DataSource ──────────────────────────────────────────────────────────

function DataSource({ name, url, description, usedBy }: {
  name: string; url: string; description: string; usedBy: string
}) {
  return (
    <div className="flex gap-3 text-xs">
      <div className="shrink-0 w-1 rounded-full bg-blue-600/40" />
      <div className="min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <a href={url} target="_blank" rel="noopener noreferrer" className="font-medium text-blue-400 hover:text-blue-300">
            {name}
          </a>
          <span className="text-gray-600">|</span>
          <span className="text-gray-500">Used by: <span className="text-gray-400">{usedBy}</span></span>
        </div>
        <p className="text-gray-500 leading-relaxed">{description}</p>
      </div>
    </div>
  )
}

// ─── SyncSection ──────────────────────────────────────────────────────────────

function SyncSection() {
  const [statuses, setStatuses] = useState<SyncProviderStatus[]>([])
  const [loadingSync, setLoadingSync] = useState(true)
  const [syncError, setSyncError] = useState('')

  const fetchStatuses = useCallback(() => {
    api<SyncProviderStatus[]>('/api/admin/sync/status')
      .then(setStatuses)
      .catch(() => setSyncError('Failed to load sync status'))
      .finally(() => setLoadingSync(false))
  }, [])

  useEffect(() => {
    fetchStatuses()
  }, [fetchStatuses])

  return (
    <div className="mb-8">
      <h2 className="text-xl font-bold mb-4">Data Synchronization</h2>

      {loadingSync && <p className="text-gray-400 text-sm">Loading sync status…</p>}
      {syncError && <p className="text-red-400 text-sm">{syncError}</p>}

      {!loadingSync && !syncError && statuses.length === 0 && (
        <p className="text-gray-500 text-sm">No sync providers available.</p>
      )}

      {statuses.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {statuses.map((provider) => (
            <SyncCard key={provider.providerId} provider={provider} onRefresh={fetchStatuses} />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const SLOT_NAMES: Record<number, string> = {
  2: 'Head', 3: 'Body', 4: 'Hands', 5: 'Legs', 6: 'Feet', 7: 'Main', 8: 'Sub', 9: 'Range',
}

function CoverageBar({ label, value, total, color = 'bg-blue-600' }: {
  label: string; value: number; total: number; color?: string
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-gray-400">{label}</span>
        <span className="text-gray-300">
          {value.toLocaleString()} / {total.toLocaleString()}{' '}
          <span className="text-gray-500">({pct}%)</span>
        </span>
      </div>
      <div className="h-2 rounded-full bg-gray-800 overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export default function AdminItemsPage() {
  const [stats, setStats] = useState<GameDataStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api<GameDataStats>('/api/admin/items/stats')
      .then(setStats)
      .catch(() => setError('Failed to load game data stats'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div>
      {/* ── Sync section (always visible) ── */}
      <SyncSection />

      {/* ── Data Sources ── */}
      <div className="mb-8 rounded-lg border border-gray-800 bg-gray-900/50 p-5">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">External Data Sources</h2>
        <p className="text-xs text-gray-500 mb-4">
          These sync features depend on the following community-maintained projects. If a source goes offline or stops updating, the corresponding data will need an alternative source.
        </p>
        <div className="space-y-3">
          <DataSource
            name="Windower Resources"
            url="https://github.com/Windower/Resources"
            description="Item names, descriptions, categories, flags, stats, and equipment properties. Extracted from FFXI game data."
            usedBy="Game Data"
          />
          <DataSource
            name="LandSandBoat"
            url="https://github.com/LandSandBoat/server"
            description="Equipment model ID mappings (item_equipment.sql) and NPC/monster pool data (mob_pools.sql). Maps items to visual 3D model IDs and provides NPC model definitions. Updated with each retail FFXI patch."
            usedBy="Game Data (Model Mappings, NPC Pools)"
          />
          <DataSource
            name="FFXIAH"
            url="https://www.ffxiah.com"
            description="Item icon images (32x32 PNG). Icons are downloaded per item ID from ffxiah.com's image CDN."
            usedBy="Item Icons"
          />
        </div>
      </div>

      <hr className="border-gray-800 mb-8" />

      {/* ── Game Data Health ── */}
      <h1 className="text-2xl font-bold mb-6">Game Data Health</h1>

      {loading && <p className="text-gray-400">Loading game data stats…</p>}
      {error && <p className="text-red-400">{error}</p>}

      {stats && (
        <>
          {/* ── Overview row ── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
            <StatCard label="Items" value={stats.items.total} />
            <StatCard label="Model Mappings" value={stats.modelMappings.total} sub={`${stats.modelMappings.itemsWithModels.toLocaleString()} items with 3D models`} />
            <StatCard label="NPC Pools" value={stats.npcPools.total} sub={`${stats.npcPools.monsters.toLocaleString()} monsters · ${stats.npcPools.humanoids.toLocaleString()} humanoids`} />
            <StatCard label="Characters" value={stats.characters.total} sub={`${stats.servers.total} servers tracked`} />
          </div>

          {/* ── Items ── */}
          <h2 className="text-lg font-semibold mb-3">Items</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
            <div className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-3">
              <CoverageBar label="Icons" value={stats.items.withIcons} total={stats.items.total} />
              <CoverageBar label="Descriptions" value={stats.items.withDescriptions} total={stats.items.total} />
              <CoverageBar label="3D Model Mappings" value={stats.modelMappings.itemsWithModels} total={stats.items.total} color="bg-emerald-600" />
            </div>
            <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
              <p className="text-xs text-gray-500 mb-2">Model Mappings by Slot</p>
              <div className="space-y-1.5">
                {stats.modelMappings.slots.map(s => {
                  const name = SLOT_NAMES[s.slotId] ?? `Slot ${s.slotId}`
                  return (
                    <div key={s.slotId} className="flex items-center justify-between text-xs">
                      <span className="text-gray-400 w-16">{name}</span>
                      <div className="flex-1 mx-2 h-1.5 rounded-full bg-gray-800 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-emerald-600"
                          style={{ width: `${stats.modelMappings.total > 0 ? (s.count / stats.modelMappings.total) * 100 : 0}%` }}
                        />
                      </div>
                      <span className="text-gray-500 w-14 text-right">{s.count.toLocaleString()}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* ── NPC Pools ── */}
          <h2 className="text-lg font-semibold mb-3">NPC / Monster Pools</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <StatCard label="Total Pools" value={stats.npcPools.total} />
            <StatCard label="Monster Models" value={stats.npcPools.monsters} sub="Self-contained DATs" />
            <StatCard label="Humanoid NPCs" value={stats.npcPools.humanoids} sub="Use character skeleton" />
            <StatCard label="Model Families" value={stats.npcPools.families} />
          </div>

          {/* ── Characters ── */}
          <h2 className="text-lg font-semibold mb-3">Characters</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
            <div className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-3">
              <CoverageBar label="With Race Data" value={stats.characters.withRace} total={stats.characters.total} color="bg-violet-600" />
            </div>
            <StatCard label="Tracked Servers" value={stats.servers.total} />
          </div>

          {/* ── Economy ── */}
          <h2 className="text-lg font-semibold mb-3">Economy Data</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <StatCard label="AH Transactions" value={stats.economy.totalAhSales} />
            <StatCard label="Bazaar Listings (Total)" value={stats.economy.totalBazaarListings} />
            <StatCard label="Bazaar Listings (Active)" value={stats.economy.activeBazaarListings} />
            <StatCard label="Bazaar Presences (Active)" value={stats.economy.activeBazaarPresences} />
          </div>

          {/* ── Categories breakdown ── */}
          <h2 className="text-lg font-semibold mb-3">Item Categories</h2>
          <div className="rounded-lg border border-gray-800 bg-gray-900 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-800/50 text-left text-gray-500">
                  <th className="px-4 py-2.5 font-medium">Category</th>
                  <th className="px-4 py-2.5 font-medium text-right">Items</th>
                  <th className="px-4 py-2.5 font-medium">Distribution</th>
                </tr>
              </thead>
              <tbody>
                {stats.items.categories.map((c) => {
                  const pct = stats.items.total > 0 ? (c.count / stats.items.total) * 100 : 0
                  return (
                    <tr key={c.category} className="border-t border-gray-800">
                      <td className="px-4 py-2 text-gray-300">{c.category}</td>
                      <td className="px-4 py-2 text-gray-400 text-right">{c.count.toLocaleString()}</td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 rounded-full bg-gray-800 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-blue-600"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-500 w-10 text-right">{pct.toFixed(1)}%</span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
