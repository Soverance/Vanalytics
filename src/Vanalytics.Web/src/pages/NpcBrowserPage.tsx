import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useFfxiFileSystem } from '../context/FfxiFileSystemContext'
import { parseDatFile } from '../lib/ffxi-dat'
import type { ParsedMesh, ParsedTexture, ParsedSkeleton, ParsedAnimation } from '../lib/ffxi-dat'
import ThreeModelViewer from '../components/character/ThreeModelViewer'
import { Search, X, Shuffle, ChevronRight, Clock, Play, Pause } from 'lucide-react'

interface NpcModel {
  name: string
  category: string
  path: string
}

const MAX_RECENT = 8

export default function NpcBrowserPage() {
  const ffxi = useFfxiFileSystem()
  const [allModels, setAllModels] = useState<NpcModel[]>([])
  const [query, setQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [selected, setSelected] = useState<NpcModel | null>(null)
  const [meshData, setMeshData] = useState<{ meshes: ParsedMesh[]; textures: ParsedTexture[] } | null>(null)
  const [npcSkeleton, setNpcSkeleton] = useState<ParsedSkeleton | null>(null)
  const [npcAnimations, setNpcAnimations] = useState<ParsedAnimation[]>([])
  const [animPlaying, setAnimPlaying] = useState(true)
  const [animSpeed, setAnimSpeed] = useState(1.0)
  const [motionCount, setMotionCount] = useState(0)
  const [motionIndex, setMotionIndex] = useState(0)
  const [modelLoading, setModelLoading] = useState(false)
  const [viewMode, setViewMode] = useState<'3d' | 'wireframe'>('3d')
  const [parseLog, setParseLog] = useState<string[]>([])
  const [browserOpen, setBrowserOpen] = useState(false)
  const [logOpen, setLogOpen] = useState(true)
  const [recent, setRecent] = useState<NpcModel[]>([])
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const log = (msg: string) => setParseLog(prev => [...prev, msg])

  // Load static NPC model data
  useEffect(() => {
    fetch('/data/npc-model-paths.json')
      .then(r => r.json())
      .then((data: NpcModel[]) => setAllModels(data))
      .catch(() => setAllModels([]))
  }, [])

  // Derive categories with counts
  const categoryStats = useMemo(() => {
    const counts = new Map<string, number>()
    for (const m of allModels) counts.set(m.category, (counts.get(m.category) ?? 0) + 1)
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [allModels])

  // Filter models
  const filtered = useMemo(() => {
    let list = allModels
    if (selectedCategory) list = list.filter(m => m.category === selectedCategory)
    if (query) {
      const q = query.toLowerCase()
      list = list.filter(m => m.name.toLowerCase().includes(q))
    }
    return list
  }, [allModels, query, selectedCategory])

  // Focus search when browser opens
  useEffect(() => {
    if (browserOpen) searchRef.current?.focus()
  }, [browserOpen])

  // Load NPC model
  const loadModel = useCallback(async (npc: NpcModel) => {
    setSelected(npc)
    setBrowserOpen(false)
    setMeshData(null)
    setNpcSkeleton(null)
    setNpcAnimations([])
    setMotionIndex(0)
    setParseLog([])
    setLogOpen(true)
    setModelLoading(true)

    // Add to recent (dedupe by path)
    setRecent(prev => {
      const filtered = prev.filter(r => r.path !== npc.path)
      return [npc, ...filtered].slice(0, MAX_RECENT)
    })

    try {
      log(`NPC: ${npc.name} (${npc.category})`)
      log(`DAT: ${npc.path}`)

      let buffer: ArrayBuffer
      try {
        buffer = await ffxi.readFile(npc.path)
      } catch (readErr) {
        log(`File read failed: ${npc.path} — ${readErr instanceof Error ? readErr.message : String(readErr)}`)
        return
      }
      log(`Read ${buffer.byteLength} bytes`)

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

      // Parse embedded animations
      let anims: ParsedAnimation[] = []
      if (dat.animations.length > 0) {
        anims = dat.animations
        log(`Animations: ${anims.length} blocks (0x2B)`)
      }

      if (dat.meshes.length > 0) {
        setMeshData({ meshes: dat.meshes, textures: dat.textures })
        setNpcSkeleton(dat.skeleton)
        setNpcAnimations(anims)
        setMotionIndex(0)
        log('Rendering complete.')
      } else {
        setNpcSkeleton(null)
        setNpcAnimations([])
        log('No meshes found in this DAT — may not be a 3D model file.')
      }
    } catch (err) {
      log(`ERROR: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setModelLoading(false)
    }
  }, [ffxi.readFile])

  // Random model
  const loadRandom = useCallback(() => {
    if (allModels.length === 0) return
    const pool = selectedCategory ? allModels.filter(m => m.category === selectedCategory) : allModels
    if (pool.length === 0) return
    const pick = pool[Math.floor(Math.random() * pool.length)]
    loadModel(pick)
  }, [allModels, selectedCategory, loadModel])

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

  // ── Not configured states ──
  if (!ffxi.isSupported) {
    return (
      <div className="fixed inset-0 lg:left-64 z-10 bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">NPC / Monster Models</h1>
          <p className="text-gray-400">This feature requires a Chromium-based browser (Chrome, Edge, Brave).</p>
        </div>
      </div>
    )
  }

  if (!ffxi.isConfigured) {
    return (
      <div className="fixed inset-0 lg:left-64 z-10 bg-gray-950 flex items-center justify-center">
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
      <div className="fixed inset-0 lg:left-64 z-10 bg-gray-950 flex items-center justify-center">
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
    // Fixed positioning: fills viewport to the right of the sidebar
    <div className="fixed inset-0 lg:left-64 z-10 bg-gray-950 overflow-hidden">
      {/* ── 3D Viewport (fills entire area) ── */}
      <div className="absolute inset-0">
        {modelLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-950/80 z-20">
            <p className="text-sm text-gray-400 animate-pulse">Loading model...</p>
          </div>
        )}

        {!selected && !meshData && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-0">
            <p className="text-gray-500 mb-3">Explore 3D models from Final Fantasy XI</p>
            <div className="flex gap-2">
              <button
                onClick={() => setBrowserOpen(true)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm text-white"
              >
                Browse Models ({allModels.length.toLocaleString()})
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

        {meshData && viewMode === '3d' && (
          <ThreeModelViewer
            meshData={meshData}
            skeleton={npcSkeleton}
            animations={npcAnimations}
            playing={animPlaying}
            speed={animSpeed}
            motionIndex={motionIndex}
            onMotionCount={setMotionCount}
          />
        )}

        {meshData && viewMode === 'wireframe' && (
          <canvas ref={canvasRef} width={1200} height={900} className="w-full h-full object-contain" />
        )}
      </div>

      {/* ── Top-left: Browse button + recent strip ── */}
      <div className="absolute top-3 left-3 z-30 flex items-center gap-2">
        <button
          onClick={() => setBrowserOpen(true)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-900/90 backdrop-blur border border-gray-700/50 text-sm text-gray-200 hover:bg-gray-800/90 transition-colors shadow-lg"
        >
          <Search className="h-3.5 w-3.5 text-gray-400" />
          <span className="max-w-[180px] truncate">
            {selected ? selected.name : 'Browse Models...'}
          </span>
        </button>

        <button
          onClick={loadRandom}
          title="Load a random model"
          className="p-2 rounded-lg bg-gray-900/90 backdrop-blur border border-gray-700/50 text-gray-400 hover:text-gray-200 hover:bg-gray-800/90 transition-colors shadow-lg"
        >
          <Shuffle className="h-3.5 w-3.5" />
        </button>

        {/* Recent models strip */}
        {recent.length > 0 && (
          <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-gray-900/90 backdrop-blur border border-gray-700/50 shadow-lg">
            <Clock className="h-3 w-3 text-gray-600 shrink-0" />
            {recent.map((r, i) => (
              <button
                key={`${r.path}-${i}`}
                onClick={() => loadModel(r)}
                title={r.name}
                className={`px-1.5 py-0.5 text-[11px] rounded transition-colors max-w-[80px] truncate ${
                  selected?.path === r.path
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
      </div>

      {/* ── Bottom-left: model info ── */}
      {selected && (
        <div className="absolute bottom-3 left-3 z-30 px-3 py-1.5 rounded-lg bg-gray-900/90 backdrop-blur border border-gray-700/50 shadow-lg">
          <p className="text-sm font-medium text-gray-200">{selected.name}</p>
          <p className="text-[10px] text-gray-500">{selected.category} · {selected.path}</p>
        </div>
      )}

      {/* ── Bottom-center: animation controls ── */}
      {npcAnimations.length > 0 && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-900/90 backdrop-blur border border-gray-700/50 shadow-lg">
          <button
            onClick={() => setAnimPlaying(p => !p)}
            className="p-1 text-gray-400 hover:text-gray-200"
            title={animPlaying ? 'Pause' : 'Play'}
          >
            {animPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
          {motionCount > 1 && (
            <select
              value={motionIndex}
              onChange={e => setMotionIndex(Number(e.target.value))}
              className="bg-gray-800 border border-gray-600 rounded px-2 py-0.5 text-xs text-gray-300"
            >
              {Array.from({ length: motionCount }, (_, i) => (
                <option key={i} value={i}>Motion {i + 1}</option>
              ))}
            </select>
          )}
          <select
            value={animSpeed}
            onChange={e => setAnimSpeed(Number(e.target.value))}
            className="bg-gray-800 border border-gray-600 rounded px-1 py-0.5 text-xs text-gray-300"
          >
            {[0.25, 0.5, 1.0, 1.5, 2.0].map(s => (
              <option key={s} value={s}>{s}x</option>
            ))}
          </select>
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
            {/* Left: categories */}
            <div className="w-48 shrink-0 border-r border-gray-800 flex flex-col bg-gray-900/50">
              <div className="p-3 border-b border-gray-800">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Categories</p>
              </div>
              <div className="flex-1 overflow-y-auto py-1">
                <button
                  onClick={() => { setSelectedCategory(null); setQuery('') }}
                  className={`w-full text-left px-3 py-1.5 text-sm flex items-center justify-between transition-colors ${
                    !selectedCategory ? 'bg-blue-900/30 text-blue-300' : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-200'
                  }`}
                >
                  <span>All Models</span>
                  <span className="text-[11px] text-gray-600">{allModels.length}</span>
                </button>
                {categoryStats.map(cat => (
                  <button
                    key={cat.name}
                    onClick={() => { setSelectedCategory(cat.name); setQuery('') }}
                    className={`w-full text-left px-3 py-1.5 text-sm flex items-center justify-between transition-colors ${
                      selectedCategory === cat.name
                        ? 'bg-blue-900/30 text-blue-300'
                        : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-200'
                    }`}
                  >
                    <span className="truncate mr-2">{cat.name}</span>
                    <span className="text-[11px] text-gray-600 shrink-0">{cat.count}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Right: search + models */}
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
                    placeholder={selectedCategory ? `Search ${selectedCategory}...` : 'Search all models...'}
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
                  title="Load a random model"
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
                        key={`${r.path}-${i}`}
                        onClick={() => loadModel(r)}
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
                {filtered.length.toLocaleString()} models
                {selectedCategory && <span> in {selectedCategory}</span>}
                {query && <span> matching "{query}"</span>}
              </div>

              {/* Model list */}
              <div className="flex-1 overflow-y-auto">
                {filtered.length === 0 && (
                  <div className="p-6 text-center text-sm text-gray-500">
                    No models found. Try a different search or category.
                  </div>
                )}
                {filtered.slice(0, 300).map((npc, idx) => (
                  <button
                    key={`${npc.path}-${idx}`}
                    onClick={() => loadModel(npc)}
                    className={`w-full text-left px-3 py-2 flex items-center gap-3 border-b border-gray-800/30 transition-colors group ${
                      selected?.path === npc.path && selected?.name === npc.name
                        ? 'bg-blue-900/30'
                        : 'hover:bg-gray-800/40'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm truncate ${
                        selected?.path === npc.path && selected?.name === npc.name
                          ? 'text-blue-300' : 'text-gray-200'
                      }`}>
                        {npc.name}
                      </p>
                      <p className="text-[11px] text-gray-600 truncate">{npc.path}</p>
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
