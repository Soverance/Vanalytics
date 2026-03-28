import { useRef, useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import type { ZoneSpawnDto } from '../../types/api'

interface SpawnMarkersProps {
  spawns: ZoneSpawnDto[]
  visible: boolean
  onHover?: (spawn: ZoneSpawnDto | null, screenPos?: { x: number; y: number }) => void
}

const SPHERE_RADIUS = 0.5
const SPHERE_SEGMENTS = 8

const COLORS = {
  monster: new THREE.Color('#ff4444'),
  npc: new THREE.Color('#4488ff'),
  unknown: new THREE.Color('#44cc88'),
}

function getColor(spawn: ZoneSpawnDto): THREE.Color {
  return spawn.isMonster === true ? COLORS.monster : spawn.isMonster === false ? COLORS.npc : COLORS.unknown
}

export default function SpawnMarkers({ spawns, visible, onHover }: SpawnMarkersProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const { raycaster, pointer, camera, gl } = useThree()
  const hoveredId = useRef<number | null>(null)
  const mousePos = useRef({ x: 0, y: 0 })

  const geometry = useMemo(() => new THREE.SphereGeometry(SPHERE_RADIUS, SPHERE_SEGMENTS, SPHERE_SEGMENTS), [])
  const material = useMemo(() => new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0.7,
  }), [])

  // Track real mouse position for tooltip placement
  useEffect(() => {
    const handler = (e: MouseEvent) => { mousePos.current = { x: e.clientX, y: e.clientY } }
    gl.domElement.addEventListener('mousemove', handler)
    return () => gl.domElement.removeEventListener('mousemove', handler)
  }, [gl])

  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh || spawns.length === 0) return

    const dummy = new THREE.Object3D()
    const color = new THREE.Color()

    for (let i = 0; i < spawns.length; i++) {
      const s = spawns[i]
      dummy.position.set(s.x, s.y, s.z)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
      mesh.setColorAt(i, color.copy(getColor(s)))
    }

    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingBox()
    mesh.computeBoundingSphere()
  }, [spawns])

  // Manual raycasting each frame — more reliable than R3F pointer events for instanced meshes
  useFrame(() => {
    const mesh = meshRef.current
    if (!mesh || !visible || spawns.length === 0 || document.pointerLockElement) {
      if (hoveredId.current !== null) {
        hoveredId.current = null
        onHover?.(null)
      }
      return
    }

    raycaster.setFromCamera(pointer, camera)
    const hits = raycaster.intersectObject(mesh)

    if (hits.length > 0 && hits[0].instanceId != null) {
      const id = hits[0].instanceId
      if (id !== hoveredId.current) {
        hoveredId.current = id
        onHover?.(spawns[id], mousePos.current)
      } else {
        // Same instance, just update position
        onHover?.(spawns[id], mousePos.current)
      }
    } else if (hoveredId.current !== null) {
      hoveredId.current = null
      onHover?.(null)
    }
  })

  if (!visible || spawns.length === 0) return null

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, spawns.length]}
      frustumCulled={false}
    />
  )
}
