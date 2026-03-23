import { useMemo, useEffect, useRef } from 'react'
import { Canvas, useThree, useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import type { ParsedMesh, ParsedTexture } from '../../lib/ffxi-dat'

interface ThreeModelViewerProps {
  meshData: { meshes: ParsedMesh[]; textures: ParsedTexture[] }
  lighting?: 'standard' | 'enhanced'
}

export default function ThreeModelViewer({ meshData, lighting = 'standard' }: ThreeModelViewerProps) {
  const sceneData = useMemo(() => {
    const geometries: THREE.BufferGeometry[] = []
    const bbox = new THREE.Box3()

    for (const mesh of meshData.meshes) {
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(mesh.vertices), 3))
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(mesh.uvs), 2))
      geometry.computeVertexNormals()
      geometry.computeBoundingBox()
      if (geometry.boundingBox) bbox.union(geometry.boundingBox)
      geometries.push(geometry)
    }

    const rawCenter = new THREE.Vector3()
    const size = new THREE.Vector3()
    bbox.getCenter(rawCenter)
    bbox.getSize(size)

    const flippedMinY = -bbox.max.y
    const flippedMaxY = -bbox.min.y
    const floorY = flippedMinY
    const center = new THREE.Vector3(rawCenter.x, (flippedMinY + flippedMaxY) / 2, -rawCenter.z)

    return { geometries, center, size, floorY }
  }, [meshData])

  const materials = useMemo(() => {
    return meshData.meshes.map(mesh => {
      const tex = meshData.textures[mesh.materialIndex]
      if (tex) {
        const rgba = new Uint8Array(tex.rgba)
        const texture = new THREE.DataTexture(rgba, tex.width, tex.height, THREE.RGBAFormat)
        texture.needsUpdate = true
        texture.magFilter = THREE.NearestFilter
        texture.minFilter = THREE.NearestMipmapLinearFilter
        texture.flipY = false
        return new THREE.MeshStandardMaterial({
          map: texture,
          side: THREE.DoubleSide,
          metalness: 0,
          roughness: 1,
        })
      }
      return new THREE.MeshStandardMaterial({ color: 0x888888, side: THREE.DoubleSide })
    })
  }, [meshData])

  const maxDim = Math.max(sceneData.size.x, sceneData.size.y, sceneData.size.z) || 0.5
  const camDist = maxDim * 2.5

  useEffect(() => {
    return () => {
      sceneData.geometries.forEach(g => g.dispose())
      materials.forEach(m => {
        if (m instanceof THREE.MeshStandardMaterial) { m.map?.dispose(); m.dispose() }
      })
    }
  }, [sceneData, materials])

  const cx = sceneData.center.x, cy = sceneData.center.y, cz = sceneData.center.z

  return (
    <Canvas
      shadows={lighting === 'enhanced'}
      camera={{ position: [cx + camDist * 0.5, cy + camDist * 0.3, cz + camDist], fov: 45 }}
      gl={{ antialias: true }}
      className="w-full h-full"
    >
      {lighting === 'enhanced' ? (
        <EnhancedLighting center={[cx, cy, cz]} size={maxDim} floorY={sceneData.floorY} />
      ) : (
        <StandardLighting />
      )}

      <OrbitControls target={[cx, cy, cz]} />

      <group rotation={[Math.PI, 0, 0]}>
        {sceneData.geometries.map((geo, i) => (
          <mesh key={i} geometry={geo} material={materials[i]} castShadow receiveShadow />
        ))}
      </group>

      {/* Grid / floor */}
      {lighting === 'enhanced' ? (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, sceneData.floorY - 0.001, cz]} receiveShadow>
          <planeGeometry args={[maxDim * 4, maxDim * 4]} />
          <shadowMaterial opacity={0.3} />
        </mesh>
      ) : null}
      <gridHelper args={[maxDim * 3, 10, '#333', '#222']} position={[cx, sceneData.floorY, cz]} />
    </Canvas>
  )
}

function StandardLighting() {
  return (
    <>
      <ambientLight intensity={0.5} color="#c8b8a0" />
      <directionalLight position={[2, 4, 3]} intensity={0.8} color="#fff0d8" />
      <directionalLight position={[-1, 2, -2]} intensity={0.3} color="#a0b8d0" />
    </>
  )
}

/**
 * Enhanced lighting with a visible orbiting sun that casts real shadows.
 * The sun slowly orbits the model so the shadows move naturally.
 */
function EnhancedLighting({ center, size }: { center: [number, number, number]; size: number; floorY: number }) {
  const sunRef = useRef<THREE.DirectionalLight>(null)
  const { scene } = useThree()

  // Configure shadow map on mount
  useEffect(() => {
    const sun = sunRef.current
    if (!sun) return

    sun.shadow.mapSize.width = 1024
    sun.shadow.mapSize.height = 1024

    // Shadow camera covers the model area
    const range = size * 2
    sun.shadow.camera.left = -range
    sun.shadow.camera.right = range
    sun.shadow.camera.top = range
    sun.shadow.camera.bottom = -range
    sun.shadow.camera.near = 0.01
    sun.shadow.camera.far = size * 10
    sun.shadow.bias = -0.002
    sun.shadow.camera.updateProjectionMatrix()
  }, [size, scene])

  // Slowly orbit the sun around the model
  useFrame(({ clock }) => {
    const sun = sunRef.current
    if (!sun) return
    const t = clock.getElapsedTime() * 0.15
    const radius = size * 3
    sun.position.set(
      center[0] + Math.cos(t) * radius,
      center[1] + size * 2.5,
      center[2] + Math.sin(t) * radius,
    )
    sun.target.position.set(center[0], center[1], center[2])
    sun.target.updateMatrixWorld()
  })

  return (
    <>
      {/* Low ambient — just enough to see shadow areas */}
      <ambientLight intensity={0.25} color="#8090a8" />

      {/* Orbiting sunlight with shadows */}
      <directionalLight
        ref={sunRef}
        castShadow
        intensity={1.2}
        color="#ffe8c0"
      />

      {/* Subtle fill from below to prevent pitch-black undersides */}
      <directionalLight position={[0, -2, 0]} intensity={0.08} color="#606878" />

      {/* Sun indicator — small visible sphere showing light direction */}
      <SunIndicator sunRef={sunRef} />
    </>
  )
}

/** Small glowing sphere that follows the sun position */
function SunIndicator({ sunRef }: { sunRef: React.RefObject<THREE.DirectionalLight | null> }) {
  const meshRef = useRef<THREE.Mesh>(null)

  useFrame(() => {
    if (sunRef.current && meshRef.current) {
      meshRef.current.position.copy(sunRef.current.position)
    }
  })

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[0.01, 8, 8]} />
      <meshBasicMaterial color="#ffdd88" />
    </mesh>
  )
}
