import { useMemo, useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import type { ParsedMesh, ParsedTexture } from '../../lib/ffxi-dat'

interface ThreeModelViewerProps {
  meshData: { meshes: ParsedMesh[]; textures: ParsedTexture[] }
}

export default function ThreeModelViewer({ meshData }: ThreeModelViewerProps) {
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
        texture.wrapS = THREE.RepeatWrapping
        texture.wrapT = THREE.RepeatWrapping
        texture.needsUpdate = true
        texture.magFilter = THREE.LinearFilter
        texture.minFilter = THREE.LinearMipmapLinearFilter
        texture.generateMipmaps = true
        texture.flipY = false
        return new THREE.MeshBasicMaterial({
          map: texture,
          side: THREE.DoubleSide,
        })
      }
      return new THREE.MeshBasicMaterial({ color: 0x888888, side: THREE.DoubleSide })
    })
  }, [meshData])

  const maxDim = Math.max(sceneData.size.x, sceneData.size.y, sceneData.size.z) || 0.5
  const camDist = maxDim * 2.5

  useEffect(() => {
    return () => {
      sceneData.geometries.forEach(g => g.dispose())
      materials.forEach(m => { m.map?.dispose(); m.dispose() })
    }
  }, [sceneData, materials])

  const cx = sceneData.center.x, cy = sceneData.center.y, cz = sceneData.center.z

  return (
    <Canvas
      camera={{ position: [cx + camDist * 0.5, cy + camDist * 0.3, cz + camDist], fov: 45 }}
      gl={{ antialias: true }}
      className="w-full h-full"
    >
      <color attach="background" args={['#1a1a2e']} />

      <OrbitControls target={[cx, cy, cz]} />

      <group rotation={[Math.PI, 0, 0]}>
        {sceneData.geometries.map((geo, i) => (
          <mesh key={i} geometry={geo} material={materials[i]} />
        ))}
      </group>

      <gridHelper args={[maxDim * 3, 10, '#333', '#222']} position={[cx, sceneData.floorY, cz]} />
    </Canvas>
  )
}
