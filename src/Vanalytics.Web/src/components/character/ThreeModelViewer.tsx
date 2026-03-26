import { useMemo, useEffect, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import type { ParsedMesh, ParsedTexture, ParsedSkeleton, ParsedAnimation } from '../../lib/ffxi-dat'
import { useAnimationPlayback, type CpuSkinMesh } from '../../hooks/useAnimationPlayback'

interface ThreeModelViewerProps {
  meshData: { meshes: ParsedMesh[]; textures: ParsedTexture[] }
  skeleton?: ParsedSkeleton | null
  animations?: ParsedAnimation[]
  playing?: boolean
  speed?: number
  motionIndex?: number
  onAnimationFrame?: (frame: number, total: number) => void
  onMotionCount?: (count: number) => void
}

function AnimatedModel({
  meshData, skeleton, clip, playing, speed, onAnimationFrame,
}: {
  meshData: { meshes: ParsedMesh[]; textures: ParsedTexture[] }
  skeleton?: ParsedSkeleton | null
  clip: ParsedAnimation[]
  playing: boolean
  speed: number
  onAnimationFrame?: (frame: number, total: number) => void
}) {
  const [threeMeshes, setThreeMeshes] = useState<THREE.Mesh[]>([])
  const cpuSkinMeshesRef = useRef<CpuSkinMesh[]>([])
  const bindWorldMatricesRef = useRef<number[][] | null>(null)

  useEffect(() => {
    cpuSkinMeshesRef.current = []
    bindWorldMatricesRef.current = skeleton?.matrices ?? null

    const built: THREE.Mesh[] = []
    for (const mesh of meshData.meshes) {
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(mesh.vertices), 3))
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(mesh.uvs), 2))
      geometry.computeVertexNormals()

      const tex = meshData.textures[mesh.materialIndex]
      let material: THREE.Material
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
        material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide })
      } else {
        material = new THREE.MeshBasicMaterial({ color: 0x888888, side: THREE.DoubleSide })
      }

      const threeMesh = new THREE.Mesh(geometry, material)
      built.push(threeMesh)

      if (mesh.boneIndices.length > 0 && skeleton) {
        cpuSkinMeshesRef.current.push({
          geometry,
          origPositions: new Float32Array(mesh.vertices),
          boneIndices: mesh.boneIndices,
          dualBone: mesh.dualBoneLocalPos1 ? {
            localPos1: new Float32Array(mesh.dualBoneLocalPos1),
            localPos2: new Float32Array(mesh.dualBoneLocalPos2!),
            weights: new Float32Array(mesh.dualBoneWeights!),
          } : undefined,
        })
      }
    }

    setThreeMeshes(built)
    return () => {
      built.forEach(m => {
        m.geometry.dispose()
        if (m.material instanceof THREE.MeshBasicMaterial) {
          m.material.map?.dispose()
          m.material.dispose()
        }
      })
    }
  }, [meshData, skeleton])

  useAnimationPlayback({
    animations: clip,
    skeleton: skeleton ?? null,
    bindWorldMatrices: bindWorldMatricesRef.current,
    meshes: cpuSkinMeshesRef.current,
    playing,
    speed,
    onFrameUpdate: onAnimationFrame,
  })

  return (
    <group rotation={[Math.PI, 0, 0]}>
      {threeMeshes.map((mesh, i) => (
        <primitive key={i} object={mesh} />
      ))}
    </group>
  )
}

export default function ThreeModelViewer({
  meshData, skeleton, animations,
  playing, speed, motionIndex,
  onAnimationFrame, onMotionCount,
}: ThreeModelViewerProps) {
  const groupedAnimations = useMemo(() => {
    if (!animations || animations.length === 0) return []
    const motionGroups: ParsedAnimation[][] = []
    let currentGroup: ParsedAnimation[] = []
    let currentBones = new Set<number>()
    for (const block of animations) {
      const matchesTiming = currentGroup.length === 0 ||
        (block.frameCount === currentGroup[0].frameCount &&
         Math.abs(block.speed - currentGroup[0].speed) < 0.001)
      const hasOverlap = block.bones.some(b => currentBones.has(b.boneIndex))
      if (matchesTiming && !hasOverlap) {
        currentGroup.push(block)
        for (const b of block.bones) currentBones.add(b.boneIndex)
      } else {
        if (currentGroup.length > 0) motionGroups.push(currentGroup)
        currentGroup = [block]
        currentBones = new Set(block.bones.map(b => b.boneIndex))
      }
    }
    if (currentGroup.length > 0) motionGroups.push(currentGroup)
    return motionGroups
  }, [animations])

  useEffect(() => {
    onMotionCount?.(groupedAnimations.length)
  }, [groupedAnimations.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const clip = groupedAnimations[motionIndex ?? 0] ?? groupedAnimations[0] ?? []

  const { center, maxDim, floorY } = useMemo(() => {
    const bbox = new THREE.Box3()
    for (const mesh of meshData.meshes) {
      const verts = mesh.vertices
      for (let i = 0; i < verts.length; i += 3) {
        bbox.expandByPoint(new THREE.Vector3(verts[i], verts[i+1], verts[i+2]))
      }
    }
    const rawCenter = new THREE.Vector3()
    const sz = new THREE.Vector3()
    bbox.getCenter(rawCenter)
    bbox.getSize(sz)
    const flippedMinY = -bbox.max.y
    const flippedMaxY = -bbox.min.y
    return {
      center: new THREE.Vector3(rawCenter.x, (flippedMinY + flippedMaxY) / 2, -rawCenter.z),
      maxDim: Math.max(sz.x, sz.y, sz.z) || 0.5,
      floorY: flippedMinY,
    }
  }, [meshData])

  const camDist = maxDim * 2.5
  const cx = center.x, cy = center.y, cz = center.z

  return (
    <Canvas
      camera={{ position: [cx + camDist * 0.5, cy + camDist * 0.3, cz + camDist], fov: 45 }}
      gl={{ antialias: true }}
      className="w-full h-full"
    >
      <color attach="background" args={['#1a1a2e']} />
      <OrbitControls target={[cx, cy, cz]} />
      <AnimatedModel
        meshData={meshData}
        skeleton={skeleton}
        clip={clip}
        playing={playing ?? false}
        speed={speed ?? 1.0}
        onAnimationFrame={onAnimationFrame}
      />
      <gridHelper args={[maxDim * 3, 10, '#333', '#222']} position={[cx, floorY, cz]} />
    </Canvas>
  )
}
