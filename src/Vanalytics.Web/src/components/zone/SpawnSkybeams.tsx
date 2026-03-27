// src/Vanalytics.Web/src/components/zone/SpawnSkybeams.tsx
import { useMemo } from 'react'
import * as THREE from 'three'
import type { ZoneSpawnDto } from '../../types/api'

interface SpawnSkybeamsProps {
  spawns: ZoneSpawnDto[]
}

const BEAM_HEIGHT = 80
const BEAM_RADIUS = 0.3

export default function SpawnSkybeams({ spawns }: SpawnSkybeamsProps) {
  const geometry = useMemo(() => new THREE.CylinderGeometry(BEAM_RADIUS, BEAM_RADIUS, BEAM_HEIGHT, 6), [])

  const monsterMaterial = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#ff4444',
    transparent: true,
    opacity: 0.15,
    side: THREE.DoubleSide,
    depthWrite: false,
  }), [])

  const npcMaterial = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#4488ff',
    transparent: true,
    opacity: 0.15,
    side: THREE.DoubleSide,
    depthWrite: false,
  }), [])

  return (
    <group>
      {spawns.map((spawn, i) => (
        <mesh
          key={i}
          position={[spawn.x, spawn.y + BEAM_HEIGHT / 2, spawn.z]}
          geometry={geometry}
          material={spawn.isMonster ? monsterMaterial : npcMaterial}
        />
      ))}
    </group>
  )
}
