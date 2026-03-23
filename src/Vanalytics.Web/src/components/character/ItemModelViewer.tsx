import { useState, useRef, useEffect, useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { useFfxiFileSystem } from '../../context/FfxiFileSystemContext'
import { parseDatFile, parseSkeletonDat, SKELETON_PATHS, modelToPath } from '../../lib/ffxi-dat'
import type { ParsedMesh, ParsedTexture, ParsedSkeleton } from '../../lib/ffxi-dat'
import { Settings, FolderOpen } from 'lucide-react'
import { Link } from 'react-router-dom'

const RACE_NAMES: Record<number, string> = {
  1: 'Hume Male', 2: 'Hume Female', 3: 'Elvaan Male', 4: 'Elvaan Female',
  5: 'Tarutaru Male', 6: 'Tarutaru Female', 7: 'Mithra', 8: 'Galka',
}

interface ModelMapping {
  itemId: number
  slotId: number
  modelId: number
}

let cachedMappings: ModelMapping[] | null = null
async function loadMappings(): Promise<ModelMapping[]> {
  if (cachedMappings) return cachedMappings
  const res = await fetch('/data/item-model-mappings.json')
  cachedMappings = await res.json()
  return cachedMappings!
}

interface ItemModelViewerProps {
  itemId: number
  category: string
  slots?: number | null
  skill?: number | null
}

/**
 * 3D model viewer for an item detail page.
 * Looks up the item directly in item-model-mappings.json to find its
 * slotId and modelId, then resolves the ROM path per race.
 * Only renders if the item has a model mapping.
 */
export default function ItemModelViewer({ itemId }: ItemModelViewerProps) {
  const ffxi = useFfxiFileSystem()
  const [raceId, setRaceId] = useState(1)
  const [skeleton, setSkeleton] = useState<ParsedSkeleton | null>(null)
  const [meshData, setMeshData] = useState<{ meshes: ParsedMesh[]; textures: ParsedTexture[] } | null>(null)
  const [parseLog, setParseLog] = useState<string[]>([])
  const [viewMode, setViewMode] = useState<'3d' | 'wireframe'>('3d')
  const [loading, setLoading] = useState(false)
  const [itemMapping, setItemMapping] = useState<ModelMapping | null | undefined>(undefined) // undefined = checking
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const log = (msg: string) => setParseLog(prev => [...prev, msg])

  // Look up this item in the model mappings (once)
  useEffect(() => {
    loadMappings().then(mappings => {
      const allMatches = mappings.filter(m => m.itemId === itemId)
      const mapping = allMatches[0] ?? null
      console.log(`[ItemModelViewer] itemId=${itemId}, matches=${allMatches.length}`, allMatches, '→ using:', mapping)
      setItemMapping(mapping)
    }).catch(() => setItemMapping(null))
  }, [itemId])

  // Load skeleton when race changes
  useEffect(() => {
    if (!ffxi.isAuthorized || !itemMapping) return
    const skelPath = SKELETON_PATHS[raceId]
    if (!skelPath) return

    ffxi.readFile(skelPath).then(buffer => {
      setSkeleton(parseSkeletonDat(buffer))
    }).catch(() => setSkeleton(null))
  }, [raceId, ffxi.isAuthorized, ffxi.readFile, itemMapping])

  // Auto-load model when race/skeleton changes
  useEffect(() => {
    if (!ffxi.isAuthorized || !itemMapping) return
    const { modelId, slotId } = itemMapping

    async function loadModel() {
      setParseLog([])
      setMeshData(null)
      setLoading(true)

      try {
        const romPath = await modelToPath(modelId, raceId, slotId)
        console.log(`[ItemModelViewer] modelToPath(${modelId}, ${raceId}, ${slotId}) → ${romPath}`)
        if (!romPath) {
          log(`No model data for ${RACE_NAMES[raceId]}`)
          setLoading(false)
          return
        }

        log(`${RACE_NAMES[raceId]} · ${romPath}`)
        const buffer = await ffxi.readFile(romPath)
        log(`${buffer.byteLength} bytes`)

        const dat = parseDatFile(buffer, skeleton?.matrices)

        dat.textures.forEach((t, i) => log(`Texture ${i}: ${t.width}x${t.height}`))
        dat.meshes.forEach((m, i) => {
          const v = m.vertices.length / 3, t = v / 3
          log(`Mesh ${i}: ${v} verts, ${Math.floor(t)} tris`)
        })

        if (dat.meshes.length > 0) {
          setMeshData({ meshes: dat.meshes, textures: dat.textures })
        } else {
          log('No mesh data found')
        }
      } catch (err) {
        log(`Error: ${err instanceof Error ? err.message : String(err)}`)
      } finally {
        setLoading(false)
      }
    }

    loadModel()
  }, [itemMapping, raceId, skeleton, ffxi.isAuthorized, ffxi.readFile])

  // 2D wireframe renderer
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

    const totalVerts = meshData.meshes.reduce((s, m) => s + m.vertices.length / 3, 0)
    ctx.fillStyle = '#888'; ctx.font = '11px monospace'
    ctx.fillText(`${totalVerts} verts, ${Math.floor(totalVerts / 3)} tris`, 8, h - 8)
  }, [meshData, viewMode])

  // Don't render if no mapping exists for this item
  if (itemMapping === undefined) return null // still checking
  if (itemMapping === null) return null // no model for this item

  if (!ffxi.isSupported) return null
  if (!ffxi.isConfigured) {
    return (
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-4 mb-6">
        <h2 className="text-sm font-semibold text-gray-400 mb-3">3D Model</h2>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <FolderOpen className="h-4 w-4 shrink-0" />
          <span>Configure your FFXI installation in</span>
          <Link to="/profile" className="text-blue-400 hover:text-blue-300 inline-flex items-center gap-1">
            <Settings className="h-3 w-3" /> Settings
          </Link>
          <span>to view 3D models</span>
        </div>
      </div>
    )
  }
  if (!ffxi.isAuthorized) {
    return (
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-4 mb-6">
        <h2 className="text-sm font-semibold text-gray-400 mb-3">3D Model</h2>
        <button onClick={ffxi.authorize} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded">
          Connect to FFXI Installation
        </button>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-4 mb-6">
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <h2 className="text-sm font-semibold text-gray-400">3D Model</h2>
        <select value={raceId} onChange={e => setRaceId(Number(e.target.value))}
          className="px-2 py-1 text-xs bg-gray-800 border border-gray-700 rounded text-gray-300">
          {Object.entries(RACE_NAMES).map(([id, name]) => (
            <option key={id} value={id}>{name}</option>
          ))}
        </select>
        <div className="flex gap-1 ml-auto">
          <button onClick={() => setViewMode('3d')}
            className={`px-2 py-0.5 text-[11px] rounded ${viewMode === '3d' ? 'bg-blue-700 text-white' : 'bg-gray-800 text-gray-400 border border-gray-700'}`}>
            3D
          </button>
          <button onClick={() => setViewMode('wireframe')}
            className={`px-2 py-0.5 text-[11px] rounded ${viewMode === 'wireframe' ? 'bg-blue-700 text-white' : 'bg-gray-800 text-gray-400 border border-gray-700'}`}>
            Wireframe
          </button>
        </div>
      </div>

      <div className="flex gap-3">
        <div className="flex-1 h-[350px] bg-gray-950 border border-gray-800 rounded overflow-hidden">
          {viewMode === '3d' ? (
            meshData ? (
              <ThreeViewer meshData={meshData} />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-600 text-xs">
                {loading ? 'Loading model...' : 'No model available'}
              </div>
            )
          ) : (
            <canvas ref={canvasRef} width={500} height={350} className="w-full h-full" />
          )}
        </div>

        <div className="w-56 h-[350px] bg-gray-950 border border-gray-800 rounded p-2 overflow-y-auto shrink-0">
          <h3 className="text-[10px] font-semibold text-gray-500 uppercase mb-1">Parse Log</h3>
          {parseLog.length === 0 && <p className="text-[10px] text-gray-700">{loading ? 'Loading...' : 'Waiting...'}</p>}
          {parseLog.map((line, i) => (
            <p key={i} className={`text-[10px] font-mono leading-relaxed ${line.startsWith('Error') ? 'text-red-400' : 'text-gray-500'}`}>{line}</p>
          ))}
        </div>
      </div>
    </div>
  )
}

