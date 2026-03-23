import { useState, useEffect, useRef, useCallback } from 'react'
import { useFfxiFileSystem } from '../context/FfxiFileSystemContext'
import { parseDatFile, FileTableResolver } from '../lib/ffxi-dat'
import type { ParsedMesh, ParsedTexture } from '../lib/ffxi-dat'
import ThreeModelViewer from '../components/character/ThreeModelViewer'
import { api } from '../api/client'
import { Search, ChevronDown, ChevronUp, X } from 'lucide-react'

interface NpcEntry {
  poolId: number
  name: string
  familyId: number
  modelId: number
  isMonster: boolean
  modelData: string
}

interface NpcSearchResult {
  totalCount: number
  page: number
  pageSize: number
  items: NpcEntry[]
}

export default function NpcBrowserPage() {
  const ffxi = useFfxiFileSystem()
  const [query, setQuery] = useState('')
  const [monstersOnly, setMonstersOnly] = useState(true)
  const [results, setResults] = useState<NpcEntry[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<NpcEntry | null>(null)
  const [meshData, setMeshData] = useState<{ meshes: ParsedMesh[]; textures: ParsedTexture[] } | null>(null)
  const [modelLoading, setModelLoading] = useState(false)
  const [viewMode, setViewMode] = useState<'3d' | 'wireframe'>('3d')
  const [lighting, setLighting] = useState<'standard' | 'enhanced'>('standard')
  const [parseLog, setParseLog] = useState<string[]>([])
  const [resolver, setResolver] = useState<FileTableResolver | null>(null)
  const [resolverError, setResolverError] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [logOpen, setLogOpen] = useState(true)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const pageSize = 50

  const log = (msg: string) => setParseLog(prev => [...prev, msg])

  // Load FileTableResolver once when authorized
  useEffect(() => {
    if (!ffxi.isAuthorized) return
    FileTableResolver.fromDirectory(ffxi.readFile)
      .then(r => {
        setResolver(r)
        setResolverError('')
      })
      .catch(() => setResolverError('Failed to load VTABLE/FTABLE from FFXI installation.'))
  }, [ffxi.isAuthorized, ffxi.readFile])

  // Search NPCs from API
  const search = useCallback(async (p: number) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (query) params.set('q', query)
      if (monstersOnly) params.set('monsters', 'true')
      params.set('page', String(p))
      params.set('pageSize', String(pageSize))
      const data = await api<NpcSearchResult>(`/api/npcs?${params}`)
      setResults(data.items)
      setTotalCount(data.totalCount)
      setPage(p)
    } catch {
      setResults([])
      setTotalCount(0)
    } finally {
      setLoading(false)
    }
  }, [query, monstersOnly])

  // Initial load
  useEffect(() => { search(1) }, [search])

  // Focus search when picker opens
  useEffect(() => {
    if (pickerOpen) searchRef.current?.focus()
  }, [pickerOpen])

  // Load NPC model DAT
  const loadModel = async (npc: NpcEntry) => {
    setSelected(npc)
    setPickerOpen(false)
    setMeshData(null)
    setParseLog([])
    setLogOpen(true)
    setModelLoading(true)

    try {
      log(`NPC: ${npc.name} (Pool ${npc.poolId}, Family ${npc.familyId})`)
      log(`ModelData: ${npc.modelData}`)
      log(`IsMonster: ${npc.isMonster}, ModelId (slot1): ${npc.modelId}`)

      if (!resolver) {
        log('ERROR: FileTableResolver not loaded — configure your FFXI installation first.')
        return
      }

      log(`VTABLE/FTABLE loaded (${resolver.fileCount} entries)`)

      const romPath = resolver.resolveFileId(npc.modelId)
      if (!romPath) {
        log(`VTABLE lookup failed: file ID ${npc.modelId} not found (VTABLE returned 0 or out of range)`)
        log('This model ID may not have a corresponding DAT in your installation.')
        return
      }

      log(`Resolved: file ID ${npc.modelId} → ${romPath}`)

      let buffer: ArrayBuffer
      try {
        buffer = await ffxi.readFile(romPath)
      } catch (readErr) {
        log(`File read failed: ${romPath} — ${readErr instanceof Error ? readErr.message : String(readErr)}`)
        return
      }
      log(`Read ${buffer.byteLength} bytes from ${romPath}`)

      if (buffer.byteLength < 16) {
        log(`File too small (${buffer.byteLength} bytes) — not a valid DAT`)
        return
      }

      const dat = parseDatFile(buffer)

      log(`Textures: ${dat.textures.length}`)
      dat.textures.forEach((t, i) => log(`  [${i}] ${t.width}x${t.height}`))
      log(`Meshes: ${dat.meshes.length}`)
      dat.meshes.forEach((m, i) => {
        const vertCount = m.vertices.length / 3
        log(`  [${i}] ${vertCount} verts, material=${m.materialIndex}`)
      })
      if (dat.skeleton) log(`Skeleton: ${dat.skeleton.bones.length} bones (embedded)`)

      if (dat.meshes.length > 0) {
        setMeshData({ meshes: dat.meshes, textures: dat.textures })
        log('Rendering complete.')
      } else {
        log('No meshes found in this DAT — may not be a 3D model file.')
      }
    } catch (err) {
      log(`ERROR: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setModelLoading(false)
    }
  }

  // Wireframe renderer
  useEffect(() => {
    if (viewMode !== 'wireframe' || !meshData || !canvasRef.current) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const w = canvas.width, h = canvas.height
    ctx.fillStyle = '#111'
    ctx.fillRect(0, 0, w, h)

    const allVerts: Array<{ x: number; y: number }> = []
    for (const mesh of meshData.meshes) {
      for (let i = 0; i < mesh.vertices.length; i += 3) {
        allVerts.push({ x: mesh.vertices[i], y: mesh.vertices[i + 1] })
      }
    }
    if (allVerts.length === 0) return

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const v of allVerts) {
      if (v.x < minX) minX = v.x; if (v.x > maxX) maxX = v.x
      if (v.y < minY) minY = v.y; if (v.y > maxY) maxY = v.y
    }

    const rangeX = maxX - minX || 1, rangeY = maxY - minY || 1
    const scale = Math.min((w - 40) / rangeX, (h - 40) / rangeY)
    const cx = w / 2, cy = h / 2
    const midX = (minX + maxX) / 2, midY = (minY + maxY) / 2
    const project = (x: number, y: number) => ({ px: cx + (x - midX) * scale, py: cy - (y - midY) * scale })

    ctx.strokeStyle = '#4a9'
    ctx.lineWidth = 0.5
    for (const mesh of meshData.meshes) {
      const vt = mesh.vertices
      for (let i = 0; i < vt.length; i += 9) {
        const a = project(vt[i], vt[i + 1])
        const b = project(vt[i + 3], vt[i + 4])
        const c = project(vt[i + 6], vt[i + 7])
        ctx.beginPath(); ctx.moveTo(a.px, a.py); ctx.lineTo(b.px, b.py); ctx.lineTo(c.px, c.py); ctx.closePath(); ctx.stroke()
      }
    }

    ctx.fillStyle = '#888'; ctx.font = '11px monospace'
    const totalVerts = meshData.meshes.reduce((s, m) => s + m.vertices.length / 3, 0)
    ctx.fillText(`${totalVerts} verts, ${Math.floor(totalVerts / 3)} tris`, 8, h - 8)
  }, [meshData, viewMode])

  const totalPages = Math.ceil(totalCount / pageSize)

  // Not configured states — centered in the full-bleed area
  if (!ffxi.isSupported) {
    return (
      <div className="-m-6 lg:-m-8 -mb-16 flex items-center justify-center h-[calc(100vh-4rem)]">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">NPC / Monster Models</h1>
          <p className="text-gray-400">This feature requires a Chromium-based browser (Chrome, Edge, Brave).</p>
        </div>
      </div>
    )
  }

  if (!ffxi.isConfigured) {
    return (
      <div className="-m-6 lg:-m-8 -mb-16 flex items-center justify-center h-[calc(100vh-4rem)]">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">NPC / Monster Models</h1>
          <p className="text-gray-400 mb-4">Configure your FFXI installation directory to view 3D models.</p>
          <button onClick={ffxi.configure} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm">
            Select FFXI Directory
          </button>
        </div>
      </div>
    )
  }

  if (!ffxi.isAuthorized) {
    return (
      <div className="-m-6 lg:-m-8 -mb-16 flex items-center justify-center h-[calc(100vh-4rem)]">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">NPC / Monster Models</h1>
          <p className="text-gray-400 mb-4">Re-authorize access to your FFXI installation directory.</p>
          <button onClick={ffxi.authorize} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm">
            Authorize Access
          </button>
        </div>
      </div>
    )
  }

  return (
    // Break out of Layout padding to fill the full content area
    <div className="-m-6 lg:-m-8 -mb-16 h-[calc(100vh-4rem)] lg:h-screen flex flex-col overflow-hidden">
      {/* Full-bleed viewport */}
      <div className="flex-1 relative bg-gray-950 overflow-hidden">
        {/* ── Model viewport (fills entire area) ── */}
        {modelLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-950/80 z-20">
            <p className="text-sm text-gray-400 animate-pulse">Loading model...</p>
          </div>
        )}

        {!selected && !meshData && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-0">
            <p className="text-gray-500 text-sm mb-2">Select an NPC to view its 3D model</p>
            <button
              onClick={() => setPickerOpen(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm text-white"
            >
              Browse NPCs
            </button>
          </div>
        )}

        {meshData && viewMode === '3d' && (
          <ThreeModelViewer meshData={meshData} lighting={lighting} />
        )}

        {meshData && viewMode === 'wireframe' && (
          <canvas
            ref={canvasRef}
            width={1200}
            height={900}
            className="w-full h-full object-contain"
          />
        )}

        {/* ── Top-left: NPC selector trigger ── */}
        <div className="absolute top-3 left-3 z-30">
          <button
            onClick={() => setPickerOpen(!pickerOpen)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-900/90 backdrop-blur border border-gray-700/50 text-sm text-gray-200 hover:bg-gray-800/90 transition-colors shadow-lg"
          >
            <Search className="h-3.5 w-3.5 text-gray-400" />
            <span className="max-w-[200px] truncate">
              {selected ? selected.name : 'Select NPC...'}
            </span>
            {pickerOpen ? <ChevronUp className="h-3.5 w-3.5 text-gray-500" /> : <ChevronDown className="h-3.5 w-3.5 text-gray-500" />}
          </button>

          {/* ── Dropdown picker panel ── */}
          {pickerOpen && (
            <div className="absolute top-full left-0 mt-1 w-80 rounded-lg bg-gray-900/95 backdrop-blur border border-gray-700/50 shadow-2xl overflow-hidden">
              {/* Search input */}
              <div className="p-2 border-b border-gray-800">
                <div className="flex gap-1.5">
                  <input
                    ref={searchRef}
                    type="text"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && search(1)}
                    placeholder="Search NPCs..."
                    className="flex-1 px-2.5 py-1.5 text-sm rounded bg-gray-800 border border-gray-700 text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-600"
                  />
                  <button
                    onClick={() => setPickerOpen(false)}
                    className="p-1.5 rounded text-gray-500 hover:text-gray-300 hover:bg-gray-800"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex items-center justify-between mt-1.5 px-0.5">
                  <label className="flex items-center gap-1.5 text-[11px] text-gray-500">
                    <input
                      type="checkbox"
                      checked={monstersOnly}
                      onChange={e => setMonstersOnly(e.target.checked)}
                      className="rounded"
                    />
                    Monsters only
                  </label>
                  <span className="text-[11px] text-gray-600">{totalCount.toLocaleString()} results</span>
                </div>
              </div>

              {/* Results list */}
              <div className="max-h-72 overflow-y-auto">
                {loading && <p className="p-3 text-xs text-gray-400">Loading...</p>}
                {!loading && results.length === 0 && (
                  <p className="p-3 text-xs text-gray-500">No NPCs found. Run Game Data sync first.</p>
                )}
                {results.map(npc => (
                  <button
                    key={npc.poolId}
                    onClick={() => loadModel(npc)}
                    className={`w-full text-left px-3 py-2 text-sm border-b border-gray-800/30 transition-colors ${
                      selected?.poolId === npc.poolId
                        ? 'bg-blue-900/40 text-white'
                        : 'text-gray-300 hover:bg-gray-800/60'
                    }`}
                  >
                    <span className="block truncate text-[13px]">{npc.name}</span>
                    <span className="text-[10px] text-gray-500">
                      Family {npc.familyId} · Model {npc.modelId}
                      {!npc.isMonster && ' · Humanoid'}
                    </span>
                  </button>
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-3 py-2 border-t border-gray-800 text-[11px]">
                  <button
                    onClick={() => search(page - 1)}
                    disabled={page <= 1}
                    className="px-2 py-0.5 rounded bg-gray-800 hover:bg-gray-700 disabled:opacity-30 text-gray-400"
                  >
                    Prev
                  </button>
                  <span className="text-gray-500">{page} / {totalPages}</span>
                  <button
                    onClick={() => search(page + 1)}
                    disabled={page >= totalPages}
                    className="px-2 py-0.5 rounded bg-gray-800 hover:bg-gray-700 disabled:opacity-30 text-gray-400"
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Top-right: view controls ── */}
        <div className="absolute top-3 right-3 z-30 flex items-center gap-1.5">
          <div className="flex gap-0.5 rounded-lg bg-gray-900/90 backdrop-blur border border-gray-700/50 p-0.5 shadow-lg">
            <button
              onClick={() => setViewMode('3d')}
              className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                viewMode === '3d' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              3D
            </button>
            <button
              onClick={() => setViewMode('wireframe')}
              className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                viewMode === 'wireframe' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              Wireframe
            </button>
          </div>
          <button
            onClick={() => setLighting(l => l === 'standard' ? 'enhanced' : 'standard')}
            className={`px-2.5 py-1 text-xs rounded-lg border shadow-lg backdrop-blur transition-colors ${
              lighting === 'enhanced'
                ? 'bg-amber-600/90 border-amber-500/50 text-white'
                : 'bg-gray-900/90 border-gray-700/50 text-gray-400 hover:text-gray-200'
            }`}
          >
            Lighting
          </button>
        </div>

        {/* ── Bottom-left: model name badge ── */}
        {selected && (
          <div className="absolute bottom-3 left-3 z-30 px-3 py-1.5 rounded-lg bg-gray-900/90 backdrop-blur border border-gray-700/50 shadow-lg">
            <p className="text-sm font-medium text-gray-200">{selected.name}</p>
            <p className="text-[10px] text-gray-500">
              Pool {selected.poolId} · Family {selected.familyId} · Model {selected.modelId}
            </p>
          </div>
        )}

        {/* ── Bottom-right: parse log toggle ── */}
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

        {/* ── Error banner ── */}
        {resolverError && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 px-4 py-2 rounded-lg bg-red-900/80 backdrop-blur border border-red-800/50 text-red-300 text-sm shadow-lg">
            {resolverError}
          </div>
        )}
      </div>
    </div>
  )
}
