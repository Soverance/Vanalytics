import { useState, useRef, useEffect } from 'react'
import { useFfxiFileSystem } from '../context/FfxiFileSystemContext'
import { parseDatFile, parseSkeletonDat, SKELETON_PATHS, modelToPath } from '../lib/ffxi-dat'
import type { ParsedMesh, ParsedTexture, ParsedSkeleton } from '../lib/ffxi-dat'
import ThreeModelViewer from '../components/character/ThreeModelViewer'

/** Race ID → display name */
const RACE_NAMES: Record<number, string> = {
  1: 'Hume Male', 2: 'Hume Female', 3: 'Elvaan Male', 4: 'Elvaan Female',
  5: 'Tarutaru Male', 6: 'Tarutaru Female', 7: 'Mithra', 8: 'Galka',
}

/** Slot ID → display name */
const SLOT_NAMES: Record<number, string> = {
  2: 'Head', 3: 'Body', 4: 'Hands', 5: 'Legs', 6: 'Feet', 7: 'Main', 8: 'Sub', 9: 'Range',
}

/** Presets defined by model ID + slot (race-independent). ROM path resolved dynamically. */
const PRESETS = [
  { label: 'Colichemarde', slotId: 7, modelId: 181 },
  { label: 'Hauteclaire', slotId: 7, modelId: 399 },
  { label: 'Leather Bandana', slotId: 2, modelId: 1 },
  { label: 'Red Cap', slotId: 2, modelId: 23 },
  { label: 'Koenig Schaller', slotId: 2, modelId: 95 },
  { label: 'Leather Vest', slotId: 3, modelId: 1 },
  { label: 'Koenig Cuirass', slotId: 3, modelId: 95 },
  { label: 'Leather Gloves', slotId: 4, modelId: 2 },
  { label: 'Koenig Handschuhs', slotId: 4, modelId: 95 },
  { label: 'Leather Trousers', slotId: 5, modelId: 1 },
  { label: 'Koenig Diechlings', slotId: 5, modelId: 95 },
  { label: 'Leather Highboots', slotId: 6, modelId: 2 },
  { label: 'Koenig Schuhs', slotId: 6, modelId: 95 },
]

/**
 * Debug page for testing the DAT parser and 3D renderer.
 * Route: /debug/models
 */
