import { useState, useRef, useEffect, useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { useFfxiFileSystem } from '../context/FfxiFileSystemContext'
import { parseDatFile, parseSkeletonDat, SKELETON_PATHS } from '../lib/ffxi-dat'
import type { ParsedMesh, ParsedTexture, ParsedSkeleton } from '../lib/ffxi-dat'

/**
 * Debug page for testing the DAT parser and 3D renderer.
 * Route: /debug/models
 */
export default function ModelDebugPage() {
  const ffxi = useFfxiFileSystem()
  const [romPath, setRomPath] = useState('ROM/27/104.dat')
  const [parseLog, setParseLog] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [meshData, setMeshData] = useState<{ meshes: ParsedMesh[]; textures: ParsedTexture[] } | null>(null)
  const [viewMode, setViewMode] = useState<'3d' | 'wireframe'>('3d')
  const [raceId, setRaceId] = useState(1) // Default: Hume Male
  const [skeleton, setSkeleton] = useState<ParsedSkeleton | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const log = (msg: string) => setParseLog(prev => [...prev, msg])

  // Load skeleton when race changes
  useEffect(() => {
    if (!ffxi.isAuthorized) return
    const skelPath = SKELETON_PATHS[raceId]
    if (!skelPath) return

    ffxi.readFile(skelPath).then(buffer => {
      const skel = parseSkeletonDat(buffer)
      setSkeleton(skel)
      console.log(`[Skeleton] Loaded ${skelPath}: ${skel?.bones.length ?? 0} bones`)
    }).catch(err => {
      console.warn('Failed to load skeleton:', err)
      setSkeleton(null)
    })
  }, [raceId, ffxi.isAuthorized, ffxi.readFile])

  const handleLoad = async () => {
    setParseLog([])
    setMeshData(null)
    setLoading(true)

    try {
      log(`Reading ${romPath}...`)
      const buffer = await ffxi.readFile(romPath)
      log(`Read ${buffer.byteLength} bytes`)

      if (skeleton) {
        log(`Using skeleton: ${skeleton.bones.length} bones (race ${raceId})`)
      } else {
        log('No skeleton loaded — vertices will not be bone-transformed')
      }

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

    const w = canvas.width
    const h = canvas.height
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
      const v = mesh.vertices, idx = mesh.indices
      for (let i = 0; i < idx.length; i += 3) {
        const a = project(v[idx[i] * 3], v[idx[i] * 3 + 1])
        const b = project(v[idx[i + 1] * 3], v[idx[i + 1] * 3 + 1])
        const c = project(v[idx[i + 2] * 3], v[idx[i + 2] * 3 + 1])
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
    ctx.fillText(`${allVerts.length} verts, ${meshData.meshes.reduce((s, m) => s + m.indices.length / 3, 0)} tris`, 8, h - 8)
  }, [meshData, viewMode])

  const presets = [
    { label: 'Head: Leather Bandana', path: 'ROM/27/104.dat' },
    { label: 'Body: Leather Vest', path: 'ROM/28/8.dat' },
    { label: 'Hands: Leather Gloves', path: 'ROM/28/53.dat' },
    { label: 'Legs: Leather Trousers', path: 'ROM/28/85.dat' },
    { label: 'Feet: Leather Highboots', path: 'ROM/28/117.dat' },
    { label: 'Weapon: Colichemarde', path: 'ROM/30/26.dat' },
  ]

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
          <div className="flex gap-2 mb-3">
            <input type="text" value={romPath} onChange={e => setRomPath(e.target.value)}
              className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-gray-200" placeholder="ROM/27/104.dat" />
            <button onClick={handleLoad} disabled={loading}
              className="px-4 py-2 bg-green-700 hover:bg-green-600 text-white text-sm rounded disabled:opacity-50">
              {loading ? 'Loading...' : 'Load & Parse'}
            </button>
          </div>

          <div className="flex flex-wrap gap-2 mb-4">
            {presets.map(p => (
              <button key={p.path} onClick={() => setRomPath(p.path)}
                className="px-2 py-1 text-xs bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded text-gray-300">{p.label}</button>
            ))}
          </div>

          {/* Race selector */}
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xs text-gray-400">Skeleton:</span>
            <select value={raceId} onChange={e => setRaceId(Number(e.target.value))}
              className="px-2 py-1 text-xs bg-gray-800 border border-gray-700 rounded text-gray-300">
              <option value={1}>Hume Male</option>
              <option value={2}>Hume Female</option>
              <option value={3}>Elvaan Male</option>
              <option value={4}>Elvaan Female</option>
              <option value={5}>Tarutaru</option>
              <option value={7}>Mithra</option>
              <option value={8}>Galka</option>
            </select>
            <span className="text-[10px] text-gray-600">
              {skeleton ? `${skeleton.bones.length} bones loaded` : 'Loading...'}
            </span>
            <span className="text-[10px] text-amber-600/70 ml-2">
              Skeleton must match the equipment DAT's race
            </span>
          </div>

          {/* View mode toggle */}
          <div className="flex gap-2 mb-4">
            <button onClick={() => setViewMode('3d')}
              className={`px-3 py-1 text-xs rounded ${viewMode === '3d' ? 'bg-blue-700 text-white' : 'bg-gray-800 text-gray-400 border border-gray-700'}`}>
              3D View
            </button>
            <button onClick={() => setViewMode('wireframe')}
              className={`px-3 py-1 text-xs rounded ${viewMode === 'wireframe' ? 'bg-blue-700 text-white' : 'bg-gray-800 text-gray-400 border border-gray-700'}`}>
              Wireframe
            </button>
          </div>

          <div className="flex gap-4">
            {/* Viewer */}
            <div className="flex-1 h-[500px] bg-gray-900 border border-gray-700 rounded overflow-hidden">
              {viewMode === '3d' ? (
                meshData ? (
                  <ThreeViewer meshData={meshData} />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-600 text-sm">Load a DAT file to render</div>
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

/**
 * Three.js viewer — auto-centers, auto-scales, and mirrors equipment meshes.
 */
function ThreeViewer({ meshData }: { meshData: { meshes: ParsedMesh[]; textures: ParsedTexture[] } }) {
  const sceneData = useMemo(() => {
    const geometries: THREE.BufferGeometry[] = []
    const materials: THREE.Material[] = []
    const bbox = new THREE.Box3()

    for (const mesh of meshData.meshes) {
      const positions = new Float32Array(mesh.vertices)
      const uvs = new Float32Array(mesh.uvs)

      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
      geometry.computeVertexNormals()
      geometry.computeBoundingBox()
      if (geometry.boundingBox) bbox.union(geometry.boundingBox)

      const tex = meshData.textures[mesh.materialIndex]
      let material: THREE.Material
      if (tex) {
        const rgba = new Uint8Array(tex.rgba)
        const texture = new THREE.DataTexture(rgba, tex.width, tex.height, THREE.RGBAFormat)
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

    // After 180° X rotation: Y and Z flip sign
    // Flipped bbox: minY becomes -maxY, maxY becomes -minY
    const flippedMinY = -bbox.max.y
    const flippedMaxY = -bbox.min.y
    const floorY = flippedMinY  // bottom of the model after rotation

    // Center for orbit target: center X/Z stay, Y is midpoint of flipped range
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

      {/* Rotate 180° on X to flip from FFXI coordinate system to Three.js Y-up */}
      <group rotation={[Math.PI, 0, 0]}>
        {sceneData.geometries.map((geo, i) => (
          <mesh key={i} geometry={geo} material={sceneData.materials[i]} />
        ))}
      </group>

      <gridHelper args={[maxDim * 3, 10, '#333', '#222']} position={[cx, sceneData.floorY, cz]} />
    </Canvas>
  )
}
