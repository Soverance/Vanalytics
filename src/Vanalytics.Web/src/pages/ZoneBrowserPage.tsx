import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useFfxiFileSystem } from '../context/FfxiFileSystemContext'
import { parseZoneFile } from '../lib/ffxi-dat'
import type { ParsedZone } from '../lib/ffxi-dat'
import type { ParsedTexture } from '../lib/ffxi-dat/types'
import ThreeZoneViewer from '../components/zone/ThreeZoneViewer'
import MinimapOverlay from '../components/zone/MinimapOverlay'
import { parseMinimapDat } from '../lib/ffxi-dat/MinimapParser'
import { parseSpawnDat } from '../lib/ffxi-dat/SpawnParser'
import type { SpawnPoint } from '../lib/ffxi-dat/SpawnParser'
import { Search, X, Shuffle, ChevronRight, Clock, Users } from 'lucide-react'

interface ZoneEntry {
  id: number
  name: string
  modelPath: string | null
  npcPath: string | null
  mapPaths: string | null
  expansion: string | null
  region: string | null
  isDiscovered: boolean
}

const MAX_RECENT = 8

export default function ZoneBrowserPage() {
  const ffxi = useFfxiFileSystem()
  const [allZones, setAllZones] = useState<ZoneEntry[]>([])
  const [query, setQuery] = useState('')
  const [selectedExpansion, setSelectedExpansion] = useState<string | null>(null)
  const [selected, setSelected] = useState<ZoneEntry | null>(null)
  const [zoneData, setZoneData] = useState<ParsedZone | null>(null)
  const [cameraMode, setCameraMode] = useState<'orbit' | 'fly'>('orbit')
  const [fogDensity, setFogDensity] = useState(0)  // 0=off, 0.5=default, 1=thick
  const [flySpeed, setFlySpeed] = useState<number | null>(null)
  const [minimapTextures, setMinimapTextures] = useState<ParsedTexture[]>([])
  const [showSpawns, setShowSpawns] = useState(false)
  const [spawnPoints, setSpawnPoints] = useState<SpawnPoint[]>([])
  const [loading, setLoading] = useState(false)
  const [parseLog, setParseLog] = useState<string[]>([])
  const [browserOpen, setBrowserOpen] = useState(false)
  const [logOpen, setLogOpen] = useState(true)
  const [recent, setRecent] = useState<ZoneEntry[]>([])
  const searchRef = useRef<HTMLInputElement>(null)

  const log = (msg: string) => setParseLog(prev => [...prev, msg])

  // Load zones from API
  useEffect(() => {
    fetch('/api/zones')
      .then(r => r.json())
      .then((data: ZoneEntry[]) => setAllZones(data))
      .catch(() => setAllZones([]))
  }, [])

  // Dynamic expansion list in canonical FFXI release order
  const expansions = useMemo(() => {
    const expSet = new Set(allZones.filter(z => z.expansion).map(z => z.expansion!))
    const order = [
      'Original', 'Rise of the Zilart', 'Chains of Promathia',
      'Treasures of Aht Urhgan', 'Wings of the Goddess',
      'Seekers of Adoulin'
    ]
    return order.filter(e => expSet.has(e))
      .concat([...expSet].filter(e => !order.includes(e)).sort())
  }, [allZones])

  // Derive expansion stats with counts
  const expansionStats = useMemo(() => {
    const counts = new Map<string, number>()
    for (const z of allZones) {
      const exp = z.expansion ?? 'Unknown'
      counts.set(exp, (counts.get(exp) ?? 0) + 1)
    }
    return expansions.map(name => ({ name, count: counts.get(name) ?? 0 }))
  }, [allZones, expansions])

  // Filter zones
  const filtered = useMemo(() => {
    let list = allZones
    if (selectedExpansion) list = list.filter(z => (z.expansion ?? 'Unknown') === selectedExpansion)
    if (query) {
      const q = query.toLowerCase()
      list = list.filter(z => z.name.toLowerCase().includes(q))
    }
    return list
  }, [allZones, query, selectedExpansion])

  // Focus search when browser opens
  useEffect(() => {
    if (browserOpen) searchRef.current?.focus()
  }, [browserOpen])

  // Load zone
  const loadZone = useCallback(async (zone: ZoneEntry) => {
    setSelected(zone)
    setBrowserOpen(false)
    setZoneData(null)
    setMinimapTextures([])
    setSpawnPoints([])
    setShowSpawns(false)
    setParseLog([])
    setLogOpen(true)
    setLoading(true)

    setRecent(prev => {
      const filtered = prev.filter(r => r.id !== zone.id)
      return [zone, ...filtered].slice(0, MAX_RECENT)
    })

    try {
      log(`Zone: ${zone.name} (${zone.expansion ?? 'Unknown'})`)
      log(`DAT: ${zone.modelPath ?? 'N/A'}`)

      if (!zone.modelPath) {
        log('No model path available for this zone.')
        setLoading(false)
        return
      }

      let buffer: ArrayBuffer
      try {
        buffer = await ffxi.readFile(zone.modelPath!)
      } catch (readErr) {
        log(`File read failed: ${zone.modelPath} — ${readErr instanceof Error ? readErr.message : String(readErr)}`)
        return
      }
      log(`Read ${buffer.byteLength} bytes`)

      const parsed = parseZoneFile(buffer, log)
      log(`Prefabs: ${parsed.prefabs.length}, Instances: ${parsed.instances.length}, Textures: ${parsed.textures.length}`)

      if (parsed.prefabs.length > 0) {
        setZoneData(parsed)
        log('Rendering complete.')
      } else {
        log('No zone meshes found in this DAT.')
      }

      const mapTextures: ParsedTexture[] = []
      if (zone.mapPaths) {
        const mapDatPaths = zone.mapPaths.split(';').filter(Boolean)
        for (const mapPath of mapDatPaths) {
          try {
            const mapBuffer = await ffxi.readFile(mapPath)
            if (mapBuffer) {
              const tex = parseMinimapDat(mapBuffer)
              if (tex) mapTextures.push(tex)
            }
          } catch { /* skip */ }
        }
      }
      setMinimapTextures(mapTextures)
    } catch (err) {
      log(`ERROR: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setLoading(false)
    }
  }, [ffxi.readFile])

  // Random zone (prefer zones with a modelPath)
  const loadRandom = useCallback(() => {
    if (allZones.length === 0) return
    let pool = selectedExpansion
      ? allZones.filter(z => (z.expansion ?? 'Unknown') === selectedExpansion)
      : allZones
    const withModels = pool.filter(z => z.modelPath !== null)
    if (withModels.length > 0) pool = withModels
    if (pool.length === 0) return
    const pick = pool[Math.floor(Math.random() * pool.length)]
    loadZone(pick)
  }, [allZones, selectedExpansion, loadZone])

  // Toggle spawn markers — load from npcPath on first enable
  const handleToggleSpawns = useCallback(async () => {
    if (!showSpawns && spawnPoints.length === 0 && selected?.npcPath) {
      try {
        const buffer = await ffxi.readFile(selected.npcPath)
        setSpawnPoints(parseSpawnDat(buffer))
      } catch { /* npcPath unavailable or unreadable */ }
    }
    setShowSpawns(prev => !prev)
  }, [showSpawns, spawnPoints.length, selected, ffxi])

  // ── Not configured states ──
  if (!ffxi.isSupported) {
    return (
      <div className="fixed inset-0 lg:left-64 z-10 bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Zone Viewer</h1>
          <p className="text-gray-400">This feature requires a Chromium-based browser (Chrome, Edge, Brave).</p>
        </div>
      </div>
    )
  }

  if (!ffxi.isConfigured) {
    return (
      <div className="fixed inset-0 lg:left-64 z-10 bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Zone Viewer</h1>
          <p className="text-gray-400 mb-4">Configure your FFXI installation directory to view 3D zones.</p>
          <button onClick={ffxi.configure} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm">
            Select FFXI Directory
          </button>
        </div>
      </div>
    )
  }

  if (!ffxi.isAuthorized) {
    return (
      <div className="fixed inset-0 lg:left-64 z-10 bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Zone Viewer</h1>
          <p className="text-gray-400 mb-4">Re-authorize access to your FFXI installation directory.</p>
          <button onClick={ffxi.authorize} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm">
            Authorize Access
          </button>
        </div>
      </div>
    )
  }

  return (
    // Fixed positioning: fills viewport to the right of the sidebar
    <div className="fixed inset-0 lg:left-64 z-10 bg-gray-950 overflow-hidden">
      {/* ── 3D Viewport (fills entire area) ── */}
      <div className="absolute inset-0">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-950/80 z-20">
            <p className="text-sm text-gray-400 animate-pulse">Loading zone...</p>
          </div>
        )}

        {!selected && !zoneData && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-0">
            <p className="text-gray-500 mb-3">Explore 3D zone environments from Final Fantasy XI</p>
            <div className="flex gap-2">
              <button
                onClick={() => setBrowserOpen(true)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm text-white"
              >
                Browse Zones ({allZones.length.toLocaleString()})
              </button>
              <button
                onClick={loadRandom}
                className="flex items-center gap-1.5 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded text-sm text-gray-300"
              >
                <Shuffle className="h-3.5 w-3.5" />
                Random
              </button>
            </div>
          </div>
        )}

        {zoneData && (
          <ThreeZoneViewer
            zoneData={zoneData}
            fogDensity={fogDensity}
            onFlySpeedChange={setFlySpeed}
            cameraMode={cameraMode}
            spawnMarkers={spawnPoints}
            showSpawns={showSpawns}
          />
        )}
      </div>

      <MinimapOverlay textures={minimapTextures} />

      {/* ── Top-left: Browse button + recent strip ── */}
      <div className="absolute top-3 left-3 z-30 flex items-center gap-2">
        <button
          onClick={() => setBrowserOpen(true)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-900/90 backdrop-blur border border-gray-700/50 text-sm text-gray-200 hover:bg-gray-800/90 transition-colors shadow-lg"
        >
          <Search className="h-3.5 w-3.5 text-gray-400" />
          <span className="max-w-[180px] truncate">
            {selected ? selected.name : 'Browse Zones...'}
          </span>
        </button>

        <button
          onClick={loadRandom}
          title="Load a random zone"
          className="p-2 rounded-lg bg-gray-900/90 backdrop-blur border border-gray-700/50 text-gray-400 hover:text-gray-200 hover:bg-gray-800/90 transition-colors shadow-lg"
        >
          <Shuffle className="h-3.5 w-3.5" />
        </button>

        {/* Recent zones strip */}
        {recent.length > 0 && (
          <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-gray-900/90 backdrop-blur border border-gray-700/50 shadow-lg">
            <Clock className="h-3 w-3 text-gray-600 shrink-0" />
            {recent.map((r, i) => (
              <button
                key={`${r.id}-${i}`}
                onClick={() => loadZone(r)}
                title={r.name}
                className={`px-1.5 py-0.5 text-[11px] rounded transition-colors max-w-[80px] truncate ${
                  selected?.id === r.id
                    ? 'bg-blue-600/50 text-blue-200'
                    : 'text-gray-500 hover:text-gray-200 hover:bg-gray-800'
                }`}
              >
                {r.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Top-right: camera mode + lighting controls ── */}
      <div className="absolute top-3 right-3 z-30 flex items-center gap-1.5">
        <div className="flex gap-0.5 rounded-lg bg-gray-900/90 backdrop-blur border border-gray-700/50 p-0.5 shadow-lg">
          <button
            onClick={() => setCameraMode('orbit')}
            className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
              cameraMode === 'orbit' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            Orbit
          </button>
          <button
            onClick={() => setCameraMode('fly')}
            className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
              cameraMode === 'fly' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            Fly
          </button>
        </div>
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-gray-900/90 backdrop-blur border border-gray-700/50 shadow-lg">
          <button
            onClick={() => setFogDensity(d => d > 0 ? 0 : 0.5)}
            className={`px-2 py-0.5 text-xs rounded transition-colors ${
              fogDensity > 0
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            Fog
          </button>
          {fogDensity > 0 && (
            <input
              type="range"
              min="0.1"
              max="1"
              step="0.05"
              value={fogDensity}
              onChange={(e) => setFogDensity(parseFloat(e.target.value))}
              className="w-16 h-1 accent-blue-500"
            />
          )}
        </div>
        <button
          onClick={handleToggleSpawns}
          title="Toggle spawn markers"
          className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg border shadow-lg backdrop-blur transition-colors ${
            showSpawns
              ? 'bg-red-600/90 border-red-500/50 text-white'
              : 'bg-gray-900/90 border-gray-700/50 text-gray-400 hover:text-gray-200'
          }`}
        >
          <Users className="h-3 w-3" />
          Spawns
        </button>
        {cameraMode === 'fly' && flySpeed !== null && (
          <div className="px-2.5 py-1 rounded-lg bg-gray-900/90 backdrop-blur border border-gray-700/50 shadow-lg text-xs text-gray-400" title="Scroll wheel to adjust fly speed">
            Speed <span className="font-mono text-gray-200">{flySpeed.toFixed(2)}</span>
          </div>
        )}
      </div>

      {/* ── Bottom-left: zone info ── */}
      {selected && (
        <div className="absolute bottom-3 left-3 z-30 px-3 py-2 rounded-lg bg-gray-900/90 backdrop-blur border border-gray-700/50 shadow-lg">
          <p className="text-sm font-medium text-gray-200">{selected.name}</p>
          <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-0.5">
            {selected.expansion && (
              <span className="text-[10px] text-gray-400">{selected.expansion}</span>
            )}
            {selected.region && (
              <span className="text-[10px] text-gray-500">{selected.region}</span>
            )}
            <span className="text-[10px] text-gray-600">ID {selected.id}</span>
            {selected.mapPaths && (
              <span className="text-[10px] text-blue-500">
                {selected.mapPaths.split(';').length} map floor{selected.mapPaths.split(';').length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          {selected.modelPath && (
            <p className="text-[10px] text-gray-600 mt-0.5 truncate max-w-[320px]">{selected.modelPath}</p>
          )}
        </div>
      )}

      {/* ── Bottom-right: parse log ── */}
      {parseLog.length > 0 && (
        <div className="absolute bottom-3 right-3 z-30">
          {logOpen ? (
            <div className="w-80 rounded-lg bg-gray-900/95 backdrop-blur border border-gray-700/50 shadow-2xl overflow-hidden">
              <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-gray-800">
                <span className="text-[11px] text-gray-500 font-medium">Parse Log</span>
                <button onClick={() => setLogOpen(false)} className="text-gray-500 hover:text-gray-300">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="max-h-40 overflow-y-auto p-2 text-[11px] font-mono text-gray-500 space-y-0.5">
                {parseLog.map((msg, i) => <div key={i}>{msg}</div>)}
              </div>
            </div>
          ) : (
            <button
              onClick={() => setLogOpen(true)}
              className="px-2.5 py-1 text-[11px] rounded-lg bg-gray-900/90 backdrop-blur border border-gray-700/50 text-gray-500 hover:text-gray-300 shadow-lg"
            >
              Log ({parseLog.length})
            </button>
          )}
        </div>
      )}

      {/* ── Full browser overlay ── */}
      {browserOpen && (
        <div className="absolute inset-0 z-40 flex">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60" onClick={() => setBrowserOpen(false)} />

          {/* Browser panel */}
          <div className="relative z-10 flex w-full max-w-3xl m-auto h-[80vh] rounded-xl bg-gray-900 border border-gray-700/50 shadow-2xl overflow-hidden">
            {/* Left: expansions */}
            <div className="w-48 shrink-0 border-r border-gray-800 flex flex-col bg-gray-900/50">
              <div className="p-3 border-b border-gray-800">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Expansion</p>
              </div>
              <div className="flex-1 overflow-y-auto py-1">
                <button
                  onClick={() => { setSelectedExpansion(null); setQuery('') }}
                  className={`w-full text-left px-3 py-1.5 text-sm flex items-center justify-between transition-colors ${
                    !selectedExpansion ? 'bg-blue-900/30 text-blue-300' : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-200'
                  }`}
                >
                  <span>All Zones</span>
                  <span className="text-[11px] text-gray-600">{allZones.length}</span>
                </button>
                {expansionStats.map(exp => (
                  <button
                    key={exp.name}
                    onClick={() => { setSelectedExpansion(exp.name); setQuery('') }}
                    className={`w-full text-left px-3 py-1.5 text-sm flex items-center justify-between transition-colors ${
                      selectedExpansion === exp.name
                        ? 'bg-blue-900/30 text-blue-300'
                        : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-200'
                    }`}
                  >
                    <span className="truncate mr-2">{exp.name}</span>
                    <span className="text-[11px] text-gray-600 shrink-0">{exp.count}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Right: search + zones */}
            <div className="flex-1 flex flex-col min-w-0">
              {/* Header */}
              <div className="p-3 border-b border-gray-800 flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500" />
                  <input
                    ref={searchRef}
                    type="text"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder={selectedExpansion ? `Search ${selectedExpansion}...` : 'Search all zones...'}
                    className="w-full pl-8 pr-8 py-1.5 text-sm rounded-lg bg-gray-800 border border-gray-700 text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-600"
                  />
                  {query && (
                    <button onClick={() => setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <button
                  onClick={loadRandom}
                  title="Load a random zone"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-gray-200 text-sm transition-colors"
                >
                  <Shuffle className="h-3.5 w-3.5" />
                  Random
                </button>
              </div>

              {/* Recent row */}
              {recent.length > 0 && (
                <div className="px-3 py-2 border-b border-gray-800/50 flex items-center gap-2">
                  <Clock className="h-3 w-3 text-gray-600 shrink-0" />
                  <span className="text-[11px] text-gray-600 shrink-0">Recent:</span>
                  <div className="flex gap-1 overflow-x-auto">
                    {recent.map((r, i) => (
                      <button
                        key={`${r.id}-${i}`}
                        onClick={() => loadZone(r)}
                        className="px-2 py-0.5 text-[11px] rounded bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-gray-200 whitespace-nowrap transition-colors"
                      >
                        {r.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Results info */}
              <div className="px-3 py-1.5 text-[11px] text-gray-600 border-b border-gray-800/30">
                {filtered.length.toLocaleString()} zones
                {selectedExpansion && <span> in {selectedExpansion}</span>}
                {query && <span> matching "{query}"</span>}
              </div>

              {/* Zone list */}
              <div className="flex-1 overflow-y-auto">
                {filtered.length === 0 && (
                  <div className="p-6 text-center text-sm text-gray-500">
                    No zones found. Try a different search or expansion.
                  </div>
                )}
                {filtered.slice(0, 300).map((zone, idx) => (
                  <button
                    key={`${zone.id}-${idx}`}
                    onClick={() => loadZone(zone)}
                    className={`w-full text-left px-3 py-2 flex items-center gap-3 border-b border-gray-800/30 transition-colors group ${
                      selected?.id === zone.id
                        ? 'bg-blue-900/30'
                        : 'hover:bg-gray-800/40'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm truncate ${
                        selected?.id === zone.id
                          ? 'text-blue-300' : 'text-gray-200'
                      }`}>
                        {zone.name}
                      </p>
                      <p className="text-[11px] text-gray-600 truncate">
                        {zone.modelPath ?? <span className="text-gray-700 italic">no model</span>}
                      </p>
                    </div>
                    <ChevronRight className="h-3.5 w-3.5 text-gray-700 group-hover:text-gray-500 shrink-0" />
                  </button>
                ))}
                {filtered.length > 300 && (
                  <p className="p-3 text-[11px] text-gray-600 text-center">
                    Showing first 300 of {filtered.length.toLocaleString()} — refine your search
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
