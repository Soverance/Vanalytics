import type { ZoneSpawnDto } from '../../types/api'

interface SpawnMarkersProps {
  spawns: ZoneSpawnDto[]
  visible: boolean
  onHover?: (spawn: ZoneSpawnDto | null) => void
  onClick?: (spawn: ZoneSpawnDto) => void
}

export default function SpawnMarkers({ spawns, visible, onHover, onClick }: SpawnMarkersProps) {
  if (!visible || spawns.length === 0) return null

  return (
    <group>
      {spawns.map((spawn, i) => (
        <mesh
          key={i}
          position={[spawn.x, spawn.y, spawn.z]}
          onPointerOver={(e) => { e.stopPropagation(); onHover?.(spawn) }}
          onPointerOut={(e) => { e.stopPropagation(); onHover?.(null) }}
          onClick={(e) => { e.stopPropagation(); onClick?.(spawn) }}
        >
          <sphereGeometry args={[0.5, 8, 8]} />
          <meshBasicMaterial
            color={spawn.isMonster ? '#ff4444' : '#4488ff'}
            transparent
            opacity={0.7}
          />
        </mesh>
      ))}
    </group>
  )
}
