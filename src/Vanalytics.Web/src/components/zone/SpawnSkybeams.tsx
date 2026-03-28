import { useRef, useEffect, useMemo } from 'react'
import * as THREE from 'three'
import type { ZoneSpawnDto } from '../../types/api'

const BEAM_HEIGHT = 120
const BEAM_RADIUS = 1.0

const COLORS = {
  monster: new THREE.Color('#ff4444'),
  npc: new THREE.Color('#4488ff'),
  unknown: new THREE.Color('#44cc88'),
}

function getColor(spawn: ZoneSpawnDto): THREE.Color {
  return spawn.isMonster === true ? COLORS.monster : spawn.isMonster === false ? COLORS.npc : COLORS.unknown
}

interface SpawnSkybeamsProps {
  spawns: ZoneSpawnDto[]
}

export default function SpawnSkybeams({ spawns }: SpawnSkybeamsProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const geometry = useMemo(() => new THREE.CylinderGeometry(BEAM_RADIUS, BEAM_RADIUS, BEAM_HEIGHT, 6), [])
  const material = useMemo(() => new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0.35,
    side: THREE.DoubleSide,
    depthWrite: false,
  }), [])

  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh || spawns.length === 0) return

    const dummy = new THREE.Object3D()
    const color = new THREE.Color()

    for (let i = 0; i < spawns.length; i++) {
      const s = spawns[i]
      dummy.position.set(s.x, s.y - BEAM_HEIGHT / 2, s.z)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
      mesh.setColorAt(i, color.copy(getColor(s)))
    }

    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [spawns])

  if (spawns.length === 0) return null

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, spawns.length]}
      frustumCulled={false}
    />
  )
}