export default function ModelDebugPage() {
  const ffxi = useFfxiFileSystem()
  const [romPath, setRomPath] = useState('')
  const [parseLog, setParseLog] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [meshData, setMeshData] = useState<{ meshes: ParsedMesh[]; textures: ParsedTexture[] } | null>(null)
  const [viewMode, setViewMode] = useState<'3d' | 'wireframe'>('3d')
  const [lighting, setLighting] = useState<'standard' | 'enhanced'>('standard')
  const [raceId, setRaceId] = useState(1)
  const [skeleton, setSkeleton] = useState<ParsedSkeleton | null>(null)
  const [skelLoading, setSkelLoading] = useState(false)
  const [resolvedPresets, setResolvedPresets] = useState<Map<string, string>>(new Map())
  const [facePaths, setFacePaths] = useState<Array<{ name: string; path: string }>>([])
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const log = (msg: string) => setParseLog(prev => [...prev, msg])

  // Load skeleton when race changes
  useEffect(() => {
    if (!ffxi.isAuthorized) return
    const skelPath = SKELETON_PATHS[raceId]
    if (!skelPath) return

    setSkelLoading(true)
    ffxi.readFile(skelPath).then(buffer => {
      const skel = parseSkeletonDat(buffer)
      setSkeleton(skel)
      setSkelLoading(false)
    }).catch(() => {
      setSkeleton(null)
      setSkelLoading(false)
    })
  }, [raceId, ffxi.isAuthorized, ffxi.readFile])

  // Resolve preset ROM paths and face paths when race changes
  useEffect(() => {
    async function resolve() {
      const resolved = new Map<string, string>()
      for (const p of PRESETS) {
        const path = await modelToPath(p.modelId, raceId, p.slotId)
        if (path) resolved.set(`${p.slotId}:${p.modelId}`, path)
      }
      setResolvedPresets(resolved)
    }
    resolve()

    fetch('/data/face-paths.json')
      .then(r => r.json())
      .then((data: Record<string, Array<{ name: string; path: string }>>) => {
        setFacePaths(data[String(raceId)] ?? [])
      })
      .catch(() => setFacePaths([]))
  }, [raceId])

  // Set initial ROM path from first resolved preset
  useEffect(() => {
    if (resolvedPresets.size > 0 && !romPath) {
      const firstPath = resolvedPresets.values().next().value
      if (firstPath) setRomPath(firstPath)
    }
  }, [resolvedPresets, romPath])

  const handleLoad = async () => {
    setParseLog([])
    setMeshData(null)
    setLoading(true)

    try {
      log(`Reading ${romPath}...`)
      const buffer = await ffxi.readFile(romPath)
      log(`Read ${buffer.byteLength} bytes`)

      log(`Skeleton: ${skeleton ? skeleton.bones.length + ' bones' : 'none'} (${RACE_NAMES[raceId]})`)

      log('Parsing DAT file...')
      const dat = parseDatFile(buffer, skeleton?.matrices)

      log(`Textures: ${dat.textures.length}`)
      dat.textures.forEach((t, i) => log(`  [${i}] ${t.width}x${t.height} (${t.rgba.length} bytes RGBA)`))

      log(`Meshes: ${dat.meshes.length}`)
      dat.meshes.forEach((m, i) => {
        const vertCount = m.vertices.length / 3
        const triCount = vertCount / 3
        log(`  [${i}] ${vertCount} verts, ${triCount} tris, material=${m.materialIndex}`)
      })

      if (dat.meshes.length > 0) {
        setMeshData({ meshes: dat.meshes, textures: dat.textures })
        log('Parse complete — rendering...')
      } else {
        log('No meshes found in this DAT file.')
      }
    } catch (err) {
      log(`Error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setLoading(false)
    }
  }

  // 2D wireframe canvas renderer
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

    if (meshData.textures.length > 0) {
      const tex = meshData.textures[0]
      const imgData = ctx.createImageData(tex.width, tex.height)
      imgData.data.set(tex.rgba)
      const tc = document.createElement('canvas')
      tc.width = tex.width; tc.height = tex.height
      tc.getContext('2d')!.putImageData(imgData, 0, 0)
      ctx.drawImage(tc, w - tex.width * 2 - 8, 8, tex.width * 2, tex.height * 2)
      ctx.strokeStyle = '#555'
      ctx.strokeRect(w - tex.width * 2 - 8, 8, tex.width * 2, tex.height * 2)
    }

    ctx.fillStyle = '#888'; ctx.font = '11px monospace'
    const totalVerts = meshData.meshes.reduce((s, m) => s + m.vertices.length / 3, 0)
    const totalTris = totalVerts / 3
    ctx.fillText(`${totalVerts} verts, ${totalTris} tris`, 8, h - 8)
  }, [meshData, viewMode])

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">DAT Model Debug Viewer</h1>

      {!ffxi.isSupported && <p className="text-red-400 mb-4">File System Access API not supported (use Chrome/Edge)</p>}
      {ffxi.isSupported && !ffxi.isConfigured && (
        <button onClick={ffxi.configure} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded mb-4">Connect FFXI Installation</button>
      )}
      {ffxi.isSupported && ffxi.isConfigured && !ffxi.isAuthorized && (
        <button onClick={ffxi.authorize} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded mb-4">Authorize File Access</button>
      )}

      {ffxi.isAuthorized && (
        <>
          {/* Race / Skeleton selector */}
          <div className="flex items-center gap-3 mb-4 p-3 bg-gray-800/50 rounded-lg border border-gray-700/50">
            <span className="text-xs text-gray-400">Race:</span>
            <select value={raceId} onChange={e => { setRaceId(Number(e.target.value)); setMeshData(null) }}
              className="px-2 py-1.5 text-sm bg-gray-800 border border-gray-700 rounded text-gray-200">
              {Object.entries(RACE_NAMES).map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </select>
            <span className="text-[11px] text-gray-500">
              {skelLoading ? 'Loading skeleton...' : skeleton ? `${skeleton.bones.length} bones · ${SKELETON_PATHS[raceId]}` : 'No skeleton'}
            </span>
          </div>

          {/* ROM path input */}
          <div className="flex gap-2 mb-3">
            <input type="text" value={romPath} onChange={e => setRomPath(e.target.value)}
              className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-gray-200 font-mono" placeholder="ROM/27/104.dat" />
            <button onClick={handleLoad} disabled={loading || skelLoading}
              className="px-4 py-2 bg-green-700 hover:bg-green-600 text-white text-sm rounded disabled:opacity-50">
              {loading ? 'Loading...' : 'Load & Parse'}
            </button>
          </div>

          {/* Presets — grouped by slot, paths resolve per race */}
          <div className="mb-4 space-y-1.5">
            {([7, 8, 9, 2, 3, 4, 5, 6] as number[]).map(slotId => {
              const slotPresets = PRESETS.filter(p => p.slotId === slotId)
              if (slotPresets.length === 0) return null
              return (
                <div key={slotId} className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-500 w-12 text-right shrink-0">{SLOT_NAMES[slotId]}</span>
                  <div className="flex flex-wrap gap-1">
                    {slotPresets.map(p => {
                      const path = resolvedPresets.get(`${p.slotId}:${p.modelId}`)
                      return (
                        <button key={`${p.slotId}:${p.modelId}`}
                          onClick={() => { if (path) { setRomPath(path); } }}
                          disabled={!path}
                          className={`px-2 py-0.5 text-[11px] rounded transition-colors ${
                            path
                              ? romPath === path
                                ? 'bg-blue-700 text-white border border-blue-600'
                                : 'bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300'
                              : 'bg-gray-900 border border-gray-800 text-gray-600 cursor-not-allowed'
                          }`}
                          title={path || 'No model data for this race'}
                        >
                          {p.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}

            {/* Face/Hair presets */}
            {facePaths.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-gray-500 w-12 text-right shrink-0">Face</span>
                <div className="flex flex-wrap gap-1">
                  {facePaths.map(f => (
                    <button key={f.path}
                      onClick={() => setRomPath(f.path)}
                      className={`px-2 py-0.5 text-[11px] rounded transition-colors ${
                        romPath === f.path
                          ? 'bg-blue-700 text-white border border-blue-600'
                          : 'bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300'
                      }`}
                    >
                      {f.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* NPC/Monster presets — self-contained DATs with embedded skeletons */}
            <div className="border-t border-gray-800 pt-1.5 mt-1.5">
              {([
                { label: 'NPCs / Monsters', items: [
                  { name: 'Carbuncle', path: 'ROM/97/66.dat' },
                  { name: 'Ifrit', path: 'ROM/97/68.dat' },
                  { name: 'Wyvern (Pet)', path: 'ROM/97/74.dat' },
                  { name: 'Dragon', path: 'ROM/5/62.dat' },
                  { name: 'Goblin', path: 'ROM/3/102.dat' },
                  { name: 'Tonberry', path: 'ROM/147/4.dat' },
                  { name: 'Crab', path: 'ROM/5/27.dat' },
                  { name: 'Mandragora', path: 'ROM/4/127.dat' },
                  { name: 'Rabbit', path: 'ROM/4/108.dat' },
                  { name: 'Bee', path: 'ROM/4/111.dat' },
                  { name: 'Sheep', path: 'ROM/5/19.dat' },
                  { name: 'Morbol', path: 'ROM/5/42.dat' },
                  { name: 'Treant', path: 'ROM/5/46.dat' },
                ]},
              ] as const).map(group => (
                <div key={group.label} className="flex items-center gap-2">
                  <span className="text-[10px] text-amber-500/70 w-12 text-right shrink-0">NPC</span>
                  <div className="flex flex-wrap gap-1">
                    {group.items.map(item => (
                      <button key={item.path}
                        onClick={() => setRomPath(item.path)}
                        className={`px-2 py-0.5 text-[11px] rounded transition-colors ${
                          romPath === item.path
                            ? 'bg-amber-700 text-white border border-amber-600'
                            : 'bg-gray-800 hover:bg-gray-700 border border-amber-900/40 text-gray-300'
                        }`}
                      >
                        {item.name}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* View mode + lighting toggle */}
          <div className="flex gap-2 mb-4 items-center">
            <button onClick={() => setViewMode('3d')}
              className={`px-3 py-1 text-xs rounded ${viewMode === '3d' ? 'bg-blue-700 text-white' : 'bg-gray-800 text-gray-400 border border-gray-700'}`}>
              3D View
            </button>
            <button onClick={() => setViewMode('wireframe')}
              className={`px-3 py-1 text-xs rounded ${viewMode === 'wireframe' ? 'bg-blue-700 text-white' : 'bg-gray-800 text-gray-400 border border-gray-700'}`}>
              Wireframe
            </button>
            <span className="w-px h-4 bg-gray-700 mx-1" />
            <button onClick={() => setLighting(l => l === 'standard' ? 'enhanced' : 'standard')}
              className={`px-3 py-1 text-xs rounded ${lighting === 'enhanced' ? 'bg-amber-700 text-white' : 'bg-gray-800 text-gray-400 border border-gray-700'}`}>
              {lighting === 'enhanced' ? 'Enhanced Lighting' : 'Lighting'}
            </button>
          </div>

          <div className="flex gap-4">
            {/* Viewer */}
            <div className="flex-1 h-[500px] bg-gray-900 border border-gray-700 rounded overflow-hidden">
              {viewMode === '3d' ? (
                meshData ? (
                  <ThreeModelViewer meshData={meshData} lighting={lighting} />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-600 text-sm">
                    {loading ? 'Parsing...' : 'Select an item and click "Load & Parse"'}
                  </div>
                )
              ) : (
                <canvas ref={canvasRef} width={600} height={500} className="w-full h-full" style={{ imageRendering: 'auto' }} />
              )}
            </div>

            {/* Parse log */}
            <div className="w-80 h-[500px] bg-gray-900 border border-gray-700 rounded p-3 overflow-y-auto">
              <h3 className="text-xs font-semibold text-gray-400 uppercase mb-2">Parse Log</h3>
              {parseLog.length === 0 && <p className="text-xs text-gray-600">Click "Load & Parse" to begin</p>}
              {parseLog.map((line, i) => (
                <p key={i} className={`text-xs font-mono leading-relaxed ${line.startsWith('Error') ? 'text-red-400' : line.startsWith('  ') ? 'text-gray-500' : 'text-gray-300'}`}>{line}</p>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