function ThreeViewer({ meshData }: { meshData: { meshes: ParsedMesh[]; textures: ParsedTexture[] } }) {
  const sceneData = useMemo(() => {
    const geometries: THREE.BufferGeometry[] = []
    const materials: THREE.Material[] = []
    const bbox = new THREE.Box3()

    for (const mesh of meshData.meshes) {
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(mesh.vertices), 3))
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(mesh.uvs), 2))
      geometry.computeVertexNormals()
      geometry.computeBoundingBox()
      if (geometry.boundingBox) bbox.union(geometry.boundingBox)

      const tex = meshData.textures[mesh.materialIndex]
      let material: THREE.Material
      if (tex) {
        const texture = new THREE.DataTexture(new Uint8Array(tex.rgba), tex.width, tex.height, THREE.RGBAFormat)
        texture.needsUpdate = true
        texture.magFilter = THREE.NearestFilter
        texture.minFilter = THREE.NearestMipmapLinearFilter
        texture.flipY = false
        material = new THREE.MeshStandardMaterial({ map: texture, side: THREE.DoubleSide })
      } else {
        material = new THREE.MeshStandardMaterial({ color: 0x888888, side: THREE.DoubleSide })
      }

      geometries.push(geometry)
      materials.push(material)
    }

    const rawCenter = new THREE.Vector3()
    const size = new THREE.Vector3()
    bbox.getCenter(rawCenter)
    bbox.getSize(size)

    const flippedMinY = -bbox.max.y
    const flippedMaxY = -bbox.min.y
    const floorY = flippedMinY
    const center = new THREE.Vector3(rawCenter.x, (flippedMinY + flippedMaxY) / 2, -rawCenter.z)

    return { geometries, materials, center, size, floorY }
  }, [meshData])

  const maxDim = Math.max(sceneData.size.x, sceneData.size.y, sceneData.size.z) || 0.5
  const camDist = maxDim * 2.5

  useEffect(() => {
    return () => {
      sceneData.geometries.forEach(g => g.dispose())
      sceneData.materials.forEach(m => {
        if (m instanceof THREE.MeshStandardMaterial) { m.map?.dispose(); m.dispose() }
      })
    }
  }, [sceneData])

  const cx = sceneData.center.x, cy = sceneData.center.y, cz = sceneData.center.z

  return (
    <Canvas
      camera={{ position: [cx + camDist * 0.5, cy + camDist * 0.3, cz + camDist], fov: 45 }}
      gl={{ antialias: true }}
      className="w-full h-full"
    >
      <ambientLight intensity={0.5} color="#c8b8a0" />
      <directionalLight position={[2, 4, 3]} intensity={0.8} color="#fff0d8" />
      <directionalLight position={[-1, 2, -2]} intensity={0.3} color="#a0b8d0" />
      <OrbitControls target={[cx, cy, cz]} />
      <group rotation={[Math.PI, 0, 0]}>
        {sceneData.geometries.map((geo, i) => (
          <mesh key={i} geometry={geo} material={sceneData.materials[i]} />
        ))}
      </group>
      <gridHelper args={[maxDim * 3, 10, '#333', '#222']} position={[cx, sceneData.floorY, cz]} />
    </Canvas>
  )
}
